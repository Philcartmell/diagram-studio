#!/usr/bin/env node
/**
 * diagram-studio CLI. Machine-readable JSON goes to stdout, human messages to
 * stderr. Exit codes: 0 success, 1 validation errors, 2 QA errors.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exampleFiles, listTypes } from './catalog.js';
import { type Format, isFailure, prepare, readSpecFile, render } from './pipeline.js';
import { iconNames } from './render/icons.js';
import { catalogInfo, searchServices } from './azure/icons.js';
import { importAzure } from './azure/import.js';
import { DIAGRAM_TYPES, type DiagramType } from './spec.js';
import { findTheme, listThemes, loadDefaults } from './theme/load.js';
import { DiagramError, closest, dirs } from './util.js';
import { validateSpec } from './validate/spec.js';
import { validateThemeFile } from './validate/theme.js';

const VALUE_FLAGS = new Set([
  'out', 'theme', 'scale', 'n', 'id', 'name', 'colors', 'primary', 'secondary', 'font', 'font-regular',
  'font-semibold', 'font-bold', 'background', 'style', 'description', 'altitude', 'port', 'limit', 'title',
]);

interface Args {
  pos: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) flags[key] = a.slice(eq + 1);
      else if (VALUE_FLAGS.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
      else flags[key] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function out(obj: unknown) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function err(msg: string) {
  process.stderr.write(msg + '\n');
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

const HELP = `diagram-studio — boardroom-quality diagrams from a JSON spec

Usage:
  diagram-studio render <spec.json> [--png --pdf --pptx --drawio | --all] [--out dir] [--theme id]
                        [--scale 1|2|3] [--transparent] [--force] [--no-preview]
  diagram-studio validate <spec.json> [--theme id]
  diagram-studio check <spec.json> [--theme id]
  diagram-studio types
  diagram-studio example <type> [--n 1]
  diagram-studio icons
  diagram-studio azure icons [words…] [--limit 25]
  diagram-studio azure import <arm-template.json | resource-list.json> [--out spec.json] [--title "…"]
  diagram-studio docs [topic]
  diagram-studio preview <dir> [--port 4740] [--open]
  diagram-studio version
  diagram-studio theme list
  diagram-studio theme preview <id> [--out dir]
  diagram-studio theme validate <file.theme.json | id>
  diagram-studio theme default [id] [--altitude executive|management|detailed]
  diagram-studio theme create --from-brand --id <id> --colors "#hex[,#hex[,#hex]]"
                        [--font "Name"] [--name "Brand"] [--font-regular f.ttf --font-semibold f.ttf]
                        [--background "#hex"] [--style clean|sketch]

JSON results go to stdout (example and docs <topic> print the document itself); messages to stderr.
Exit: 0 ok, 1 validation errors, 2 QA errors. preview runs until Ctrl+C.`;

function printIssues(label: string, list: { message: string; hint?: string }[]) {
  if (!list.length) return;
  err(`${label}:`);
  for (const i of list) err(`  - ${i.message}${i.hint ? `\n    fix: ${i.hint}` : ''}`);
}

async function cmdRender(a: Args): Promise<number> {
  const file = a.pos[1];
  if (!file) throw new DiagramError('render needs a spec file: diagram-studio render diagram.json', 'usage');
  const all = !!a.flags.all;
  const formats: Format[] = ['svg'];
  for (const f of ['png', 'pdf', 'pptx', 'drawio'] as Format[]) if (all || a.flags[f]) formats.push(f);
  const scale = str(a.flags.scale) ? Number(a.flags.scale) : undefined;
  if (scale !== undefined && ![1, 2, 3].includes(scale)) throw new DiagramError('--scale must be 1, 2 or 3', 'usage');
  const outDir = path.resolve(str(a.flags.out) ?? path.dirname(path.resolve(file)));
  const t0 = Date.now();
  const summary = await render(readSpecFile(file), {
    theme: str(a.flags.theme),
    outDir,
    formats,
    scale,
    transparent: !!a.flags.transparent,
    force: !!a.flags.force,
    preview: !a.flags['no-preview'],
    specPath: path.resolve(file),
  });
  out({ ...summary, ms: Date.now() - t0 });
  printIssues('Errors', summary.errors);
  printIssues('Warnings', summary.warnings);
  if (summary.files.length) {
    err(`Wrote ${summary.files.length} file(s) to ${outDir}:`);
    for (const f of summary.files) err(`  ${path.basename(f.path)}  (${(f.bytes / 1024).toFixed(1)} KB)`);
  }
  for (const n of summary.notes) err(`Note: ${n}`);
  if (summary.exitCode === 0) err(`OK: rendered "${summary.title}" (${summary.type}, ${summary.theme}). Now view preview.png and run the self-review checklist.`);
  else if (summary.exitCode === 1) err('Validation failed: edit the spec and run render again.');
  else err('QA failed: edit the spec (never the SVG) and run render again.');
  return summary.exitCode;
}

async function cmdValidate(a: Args): Promise<number> {
  const file = a.pos[1];
  if (!file) throw new DiagramError('validate needs a spec file', 'usage');
  const raw = readSpecFile(file);
  if (raw && typeof raw === 'object' && '__parseError' in raw) {
    const e = [{ path: 'spec', code: 'json', message: String((raw as { __parseError: string }).__parseError) }];
    out({ ok: false, errors: e, warnings: [] });
    printIssues('Errors', e);
    return 1;
  }
  const r = validateSpec(raw, { theme: str(a.flags.theme) });
  out({ ok: r.ok, errors: r.errors, warnings: r.warnings });
  printIssues('Errors', r.errors);
  printIssues('Warnings', r.warnings);
  if (r.ok) err('Valid.');
  return r.ok ? 0 : 1;
}

async function cmdCheck(a: Args): Promise<number> {
  const file = a.pos[1];
  if (!file) throw new DiagramError('check needs a spec file', 'usage');
  const p = await prepare(readSpecFile(file), { theme: str(a.flags.theme) });
  if (isFailure(p)) {
    out({ ok: false, stage: 'validate', errors: p.validationErrors, warnings: p.warnings });
    printIssues('Errors', p.validationErrors);
    return 1;
  }
  out({ ok: p.errors.length === 0, stage: 'check', canvas: { width: p.scene.width, height: p.scene.height }, errors: p.errors, warnings: p.warnings });
  printIssues('Errors', p.errors);
  printIssues('Warnings', p.warnings);
  if (!p.errors.length) err(p.warnings.length ? 'Clean (with warnings).' : 'Clean.');
  return p.errors.length ? 2 : 0;
}

function cmdTypes(): number {
  const types = listTypes();
  out({ types });
  for (const t of types) err(`${t.type.padEnd(22)} ${t.summary}`);
  return 0;
}

function cmdExample(a: Args): number {
  const type = a.pos[1] as DiagramType;
  if (!DIAGRAM_TYPES.includes(type)) {
    const g = closest(type ?? '', [...DIAGRAM_TYPES]);
    throw new DiagramError(`Unknown type "${type ?? ''}".${g ? ` Did you mean "${g}"?` : ''} Types: ${DIAGRAM_TYPES.join(', ')}`, 'usage');
  }
  const files = exampleFiles(type);
  if (!files.length) throw new DiagramError(`No examples bundled for ${type}.`, 'io');
  const n = Math.max(1, Math.min(files.length, Number(str(a.flags.n) ?? 1)));
  process.stdout.write(fs.readFileSync(files[n - 1], 'utf8'));
  err(`Example ${n} of ${files.length} for ${type} (${path.basename(files[n - 1])}).`);
  return 0;
}

/** Guides that ship with the renderer: SKILL.md as "guide", then every references/*.md by name. */
function docTopics(): { topic: string; file: string }[] {
  const refs = fs
    .readdirSync(path.join(dirs.root, 'references'))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ topic: f.replace(/\.md$/, ''), file: path.join(dirs.root, 'references', f) }));
  return [{ topic: 'guide', file: path.join(dirs.root, 'SKILL.md') }, ...refs];
}

function cmdDocs(a: Args): number {
  const topics = docTopics();
  const want = a.pos[1];
  if (!want) {
    out({ root: dirs.root, topics });
    err(`Topics: ${topics.map((t) => t.topic).join(', ')}`);
    return 0;
  }
  const hit = topics.find((t) => t.topic === want);
  if (!hit) {
    const g = closest(want, topics.map((t) => t.topic));
    throw new DiagramError(`Unknown docs topic "${want}".${g ? ` Did you mean "${g}"?` : ''} Topics: ${topics.map((t) => t.topic).join(', ')}`, 'usage');
  }
  process.stdout.write(fs.readFileSync(hit.file, 'utf8'));
  return 0;
}

function cmdVersion(): number {
  const pkg = JSON.parse(fs.readFileSync(path.join(dirs.root, 'package.json'), 'utf8')) as { version: string };
  out({ version: pkg.version, root: dirs.root, user: dirs.user, node: process.versions.node });
  err(`diagram-studio ${pkg.version} (${dirs.root}); your themes, defaults and icons: ${dirs.user}`);
  return 0;
}

function openInBrowser(url: string) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    .on('error', () => err(`Could not open a browser; visit ${url}`))
    .unref();
}

async function cmdPreview(a: Args): Promise<number> {
  const dir = a.pos[1];
  if (!dir) throw new DiagramError('preview needs a folder: diagram-studio preview diagrams/my-session', 'usage');
  const port = str(a.flags.port) !== undefined ? Number(a.flags.port) : undefined;
  if (port !== undefined && !(Number.isInteger(port) && port >= 0 && port < 65536)) throw new DiagramError('--port must be a port number', 'usage');
  const { startPreview } = await import('./preview/server.js');
  const server = await startPreview(dir, { port });
  out({ ok: true, url: server.url, dir: server.dir });
  err(`Preview board for ${server.dir} at ${server.url} (Ctrl+C to stop)`);
  if (a.flags.open) openInBrowser(server.url);
  await new Promise<void>((resolve) => {
    const stop = () => void server.close().then(resolve);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
}

async function cmdTheme(a: Args): Promise<number> {
  const sub = a.pos[1];
  if (sub === 'list') {
    const themes = listThemes().map((t) => ({ id: t.id, name: t.name, description: t.description, builtIn: t.builtIn, file: t.builtIn ? path.relative(dirs.root, t.file) : t.file }));
    out({ themes });
    for (const t of themes) err(`${t.id.padEnd(14)} ${t.builtIn ? '' : '[custom] '}${t.description ?? t.name}`);
    return 0;
  }
  if (sub === 'validate') {
    const target = a.pos[2];
    if (!target) throw new DiagramError('theme validate needs a file or theme id', 'usage');
    const file = fs.existsSync(target) ? target : findTheme(target)?.file;
    if (!file) throw new DiagramError(`No theme file or id "${target}".`, 'usage');
    const r = validateThemeFile(file);
    out({ ok: r.ok, file, errors: r.errors, warnings: r.warnings, contrast: r.contrast });
    printIssues('Errors', r.errors);
    printIssues('Warnings', r.warnings);
    if (r.ok) err(`Theme is valid. Contrast: ${Object.entries(r.contrast).map(([k, v]) => `${k} ${v}:1`).join(', ')}`);
    return r.ok ? 0 : 1;
  }
  if (sub === 'preview') {
    const id = a.pos[2];
    if (!id) throw new DiagramError('theme preview needs a theme id', 'usage');
    const { themePreview } = await import('./theme/preview.js');
    const outDir = path.resolve(str(a.flags.out) ?? '.');
    const r = await themePreview(id, outDir);
    out(r);
    err(`Contact sheet: ${r.file}`);
    for (const p of r.problems) err(`  ${p}`);
    return r.problems.length ? 2 : 0;
  }
  if (sub === 'create') {
    if (!a.flags['from-brand']) throw new DiagramError('theme create currently supports --from-brand', 'usage');
    const { createBrandTheme } = await import('./theme/brand.js');
    const r = createBrandTheme({
      id: str(a.flags.id),
      name: str(a.flags.name),
      colors: str(a.flags.colors) ?? [str(a.flags.primary), str(a.flags.secondary)].filter(Boolean).join(','),
      font: str(a.flags.font),
      fontFiles: { regular: str(a.flags['font-regular']), semibold: str(a.flags['font-semibold']), bold: str(a.flags['font-bold']) },
      background: str(a.flags.background),
      style: str(a.flags.style) as 'clean' | 'sketch' | undefined,
      description: str(a.flags.description),
    });
    out(r);
    printIssues('Errors', r.errors);
    for (const n of r.notes) err(`Note: ${n}`);
    if (r.ok) err(`Saved theme "${r.id}" to ${r.file}`);
    return r.ok ? 0 : 1;
  }
  if (sub === 'default') {
    const id = a.pos[2];
    const altitude = str(a.flags.altitude);
    if (!id && !altitude) {
      out({ defaults: loadDefaults() });
      return 0;
    }
    if (id && !findTheme(id)) throw new DiagramError(`Theme "${id}" was not found.`, 'usage');
    if (altitude && !['executive', 'management', 'detailed'].includes(altitude)) throw new DiagramError('--altitude must be executive, management or detailed', 'usage');
    const next = { ...loadDefaults(), ...(id ? { theme: id } : {}), ...(altitude ? { altitude } : {}) };
    fs.mkdirSync(dirs.user, { recursive: true });
    const file = dirs.defaults;
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    out({ ok: true, file, defaults: next });
    err(`Defaults saved: ${JSON.stringify(next)}`);
    return 0;
  }
  throw new DiagramError('theme commands: list, preview <id>, validate <file|id>, create --from-brand, default [id] [--altitude a]', 'usage');
}

/** Azure helpers: search the official icon catalog; draft a spec from ARM or a resource list. */
async function cmdAzure(a: Args): Promise<number> {
  const sub = a.pos[1];
  if (sub === 'icons') {
    const query = a.pos.slice(2).join(' ');
    const limit = str(a.flags.limit) ? Number(a.flags.limit) : 25;
    const results = searchServices(query, limit);
    const info = catalogInfo();
    out({ query, catalog: { source: info.source, icons: info.count }, results });
    if (!results.length) err(`No icon matches "${query}". Try fewer or different words (a product name, an alias like "aks", or an ARM type).`);
    else for (const r of results) err(`${r.id.padEnd(36)} ${r.label}${r.kind === 'generic' ? '  (neutral glyph, not an Azure icon)' : r.kind === 'missing' ? '  (not in the icon pack)' : ''}`);
    return 0;
  }
  if (sub === 'import') {
    const file = a.pos[2];
    if (!file) throw new DiagramError('azure import needs a file: diagram-studio azure import template.json --out diagram.json', 'usage');
    let input: unknown;
    try {
      // az CLI on Windows writes UTF-8 with a byte-order mark.
      input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      throw new DiagramError(`Cannot read ${file} as JSON: ${(e as Error).message}`, 'io');
    }
    let result;
    try {
      result = importAzure(input, { title: str(a.flags.title), source: path.basename(file) });
    } catch (e) {
      throw new DiagramError((e as Error).message, 'validation');
    }
    const target = str(a.flags.out);
    if (target) {
      fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(result.spec, null, 2) + '\n');
      out({ ok: true, spec: path.resolve(target), report: result.report });
      err(`Wrote a draft spec to ${target}: ${result.report.nodes} services in ${result.report.boundaries} boundaries, ${result.report.flows} flows from ${result.report.resources} resources.`);
    } else {
      out({ ok: true, spec: result.spec, report: result.report });
    }
    for (const n of result.report.notes) err(`Note: ${n}`);
    if (result.report.unmapped.length) err(`No icon for: ${result.report.unmapped.map((u) => `${u.type} (${u.count})`).join(', ')}. They are drawn as labelled boxes.`);
    return 0;
  }
  throw new DiagramError('Usage: diagram-studio azure icons [words…] | diagram-studio azure import <file> [--out spec.json]', 'usage');
}

async function main(): Promise<number> {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new DiagramError(`diagram-studio needs Node 20 or newer (this is ${process.versions.node}).`, 'usage');
  const a = parseArgs(process.argv.slice(2));
  const cmd = a.pos[0];
  if (a.flags.version && !cmd) return cmdVersion();
  if (a.flags.help || a.flags.h) {
    err(HELP);
    return 0;
  }
  switch (cmd) {
    case 'render':
      return cmdRender(a);
    case 'validate':
      return cmdValidate(a);
    case 'check':
      return cmdCheck(a);
    case 'types':
      return cmdTypes();
    case 'example':
      return cmdExample(a);
    case 'icons':
      out({ icons: iconNames() });
      err(iconNames().join(', '));
      return 0;
    case 'theme':
      return cmdTheme(a);
    case 'azure':
      return cmdAzure(a);
    case 'docs':
      return cmdDocs(a);
    case 'preview':
      return cmdPreview(a);
    case 'version':
      return cmdVersion();
    case undefined:
    case 'help':
    case '--help':
      err(HELP);
      return cmd ? 0 : 1;
    default:
      throw new DiagramError(`Unknown command "${cmd}".\n${HELP}`, 'usage');
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    const de = e instanceof DiagramError ? e : undefined;
    const code = de?.code === 'validation' ? 1 : de?.code === 'layout' || de?.code === 'qa' ? 2 : 1;
    out({ ok: false, error: (e as Error).message });
    err(`Error: ${(e as Error).message}`);
    if (!de && process.env.DIAGRAM_STUDIO_DEBUG) err((e as Error).stack ?? '');
    process.exit(code);
  },
);
