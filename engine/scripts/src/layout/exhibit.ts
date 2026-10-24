/**
 * exhibit: one slide built from panels under a single action title. Each
 * panel is any other type (a chart, a business diagram, an Azure or
 * Databricks architecture) laid out as a figure into its own box, then placed
 * on the slide. A figure that needs more room than its box is scaled down to
 * fit, never past the point where its text stops being legible.
 */
import { placeElements } from '../scene/compose.js';
import type { Box } from '../scene/types.js';
import { type ExhibitBody, type ExhibitPanel, panelSpec } from '../spec.js';
import { rulePaint } from '../theme/paint.js';
import { snap } from '../util.js';
import { type LayoutContext, addText, createContext, fitIssue, lh, styles, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';

type LayoutFn = (ctx: LayoutContext) => void | Promise<void>;

/** Below this a panel's smallest text (captions) prints under about 6 pt on a 13.3-inch slide. */
export const MIN_PANEL_SCALE = 0.7;
const COL_GAP = 40;
const ROW_GAP = 32;

export async function layoutExhibit(ctx: LayoutContext, layouts: Record<string, LayoutFn>): Promise<void> {
  const body = ctx.spec.body as unknown as ExhibitBody;
  const st = styles(ctx.theme);
  // The panels carry their own legends; the exhibit frame only holds title, callout and footer.
  const fctx: LayoutContext = { ...ctx, spec: { ...ctx.spec, legend: 'none' } };
  const frame = beginFrame(fctx);
  const C = frame.content;
  const boxes = panelBoxes(body, C);
  let minScale = 1;

  for (const [i, p] of body.panels.entries()) {
    const B = boxes[i];
    // Panel heading: a title and an optional subtitle, as in "Release frequency / Average reduced from …".
    let y = B.y;
    if (p.title) {
      const lines = wrap(ctx, p.title, B.w, st.group);
      addText(ctx, { id: `${p.id}--title`, role: 'header', x: B.x, y, w: B.w, lines, ...st.group, anchor: 'start', color: 'ink', slot: 'heading' });
      y += lines.length * lh(ctx, st.group.size);
    }
    if (p.subtitle) {
      const lines = wrap(ctx, p.subtitle, B.w, st.caption);
      addText(ctx, { id: `${p.id}--subtitle`, role: 'subtitle', x: B.x, y: y + 2, w: B.w, lines, ...st.caption, anchor: 'start', color: 'inkMuted', slot: 'text' });
      y += 2 + lines.length * lh(ctx, st.caption.size);
    }
    if (p.title || p.subtitle) y += 16;
    const inner: Box = { x: B.x, y, w: B.w, h: B.y + B.h - y };
    const scale = await placePanel(ctx, p, i, inner, layouts);
    minScale = Math.min(minScale, scale);
  }

  if (body.dividers) {
    const xs = new Set<number>();
    const ys = new Set<number>();
    boxes.forEach((b, i) => {
      for (const o of boxes.slice(i + 1)) {
        if (Math.abs(o.y - b.y) < 1 && o.x > b.x) xs.add(snap(b.x + b.w + COL_GAP / 2, 1));
        if (Math.abs(o.x - b.x) < 1 && o.y > b.y) ys.add(snap(b.y + b.h + ROW_GAP / 2, 1));
      }
    });
    [...xs].forEach((x, k) => ctx.els.push({ kind: 'line', id: `exhibit-divider-v${k + 1}`, role: 'decoration', points: [{ x, y: C.y }, { x, y: C.y + C.h }], paint: rulePaint(ctx.theme) }));
    [...ys].forEach((y, k) => ctx.els.push({ kind: 'line', id: `exhibit-divider-h${k + 1}`, role: 'decoration', points: [{ x: C.x, y }, { x: C.x + C.w, y }], paint: rulePaint(ctx.theme) }));
  }
  if (minScale < 1) ctx.textScale = Math.min(ctx.textScale ?? 1, minScale);
  endFrame(fctx, frame, C.y + C.h);
}

/** Lay one panel out as a figure in its box and place it on the slide; returns the scale used. */
async function placePanel(ctx: LayoutContext, p: ExhibitPanel, i: number, inner: Box, layouts: Record<string, LayoutFn>): Promise<number> {
  const spec = panelSpec(ctx.spec, p);
  const size = { w: Math.floor(inner.w), h: Math.floor(inner.h) };
  const fit = async (grow: boolean) => {
    const sub = createContext(spec, ctx.theme, ctx.fonts, { size, figure: true, grow, seriesHues: ctx.seriesHues });
    await layouts[p.type](sub);
    return { sub, s: Math.min(1, inner.w / sub.W, inner.h / sub.H) };
  };
  // Fill the box first. A figure that grows past it grows in the box's proportions, which can be
  // the wrong shape (a wide, short box); laid out at its natural size instead, it may need less shrinking.
  let { sub, s } = await fit(false);
  if (s < 1 || sub.issues.length) {
    const natural = await fit(true);
    if (natural.s > s + 0.01 && natural.sub.issues.length <= sub.issues.length) ({ sub, s } = natural);
  }
  const where = `body.panels[${i}]`;
  if (s < MIN_PANEL_SCALE) {
    fitIssue(
      ctx,
      `p${i + 1}_ds-content`,
      `panel "${p.id}" (${p.type}) needs ${Math.ceil(sub.W)} × ${Math.ceil(sub.H)} units but its box is ${Math.floor(inner.w)} × ${Math.floor(inner.h)}; shrinking it to ${Math.round(s * 100)}% would make its text too small to read. Give it a larger "span", use fewer panels, or move it to a page of its own.`,
    );
  } else if (s < 1) {
    ctx.notes.push(`Panel "${p.id}" is drawn at ${Math.round(s * 100)}% to fit its box; its smallest text prints at about ${Math.round(ctx.theme.font.size.caption * s * 0.75 * 10) / 10} pt on a 13.3-inch slide.`);
  }
  // Centre a scaled-down figure in its box.
  const dx = inner.x + (inner.w - sub.W * s) / 2;
  const dy = inner.y + (s < 1 ? (inner.h - sub.H * s) / 2 : 0);
  ctx.els.push(...placeElements(sub.els, { dx, dy, s, prefix: `p${i + 1}_` }));
  for (const issue of sub.issues) ctx.issues.push({ ...issue, path: `${where}.${issue.path}`, id: `p${i + 1}_${issue.id ?? 'ds-content'}`, message: `panel "${p.id}": ${issue.message}` });
  for (const n of sub.notes) ctx.notes.push(`Panel "${p.id}": ${n}`);
  if (sub.textScale !== undefined) ctx.textScale = Math.min(ctx.textScale ?? 1, sub.textScale * s);
  return s;
}

/** Split the content box into one box per panel. */
function panelBoxes(body: ExhibitBody, C: Box): Box[] {
  const n = body.panels.length;
  const layout = body.layout ?? 'columns';
  const spans = body.panels.map((p) => p.span ?? 1);
  if (layout === 'grid') {
    const cols = Math.max(1, Math.min(n, body.columns ?? Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const w = (C.w - (cols - 1) * COL_GAP) / cols;
    const h = (C.h - (rows - 1) * ROW_GAP) / rows;
    return body.panels.map((_, i) => ({ x: C.x + (i % cols) * (w + COL_GAP), y: C.y + Math.floor(i / cols) * (h + ROW_GAP), w, h }));
  }
  const total = spans.reduce((a, b) => a + b, 0);
  const horizontal = layout === 'columns';
  const avail = (horizontal ? C.w : C.h) - (n - 1) * (horizontal ? COL_GAP : ROW_GAP);
  const out: Box[] = [];
  let at = horizontal ? C.x : C.y;
  spans.forEach((sp) => {
    const len = (avail * sp) / total;
    out.push(horizontal ? { x: at, y: C.y, w: len, h: C.h } : { x: C.x, y: at, w: C.w, h: len });
    at += len + (horizontal ? COL_GAP : ROW_GAP);
  });
  return out;
}
