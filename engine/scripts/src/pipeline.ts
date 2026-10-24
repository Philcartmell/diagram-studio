/**
 * The render pipeline: validate → layout → theme → render → check → export.
 * Claude only writes the spec; everything after that is deterministic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { type CheckIssue, runChecks } from './check/index.js';
import { renderPng } from './export/png.js';
import { layout } from './layout/index.js';
import { renderSvg } from './render/svg.js';
import type { Scene } from './scene/types.js';
import type { Spec } from './spec.js';
import { fontSetFor, type FontSet } from './text/measure.js';
import { applyTheme } from './theme/apply.js';
import { loadTheme } from './theme/load.js';
import type { Theme } from './theme/types.js';
import { type Issue, validateSpec } from './validate/spec.js';
import { slugify } from './util.js';

export type Format = 'svg' | 'png' | 'pdf' | 'pptx' | 'drawio';

export interface Prepared {
  spec: Spec;
  theme: Theme;
  fonts: FontSet;
  scene: Scene;
  errors: CheckIssue[];
  warnings: CheckIssue[];
  /** Layout notes to pass on (e.g. the canvas grew to fit). */
  notes: string[];
}

export interface PrepareFailure {
  validationErrors: Issue[];
  warnings: Issue[];
}

export function readSpecFile(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw Object.assign(new Error(`Cannot read ${file}: ${(e as Error).message}`), { exitCode: 1 });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    const pos = /position (\d+)/.exec(msg);
    let where = '';
    if (pos) {
      const before = text.slice(0, Number(pos[1]));
      const line = before.split('\n').length;
      where = ` (line ${line})`;
    }
    return { __parseError: `spec: the file is not valid JSON${where}: ${msg}` };
  }
}

function toCheckIssue(i: Issue): CheckIssue {
  return { check: i.code, id: i.id, message: i.message, hint: i.hint };
}

/** Validate, lay out, theme and check a spec. */
export async function prepare(input: unknown, opts: { theme?: string } = {}): Promise<Prepared | PrepareFailure> {
  if (input && typeof input === 'object' && '__parseError' in input) {
    return { validationErrors: [{ path: 'spec', code: 'json', message: String((input as { __parseError: string }).__parseError) }], warnings: [] };
  }
  const v = validateSpec(input, opts);
  if (!v.ok || !v.spec) return { validationErrors: v.errors, warnings: v.warnings };
  const spec = v.spec;
  const theme = loadTheme(spec.theme!, spec.themeOverrides);
  const fonts = fontSetFor(theme);
  const { scene: raw, issues, notes } = await layout(spec, theme, fonts);
  const scene = applyTheme(raw, theme);
  const qa = runChecks(scene, { theme, fonts, altitude: spec.altitude!, layoutIssues: issues });
  const hasAccentCheck = qa.warnings.some((w) => w.check === 'accent-count');
  const vWarnings = v.warnings.filter((w) => !(hasAccentCheck && w.code === 'altitude.accent')).map(toCheckIssue);
  return { spec, theme, fonts, scene, errors: qa.errors, warnings: [...vWarnings, ...qa.warnings], notes };
}

export function isFailure(p: Prepared | PrepareFailure): p is PrepareFailure {
  return 'validationErrors' in p;
}

export interface RenderOptions {
  theme?: string;
  outDir: string;
  formats: Format[];
  scale?: number;
  transparent?: boolean;
  /** Write outputs even when QA finds errors. */
  force?: boolean;
  /** Write preview.png (default true). */
  preview?: boolean;
  /** Source spec path, so the spec copy is not written over itself. */
  specPath?: string;
}

export interface WrittenFile {
  format: Format | 'preview' | 'spec';
  path: string;
  bytes: number;
}

export interface RenderSummary {
  ok: boolean;
  exitCode: 0 | 1 | 2;
  stage: 'validate' | 'check' | 'done';
  type?: string;
  theme?: string;
  altitude?: string;
  title?: string;
  canvas?: { width: number; height: number };
  files: WrittenFile[];
  errors: (Issue | CheckIssue)[];
  warnings: (Issue | CheckIssue)[];
  notes: string[];
}

function write(file: string, data: string | Buffer, format: WrittenFile['format'], files: WrittenFile[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  files.push({ format, path: file, bytes: Buffer.byteLength(data) });
}

export async function render(input: unknown, opts: RenderOptions): Promise<RenderSummary> {
  const p = await prepare(input, { theme: opts.theme });
  if (isFailure(p)) {
    return { ok: false, exitCode: 1, stage: 'validate', files: [], errors: p.validationErrors, warnings: p.warnings, notes: [] };
  }
  const { spec, theme, fonts, scene } = p;
  const files: WrittenFile[] = [];
  const notes: string[] = [...p.notes];
  const base: Omit<RenderSummary, 'ok' | 'exitCode' | 'stage' | 'files' | 'errors' | 'warnings' | 'notes'> = {
    type: spec.type,
    theme: theme.id,
    altitude: spec.altitude,
    title: spec.title,
    canvas: { width: scene.width, height: scene.height },
  };
  const failed = p.errors.length > 0;
  if (failed && !opts.force) {
    // Show the failing layout for diagnosis, but write no deliverables.
    if (opts.preview !== false) {
      write(path.join(opts.outDir, 'preview.png'), await renderPng(scene, theme, fonts, { scale: 2 }), 'preview', files);
      notes.push('preview.png shows the failing layout for diagnosis only. No deliverables were written; fix the spec and render again.');
      const slug = slugify(spec.title);
      const stale = ['svg', 'png', 'pdf', 'pptx', 'drawio'].map((x) => `${slug}.${x}`).filter((f) => fs.existsSync(path.join(opts.outDir, f)));
      if (stale.length) notes.push(`Older files from a previous render are still in the folder and do not match this spec: ${stale.join(', ')}. Do not deliver them.`);
    }
    return { ...base, ok: false, exitCode: 2, stage: 'check', files, errors: p.errors, warnings: p.warnings, notes };
  }
  const slug = slugify(spec.title);
  const out = (ext: string) => path.join(opts.outDir, `${slug}.${ext}`);
  const svg = await renderSvg(scene, { theme, fonts });
  write(out('svg'), svg, 'svg', files);
  if (opts.preview !== false) write(path.join(opts.outDir, 'preview.png'), await renderPng(scene, theme, fonts, { scale: 2 }), 'preview', files);
  for (const f of opts.formats) {
    if (f === 'svg') continue;
    if (f === 'png') write(out('png'), await renderPng(scene, theme, fonts, { scale: opts.scale ?? 2, transparent: opts.transparent }), 'png', files);
    if (f === 'pdf') {
      const { renderPdf } = await import('./export/pdf.js');
      write(out('pdf'), await renderPdf(scene, theme, fonts), 'pdf', files);
    }
    if (f === 'pptx') {
      const { renderPptx } = await import('./export/pptx.js');
      const r = await renderPptx(scene, theme, fonts);
      write(out('pptx'), r.buffer, 'pptx', files);
      notes.push(...r.notes);
    }
    if (f === 'drawio') {
      const { renderDrawio } = await import('./export/drawio.js');
      write(out('drawio'), renderDrawio(scene, theme, fonts), 'drawio', files);
    }
  }
  const specOut = out('diagram.json');
  if (!opts.specPath || path.resolve(opts.specPath) !== path.resolve(specOut)) {
    write(specOut, JSON.stringify(input, null, 2) + '\n', 'spec', files);
  }
  if (failed) notes.push('Written with --force despite QA errors; fix the spec before delivering.');
  return { ...base, ok: !failed, exitCode: failed ? 2 : 0, stage: 'done', files, errors: p.errors, warnings: p.warnings, notes };
}
