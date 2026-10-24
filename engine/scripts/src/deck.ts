/**
 * Decks: several pages rendered as one PowerPoint, PDF or draw.io file. A page
 * is any diagram spec (a file beside the deck, or inline), or a title or
 * section page the engine draws. Every page goes through the same pipeline
 * as a single diagram, with the deck's theme, canvas, classification and page
 * number applied, so a deck is consistent by construction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runChecks } from './check/index.js';
import { renderPng } from './export/png.js';
import { layoutCover } from './layout/cover.js';
import { CANVAS, type PageInfo } from './layout/context.js';
import { layout } from './layout/index.js';
import { paletteLabels, seriesPalette } from './layout/series.js';
import { type Prepared, type RenderOptions, type RenderSummary, type WrittenFile, isFailure, prepare, readSpecFile } from './pipeline.js';
import { renderSvg } from './render/svg.js';
import type { Spec } from './spec.js';
import { fontSetFor } from './text/measure.js';
import { applyTheme } from './theme/apply.js';
import { loadDefaults, loadTheme } from './theme/load.js';
import { escapeXml, isPlainObject, slugify } from './util.js';
import { validator } from './validate/ajv.js';
import { type Issue, rewriteErrors } from './validate/messages.js';
import type { CheckIssue } from './check/index.js';

type Aspect = '16:9' | '4:3' | 'A4-landscape' | 'A4-portrait';

export interface DeckSpec {
  version: '1.0';
  title: string;
  subtitle?: string;
  theme?: string;
  aspect?: Aspect;
  footer?: { source?: string; classification?: string };
  pageNumbers?: boolean;
  pages: DeckPage[];
}

export type DeckPage =
  | { spec: string; tag?: string; theme?: string }
  | { diagram: Record<string, unknown>; tag?: string; theme?: string }
  | { kind: 'title' | 'section'; title?: string; subtitle?: string; tag?: string };

/** A deck file is recognised by its page list (a diagram spec has a "type" instead). */
export function isDeck(input: unknown): input is DeckSpec {
  return isPlainObject(input) && Array.isArray(input.pages) && !('type' in input);
}

export interface DeckPageResult {
  number: number;
  kind: 'diagram' | 'title' | 'section';
  title?: string;
  type?: string;
  /** The spec file this page came from, when it has one. */
  source?: string;
  ok: boolean;
  errors: (Issue | CheckIssue)[];
  warnings: (Issue | CheckIssue)[];
  notes: string[];
}

export interface DeckSummary extends Omit<RenderSummary, 'type'> {
  kind: 'deck';
  pages: DeckPageResult[];
}

interface Page {
  index: number;
  info: PageInfo;
  kind: DeckPageResult['kind'];
  source?: string;
  prepared?: Prepared;
  result: DeckPageResult;
}

const where = (n: number, source?: string) => `page ${n}${source ? ` (${source})` : ''}`;

/** Apply the deck's settings to one page spec: the deck wins on theme and canvas, the page on its own source line. */
function withDeck(deck: DeckSpec, entry: { theme?: string }, raw: Record<string, unknown>, aspect: Aspect, notes: string[]): Record<string, unknown> {
  const footer = (raw.footer ?? {}) as Record<string, unknown>;
  const canvas = (raw.canvas ?? {}) as { aspect?: string };
  if (canvas.aspect && canvas.aspect !== aspect) notes.push(`Drawn on the deck's ${aspect} canvas instead of its own "${canvas.aspect}".`);
  const merged: Record<string, unknown> = {
    ...raw,
    canvas: { ...canvas, aspect },
    footer: {
      ...footer,
      ...(footer.source === undefined && deck.footer?.source ? { source: deck.footer.source } : {}),
      ...(deck.footer?.classification ? { classification: deck.footer.classification } : {}),
    },
  };
  const theme = entry.theme ?? deck.theme;
  if (theme) merged.theme = theme;
  if (!Object.keys(merged.footer as object).length) delete merged.footer;
  return merged;
}

/** The same page as a one-panel exhibit: the frame stays at deck size and the figure scales into it. */
function asFigurePage(spec: Record<string, unknown>): Record<string, unknown> {
  const { type, body, legend, callout, ...envelope } = spec;
  return {
    ...envelope,
    type: 'exhibit',
    body: { panels: [{ id: 'figure', type, body, ...(legend ? { legend } : {}), ...(callout ? { callout } : {}) }] },
  };
}

/** Validate, resolve and lay out every page. Series keep one colour across the whole deck. */
export async function prepareDeck(input: unknown, opts: { deckPath?: string; theme?: string } = {}): Promise<{ deck?: DeckSpec; pages: Page[]; errors: Issue[] }> {
  const validate = validator('deck');
  if (!validate(input)) return { pages: [], errors: rewriteErrors(validate.errors ?? []) };
  const deck = input as unknown as DeckSpec;
  const base = opts.deckPath ? path.dirname(opts.deckPath) : process.cwd();
  const aspect: Aspect = deck.aspect ?? '16:9';
  const total = deck.pages.length;
  const pages: Page[] = [];
  // Read every page first, so the series colours can be settled for the deck before any page is drawn.
  const specs: (Record<string, unknown> | undefined)[] = [];
  const reads: (Issue[] | undefined)[] = [];
  for (const [index, entry] of deck.pages.entries()) {
    if ('kind' in entry) {
      specs.push(undefined);
      reads.push(undefined);
      continue;
    }
    const source = 'spec' in entry ? entry.spec : undefined;
    let raw: unknown;
    if ('spec' in entry) {
      const file = path.resolve(base, entry.spec);
      if (!fs.existsSync(file)) {
        specs.push(undefined);
        reads.push([{ path: `pages[${index}].spec`, code: 'ref.page', message: `${where(index + 1, source)}: cannot find ${entry.spec} (looked in ${base}).` }]);
        continue;
      }
      raw = readSpecFile(file);
    } else raw = entry.diagram;
    if (!isPlainObject(raw) || '__parseError' in raw) {
      const p = await prepare(raw);
      specs.push(undefined);
      reads.push(isFailure(p) ? p.validationErrors.map((e) => ({ ...e, message: `${where(index + 1, source)}: ${e.message}` })) : []);
      continue;
    }
    specs.push(raw);
    reads.push(undefined);
  }
  const seriesHues = seriesPalette(specs.map((s) => (s ? paletteLabels(s.type, s.body) : [])));
  for (const [index, entry] of deck.pages.entries()) {
    const number = index + 1;
    const isCover = 'kind' in entry;
    const info: PageInfo = { number, total, tag: entry.tag, showNumber: deck.pageNumbers !== false && !(isCover && entry.kind === 'title') };
    const source = 'spec' in entry ? entry.spec : undefined;
    const result: DeckPageResult = { number, kind: isCover ? entry.kind : 'diagram', source, ok: false, errors: [], warnings: [], notes: [] };
    const page: Page = { index, info, kind: result.kind, source, result };
    pages.push(page);
    if (isCover) {
      page.prepared = await prepareCover(deck, entry, info, aspect, opts.theme);
      result.title = page.prepared.spec.title;
      result.ok = true;
      continue;
    }
    const raw = specs[index];
    if (!raw) {
      result.errors.push(...(reads[index] ?? []));
      continue;
    }
    const spec = withDeck(deck, entry, raw, aspect, result.notes);
    let p = await prepare(spec, { theme: opts.theme, page: info, seriesHues });
    // A page that outgrew the deck canvas would shrink as a whole, title and all. Redraw it as a
    // figure under the standard frame, so every title sits in the same place on every page.
    const [W, H] = CANVAS[aspect];
    if (!isFailure(p) && !p.errors.length && (p.scene.width > W + 0.5 || p.scene.height > H + 0.5) && p.spec.type !== 'exhibit') {
      const framed = await prepare(asFigurePage(spec), { theme: opts.theme, page: info, seriesHues });
      if (!isFailure(framed) && !framed.errors.length) {
        result.notes.push(`Its layout needs ${p.scene.width} × ${p.scene.height}, more than the deck's ${W} × ${H}, so it is drawn as a figure under the deck's title frame.`);
        p = framed;
      }
    }
    const tag = (m: string) => `${where(number, source)}: ${m}`;
    if (isFailure(p)) {
      result.errors.push(...p.validationErrors.map((e) => ({ ...e, message: tag(e.message) })));
      result.warnings.push(...p.warnings.map((e) => ({ ...e, message: tag(e.message) })));
      continue;
    }
    page.prepared = p;
    result.title = p.spec.title;
    result.type = p.spec.type;
    result.errors.push(...p.errors.map((e) => ({ ...e, message: tag(e.message) })));
    result.warnings.push(...p.warnings.map((e) => ({ ...e, message: tag(e.message) })));
    result.notes.push(...p.notes);
    result.ok = p.errors.length === 0;
  }
  return { deck, pages, errors: [] };
}

/** A title or section page: laid out by the cover layout, themed and checked like any page. */
async function prepareCover(deck: DeckSpec, entry: Extract<DeckPage, { kind: string }>, info: PageInfo, aspect: Aspect, themeOverride?: string): Promise<Prepared> {
  const spec = {
    version: '1.0',
    type: 'narrative',
    altitude: 'executive',
    legend: 'none',
    canvas: { aspect },
    title: entry.title ?? deck.title,
    subtitle: entry.subtitle ?? (entry.kind === 'title' ? deck.subtitle : undefined),
    footer: deck.footer?.classification ? { classification: deck.footer.classification } : undefined,
    theme: themeOverride ?? deck.theme ?? loadDefaults().theme ?? 'boardroom',
    body: { kind: entry.kind, tag: entry.tag },
  } as unknown as Spec;
  const theme = loadTheme(spec.theme!);
  const fonts = fontSetFor(theme);
  const { scene: raw, issues, notes } = await layout(spec, theme, fonts, { page: { ...info, tag: undefined } }, layoutCover);
  const scene = applyTheme(raw, theme);
  const qa = runChecks(scene, { theme, fonts, altitude: 'executive', layoutIssues: issues });
  return { spec, theme, fonts, scene, errors: qa.errors, warnings: qa.warnings.filter((w) => w.check !== 'density'), notes };
}

export async function renderDeck(input: unknown, opts: RenderOptions & { deckPath?: string }): Promise<DeckSummary> {
  const { deck, pages, errors } = await prepareDeck(input, { deckPath: opts.deckPath, theme: opts.theme });
  const files: WrittenFile[] = [];
  const notes: string[] = [];
  const results = pages.map((p) => p.result);
  const allErrors = [...errors, ...results.flatMap((r) => r.errors)];
  const allWarnings = results.flatMap((r) => r.warnings);
  for (const r of results) for (const n of r.notes) notes.push(`${where(r.number, r.source)}: ${n}`);
  const base = { kind: 'deck' as const, title: deck?.title, pages: results, errors: allErrors, warnings: allWarnings, notes };
  const invalid = !deck || pages.some((p) => !p.prepared);
  if (invalid) return { ...base, ok: false, exitCode: 1, stage: 'validate', files };
  const failed = allErrors.length > 0;
  const slug = slugify(deck.title);
  const out = (name: string) => path.join(opts.outDir, name);
  const write = (file: string, data: string | Buffer, format: WrittenFile['format']) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    files.push({ format, path: file, bytes: Buffer.byteLength(data) });
  };
  const ready = pages.map((p) => p.prepared!);

  // Page previews always, so a failing page can be seen; deliverables only when every page is clean.
  const thumbs: Buffer[] = [];
  for (const [i, p] of ready.entries()) {
    const name = `${String(i + 1).padStart(2, '0')}-${slugify(p.spec.title, 40)}`;
    if (!failed || opts.force) write(out(`pages/${name}.svg`), await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts }), 'svg');
    if (opts.preview !== false) write(out(`pages/${name}.png`), await renderPng(p.scene, p.theme, p.fonts, { scale: opts.scale ?? 2 }), 'preview');
    thumbs.push(await renderPng(p.scene, p.theme, p.fonts, { scale: 0.5 }));
  }
  if (opts.preview !== false) {
    const sheet = contactSheet(deck, ready, thumbs);
    const { rasterize } = await import('./export/png.js');
    write(out('preview.png'), rasterize(sheet, ready[0].fonts, 1), 'preview');
    if (!failed || opts.force) write(out(`${slug}.svg`), sheet, 'svg');
  }
  if (failed && !opts.force) {
    notes.push('preview.png and pages/*.png show the failing deck for diagnosis only. No deliverables were written; fix the pages listed in the errors and render again.');
    return { ...base, ok: false, exitCode: 2, stage: 'check', files };
  }

  const [W, H] = CANVAS[deck.aspect ?? '16:9'];
  for (const f of opts.formats) {
    if (f === 'pdf') {
      const { renderPdfPages } = await import('./export/pdf.js');
      write(out(`${slug}.pdf`), await renderPdfPages(ready, { title: deck.title, subject: deck.subtitle, size: { width: W, height: H } }), 'pdf');
    }
    if (f === 'pptx') {
      const { renderPptxPages } = await import('./export/pptx.js');
      const r = await renderPptxPages(ready, { title: deck.title });
      write(out(`${slug}.pptx`), r.buffer, 'pptx');
      notes.push(...r.notes);
    }
    if (f === 'drawio') {
      const { renderDrawioPages } = await import('./export/drawio.js');
      write(out(`${slug}.drawio`), renderDrawioPages(ready), 'drawio');
    }
    if (f === 'png') notes.push('Each page is in pages/ as a PNG.');
  }
  write(out(`${slug}.storyline.md`), storyline(deck, ready), 'spec');
  const deckOut = out(`${slug}.deck.json`);
  if (!opts.deckPath || path.resolve(opts.deckPath) !== path.resolve(deckOut)) write(deckOut, JSON.stringify(input, null, 2) + '\n', 'spec');
  if (failed) notes.push('Written with --force despite QA errors; fix the pages before delivering.');
  return { ...base, ok: !failed, exitCode: failed ? 2 : 0, stage: 'done', files, canvas: { width: W, height: H }, theme: ready[0].theme.id };
}

/** The action titles in order: read alone, they should make the argument. */
function storyline(deck: DeckSpec, pages: Prepared[]): string {
  const lines = [`# ${deck.title}`, '', ...(deck.subtitle ? [deck.subtitle, ''] : []), 'Read the action titles alone: they should tell the whole story.', ''];
  pages.forEach((p, i) => {
    const body = p.spec.body as { kind?: string };
    const kind = p.spec.type === 'narrative' && body.kind ? body.kind : p.spec.type;
    lines.push(`${i + 1}. ${kind === 'section' ? '**' + p.spec.title + '**' : p.spec.title}${kind === 'title' || kind === 'section' ? ` _(${kind} page)_` : ''}`);
  });
  return lines.join('\n') + '\n';
}

/** Every page as a thumbnail, numbered and titled, for a one-glance review of the deck. */
function contactSheet(deck: DeckSpec, pages: Prepared[], thumbs: Buffer[]): string {
  const theme = pages[0].theme;
  const cols = pages.length <= 4 ? 2 : 3;
  const rows = Math.ceil(pages.length / cols);
  const tw = 640;
  const th = Math.round((tw * pages[0].scene.height) / pages[0].scene.width);
  const gap = 32;
  const cap = 40;
  const pad = 40;
  const head = 56;
  const W = pad * 2 + cols * tw + (cols - 1) * gap;
  const H = pad + head + rows * (th + cap) + (rows - 1) * gap + pad;
  const family = theme.font.family;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${theme.color.surfaceAlt}"/>`,
    `<text x="${pad}" y="${pad + 24}" font-family="${family}" font-size="24" font-weight="600" fill="${theme.color.ink}">${escapeXml(deck.title)} · ${pages.length} pages</text>`,
  ];
  pages.forEach((p, i) => {
    const x = pad + (i % cols) * (tw + gap);
    const y = pad + head + Math.floor(i / cols) * (th + cap + gap);
    parts.push(`<rect x="${x - 1}" y="${y - 1}" width="${tw + 2}" height="${th + 2}" fill="none" stroke="${theme.color.line}"/>`);
    parts.push(`<image x="${x}" y="${y}" width="${tw}" height="${th}" href="data:image/png;base64,${thumbs[i].toString('base64')}"/>`);
    const title = p.spec.title.length > 80 ? `${p.spec.title.slice(0, 78)}…` : p.spec.title;
    parts.push(`<text x="${x}" y="${y + th + 26}" font-family="${family}" font-size="15" fill="${theme.color.ink}"><tspan font-weight="600">${i + 1}</tspan>  ${escapeXml(title)}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
