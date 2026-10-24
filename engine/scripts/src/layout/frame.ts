/**
 * The page frame shared by every type: action title and subtitle on top,
 * then legend, "so what" callout and footer reserved at the edges. Layout
 * modules fill the content box in between.
 */
import { intersects } from '../scene/geometry.js';
import { textBox } from './labels.js';
import type { Box, Dash, ShapeEl, ShapeKind } from '../scene/types.js';
import type { Token } from '../theme/tokens.js';
import type { Emphasis, LegendEntry, Status } from '../spec.js';
import { STATUS_LABEL, badgeLook, nodeLook, panelLook, rulePaint, statusToken, tagToken } from '../theme/paint.js';
import { emphasisCarriers } from '../validate/spec.js';
import { humanize, snap, snapUp } from '../util.js';
import { type LayoutContext, addShape, addText, applyCase, fitIssue, lh, styles, textOn, textWidth, wrap } from './context.js';

export interface Frame {
  /** The box layout modules fill. */
  content: Box;
  /** Reserved column for an anchored callout. */
  calloutColumn?: { side: 'left' | 'right'; x: number; w: number };
  /** Space reserved below content (legend, footer, unanchored callout). */
  bottomReserve: number;
  legend: LegendItem[];
}

export interface LegendItem {
  label: string;
  kind: 'emphasis' | 'status' | 'tag' | 'text' | 'flow' | 'swatch' | 'line';
  emphasis?: Emphasis;
  status?: Status;
  tag?: string;
  /** Flow entries: a line sample and, optionally, the step-badge shape used by that flow. */
  flow?: { stroke: Token; dash?: Dash; badge?: { shape: ShapeKind; fill: Token } };
  /** Swatch entries (chart series): a filled square, or another shape such as a badge hexagon. */
  swatch?: { fill: Token; shape?: ShapeKind };
  /** Line entries (line-chart series): a short line sample without an arrow. */
  line?: { stroke: Token; dash?: Dash; width?: number };
}

const CALLOUT_GAP = 24;

function legendItems(ctx: LayoutContext, extra: LegendItem[] = []): LegendItem[] {
  const legend = ctx.spec.legend ?? 'auto';
  if (legend === 'none') return [];
  if (legend === 'auto' && extra.length) return [...extra, ...legendItems(ctx).filter((i) => i.kind !== 'flow')];
  if (Array.isArray(legend)) {
    return (legend as LegendEntry[]).map((e) => ({
      label: e.label,
      kind: e.status ? 'status' : e.tag ? 'tag' : e.emphasis ? 'emphasis' : 'text',
      emphasis: e.emphasis,
      status: e.status,
      tag: e.tag,
    }));
  }
  const carriers = emphasisCarriers(ctx.spec);
  const items: LegendItem[] = [];
  const emph = new Set(carriers.map((c) => c.emphasis).filter(Boolean));
  // Emphasis explains itself at executive and management altitude; only
  // detailed diagrams (where colour may carry several meanings) list it.
  if (ctx.altitude === 'detailed') {
    const names: Record<string, string> = { accent: 'Focus area', highlight: 'Secondary focus', muted: 'Context / out of scope' };
    for (const e of ['accent', 'highlight', 'muted'] as Emphasis[])
      if (emph.has(e)) items.push({ label: names[e], kind: 'emphasis', emphasis: e });
  }
  // Status badges are labelled, so only detailed diagrams repeat them in the legend.
  const statuses = new Set(carriers.map((c) => c.status).filter((s) => s && s !== 'current'));
  if (ctx.altitude === 'detailed')
    for (const s of ['new', 'changed', 'at-risk', 'retired'] as Status[])
      if (statuses.has(s)) items.push({ label: STATUS_LABEL[s], kind: 'status', status: s });
  for (const t of ctx.tagIndex.keys()) items.push({ label: humanize(t), kind: 'tag', tag: t });
  return items;
}

const SWATCH_W = 20;
const SWATCH_H = 12;
const LEGEND_ROW = 20;

const FLOW_W = 28;

function swatchWidth(it: LegendItem): number {
  if (it.kind === 'flow') return FLOW_W + (it.flow?.badge ? 6 + SWATCH_H + 2 : 0);
  if (it.kind === 'line') return SWATCH_W;
  return it.kind === 'tag' || it.kind === 'swatch' ? SWATCH_H : SWATCH_W;
}

function legendRows(ctx: LayoutContext, items: LegendItem[], width: number): LegendItem[][] {
  const st = styles(ctx.theme).caption;
  const rows: LegendItem[][] = [[]];
  let x = 0;
  for (const it of items) {
    const w = swatchWidth(it) + 6 + textWidth(ctx, it.label, st) + 20;
    if (x + w > width && rows[rows.length - 1].length) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push(it);
    x += w;
  }
  return rows.filter((r) => r.length);
}

function footerText(ctx: LayoutContext): { left: string; right: string } | undefined {
  if (ctx.figure) return undefined;
  const f = ctx.spec.footer ?? {};
  const pageNo = ctx.page?.showNumber ? String(ctx.page.number) : '';
  if (!f.source && !f.note && !f.classification && !pageNo) return undefined;
  const left = [f.source ? `Source: ${f.source}` : '', f.note ? `Note: ${f.note}` : ''].filter(Boolean).join('   ·   ');
  const right = [f.classification?.toUpperCase() ?? '', pageNo].filter(Boolean).join('   ');
  return { left, right };
}

/** Numbered footnotes ("1  Capital and operating expenditures"), drawn above the source line. */
function footnoteLines(ctx: LayoutContext, width: number): string[][] {
  if (ctx.figure || !ctx.spec.footnotes?.length) return [];
  const st = styles(ctx.theme).caption;
  return ctx.spec.footnotes.map((n, i) => wrap(ctx, `${i + 1}  ${n}`, width, st));
}

function calloutHeight(ctx: LayoutContext, width: number): number {
  const st = styles(ctx.theme);
  const textW = width - 16 - 12;
  const lines = wrap(ctx, ctx.spec.callout!.text, textW, st.label);
  return snapUp(12 + lh(ctx, st.caption.size) + 4 + lines.length * lh(ctx, st.label.size) + 12);
}

export interface FrameOptions {
  /** Preferred side for an anchored callout column. */
  calloutSide?: 'left' | 'right';
  /** Draw no title or subtitle (a figure for a document; the title still names the files). */
  hideTitle?: boolean;
  /** Legend entries contributed by the layout (e.g. flow types), shown first with "legend": "auto". */
  legend?: LegendItem[];
}

export function beginFrame(ctx: LayoutContext, opts: FrameOptions = {}): Frame {
  const { theme, spec } = ctx;
  const m = ctx.margin;
  const st = styles(theme);
  const fullW = ctx.W - 2 * m;
  const hideTitle = opts.hideTitle || ctx.figure;

  // Header: deck tracker tag, action title, subtitle.
  let y = m;
  // Every deck page keeps the tag line, tagged or not, so titles sit in one place throughout.
  if (ctx.page && !hideTitle) {
    if (ctx.page.tag) addText(ctx, { id: 'ds-tag', role: 'label', x: m, y, w: fullW, lines: [ctx.page.tag.toUpperCase()], ...st.captionStrong, anchor: 'start', color: textOn('accent', 'background'), letterSpacing: 0.6, slot: 'text' });
    y += snapUp(lh(ctx, st.caption.size) + 4);
  }
  if (!hideTitle) {
    const title = applyCase(spec.title, theme.font.titleCase);
    const tLines = wrap(ctx, title, fullW, st.title);
    if (tLines.length > 2) fitIssue(ctx, 'ds-title', `title wraps to ${tLines.length} lines on this canvas; keep it to two. Shorten the title.`);
    const tLh = lh(ctx, st.title.size);
    addText(ctx, { id: 'ds-title', role: 'title', x: m, y, w: fullW, lines: tLines, ...st.title, anchor: 'start', color: 'ink', slot: 'heading' });
    y += snapUp(tLines.length * tLh);
  }
  if (spec.subtitle && !hideTitle) {
    const sLines = wrap(ctx, spec.subtitle, fullW, st.subtitle);
    y += 4;
    addText(ctx, { id: 'ds-subtitle', role: 'subtitle', x: m, y, w: fullW, lines: sLines, ...st.subtitle, anchor: 'start', color: 'inkMuted', slot: 'text' });
    y += sLines.length * lh(ctx, st.subtitle.size);
  }
  y = hideTitle ? y - 24 : snapUp(y + 12);
  if (theme.style.headerRule && !hideTitle) {
    ctx.els.push({ kind: 'line', id: 'ds-header-rule', role: 'decoration', points: [{ x: m, y }, { x: ctx.W - m, y }], paint: rulePaint(theme) });
  }
  const top = y + 24;

  // Bottom reserve: footer, footnotes, legend, unanchored callout.
  let bottom = 0;
  const foot = footerText(ctx);
  if (foot) bottom += snapUp(lh(ctx, st.caption.size)) + 16;
  const notes = footnoteLines(ctx, fullW);
  if (notes.length) bottom += snapUp(notes.flat().length * lh(ctx, st.caption.size) + (foot ? 4 : 0)) + (foot ? 0 : 16);
  const legend = legendItems(ctx, opts.legend);
  if (legend.length) bottom += legendRows(ctx, legend, fullW).length * LEGEND_ROW + 16;
  let calloutColumn: Frame['calloutColumn'];
  let left = m;
  let right = ctx.W - m;
  if (spec.callout) {
    if (spec.callout.anchor) {
      const w = Math.min(240, Math.max(200, snap(ctx.W * 0.18)));
      const side = opts.calloutSide ?? 'right';
      if (side === 'right') {
        calloutColumn = { side, x: right - w, w };
        right -= w + CALLOUT_GAP;
      } else {
        calloutColumn = { side, x: left, w };
        left += w + CALLOUT_GAP;
      }
    } else {
      bottom += calloutHeight(ctx, fullW) + 16;
    }
  }
  const content: Box = { x: left, y: top, w: right - left, h: ctx.H - m - bottom - top };
  return { content, calloutColumn, bottomReserve: bottom, legend };
}

/**
 * Finish the frame once content is placed: grow an `auto` canvas, then place
 * the callout, legend and footer.
 */
export function endFrame(ctx: LayoutContext, frame: Frame, contentBottom: number): void {
  const { theme, spec } = ctx;
  const m = ctx.margin;
  const st = styles(theme);
  const fullW = ctx.W - 2 * m;
  if (ctx.auto) ctx.H = Math.max(snapUp(contentBottom + frame.bottomReserve + m), 360);
  else if (contentBottom > frame.content.y + frame.content.h + 0.5 && !ctx.issues.some((i) => i.id === 'ds-content')) {
    fitIssue(
      ctx,
      'ds-content',
      ctx.figure
        ? `content needs ${Math.ceil(contentBottom - frame.content.y)} units of height but the panel leaves ${Math.floor(frame.content.h)}. Give the panel more room (a larger "span", fewer panels, or "layout": "rows"), or remove or shorten content.`
        : `content needs ${Math.ceil(contentBottom - frame.content.y)} units of height but the ${spec.canvas?.aspect ?? '16:9'} canvas leaves ${Math.floor(frame.content.h)}. Remove or group nodes, shorten text, set "legend": "none", drop the subtitle, or set "canvas": { "aspect": "auto" }.`,
    );
  }
  let y = ctx.H - m;

  const fl = lh(ctx, st.caption.size);
  const footInk = textOn('inkMuted', ctx.background ?? 'background');
  const foot = footerText(ctx);
  if (foot) {
    y -= fl;
    const rightW = foot.right ? textWidth(ctx, foot.right, st.captionStrong) + 0.5 : 0;
    if (foot.left) {
      const lines = wrap(ctx, foot.left, fullW - rightW - 24, st.caption);
      addText(ctx, { id: 'ds-footer', role: 'footer', x: m, y: y - (lines.length - 1) * fl, w: fullW - rightW - 24, lines, ...st.caption, anchor: 'start', color: footInk, slot: 'text' });
      y -= (lines.length - 1) * fl;
    }
    if (foot.right) {
      addText(ctx, { id: 'ds-classification', role: 'footer', x: ctx.W - m, y: ctx.H - m - fl, lines: [foot.right], ...st.captionStrong, anchor: 'end', color: footInk, letterSpacing: 0.5, slot: 'text' });
    }
  }
  const notes = footnoteLines(ctx, fullW);
  if (notes.length) {
    y -= notes.flat().length * fl + (foot ? 4 : 0);
    addText(ctx, { id: 'ds-footnotes', role: 'footer', x: m, y, w: fullW, lines: notes.flat(), ...st.caption, anchor: 'start', color: footInk, slot: 'text' });
  }
  if (foot || notes.length) y -= 16;

  if (frame.legend.length) {
    const rows = legendRows(ctx, frame.legend, fullW);
    y -= rows.length * LEGEND_ROW;
    drawLegend(ctx, rows, m, y);
    y -= 16;
  }

  if (spec.callout && !spec.callout.anchor) {
    const h = calloutHeight(ctx, fullW);
    y -= h;
    drawCallout(ctx, { x: m, y, w: fullW, h });
  } else if (spec.callout && frame.calloutColumn) {
    const anchor = ctx.anchors.get(spec.callout.anchor!);
    const col = frame.calloutColumn;
    const h = calloutHeight(ctx, col.w);
    const cy = anchor ? anchor.y + anchor.h / 2 : frame.content.y + h / 2;
    const minY = frame.content.y;
    const maxY = Math.max(minY, Math.min(frame.content.y + frame.content.h, contentBottom) - h);
    const by = snap(Math.min(maxY, Math.max(minY, cy - h / 2)));
    const box = { x: col.x, y: by, w: col.w, h };
    drawCallout(ctx, box);
    if (anchor) drawPointer(ctx, anchor, box, col.side);
  }
}

function drawCallout(ctx: LayoutContext, b: Box) {
  const st = styles(ctx.theme);
  const look = panelLook(ctx.theme, 'accent');
  addShape(ctx, {
    id: 'ds-callout',
    role: 'callout',
    shape: 'rect',
    ...b,
    radius: ctx.theme.shape.radius,
    paint: { ...look.paint, stroke: 'none', strokeWidth: 0 },
    inset: { l: 16, r: 12, t: 12, b: 12 },
    group: 'g-ds-callout',
  });
  addShape(ctx, {
    id: 'ds-callout-bar',
    role: 'decoration',
    shape: 'rect',
    x: b.x,
    y: b.y,
    w: 4,
    h: b.h,
    paint: { fill: 'accent', stroke: 'none', strokeWidth: 0 },
    box: false,
    group: 'g-ds-callout',
  });
  const textW = b.w - 16 - 12;
  addText(ctx, {
    id: 'ds-callout-heading',
    role: 'label',
    x: b.x + 16,
    y: b.y + 12,
    w: textW,
    lines: ['SO WHAT'],
    ...st.captionStrong,
    anchor: 'start',
    color: look.inkMuted,
    letterSpacing: 0.6,
    box: 'ds-callout',
    group: 'g-ds-callout',
    slot: 'heading',
  });
  const lines = wrap(ctx, ctx.spec.callout!.text, textW, st.label);
  addText(ctx, {
    id: 'ds-callout-text',
    role: 'label',
    x: b.x + 16,
    y: b.y + 12 + lh(ctx, st.caption.size) + 4,
    w: textW,
    lines,
    ...st.label,
    anchor: 'start',
    color: look.ink,
    box: 'ds-callout',
    group: 'g-ds-callout',
    slot: 'text',
  });
}

/** A short accent leader from the anchor to the callout, only if the path is clear. */
function drawPointer(ctx: LayoutContext, anchor: Box, box: Box, side: 'left' | 'right') {
  const y = snap(Math.max(box.y + 12, Math.min(box.y + box.h - 12, anchor.y + anchor.h / 2)));
  if (y < anchor.y + 4 || y > anchor.y + anchor.h - 4) return;
  const x0 = side === 'right' ? anchor.x + anchor.w : box.x + box.w;
  const x1 = side === 'right' ? box.x : anchor.x;
  // Long leaders read as stray lines; the callout's alignment carries the link instead.
  if (x1 - x0 < 12 || x1 - x0 > 320) return;
  const lane: Box = { x: x0 + 1, y: y - 3, w: x1 - x0 - 2, h: 6 };
  const blocked = ctx.els.some(
    (e) =>
      (e.kind === 'shape' && ((e as ShapeEl).obstacle || (e as ShapeEl).role === 'marker') && intersects(lane, e as ShapeEl)) ||
      (e.kind === 'text' && intersects(lane, textBox(e, (t) => ctx.fonts.blockWidth(t.lines, t.size, t.weight)))) ||
      (e.kind === 'connector' && e.points.some((p, k) => k > 0 && intersects(lane, { x: Math.min(p.x, e.points[k - 1].x) - 0.5, y: Math.min(p.y, e.points[k - 1].y) - 0.5, w: Math.abs(p.x - e.points[k - 1].x) + 1, h: Math.abs(p.y - e.points[k - 1].y) + 1 }))),
  );
  if (blocked) return;
  ctx.els.push({
    kind: 'line',
    id: 'ds-callout-pointer',
    role: 'decoration',
    points: [{ x: x0, y }, { x: x1, y }],
    paint: { fill: 'none', stroke: 'accent', strokeWidth: ctx.theme.shape.stroke, dash: 'dotted' },
  });
}

function drawLegend(ctx: LayoutContext, rows: LegendItem[][], x0: number, y0: number) {
  const st = styles(ctx.theme).caption;
  const theme = ctx.theme;
  rows.forEach((row, ri) => {
    let x = x0;
    const y = y0 + ri * LEGEND_ROW;
    row.forEach((it, i) => {
      const id = `ds-legend-${ri}-${i}`;
      const sy = y + (LEGEND_ROW - SWATCH_H) / 2;
      let paint;
      if (it.kind === 'flow' && it.flow) {
        const f = it.flow;
        const ly = y + LEGEND_ROW / 2;
        ctx.els.push({ kind: 'line', id: `${id}-line`, role: 'legend', points: [{ x, y: ly }, { x: x + FLOW_W, y: ly }], paint: { fill: 'none', stroke: f.stroke, strokeWidth: 1.5, dash: f.dash }, arrowEnd: true, group: 'g-ds-legend' });
        if (f.badge) {
          addShape(ctx, {
            id: `${id}-badge`,
            role: 'legend',
            shape: f.badge.shape,
            x: x + FLOW_W + 6,
            y: y + (LEGEND_ROW - SWATCH_H) / 2,
            w: SWATCH_H,
            h: SWATCH_H,
            paint: { fill: f.badge.fill, stroke: 'none', strokeWidth: 0 },
            box: false,
            group: 'g-ds-legend',
          });
        }
        const tx = x + swatchWidth(it) + 6;
        addText(ctx, { id: `${id}-label`, role: 'legend', x: tx, y, lines: [it.label], ...st, lineHeight: LEGEND_ROW, anchor: 'start', color: 'inkMuted', group: 'g-ds-legend', slot: 'text' });
        x = tx + textWidth(ctx, it.label, st) + 20;
        return;
      }
      if (it.kind === 'line' && it.line) {
        const ly = y + LEGEND_ROW / 2;
        ctx.els.push({ kind: 'line', id: `${id}-line`, role: 'legend', points: [{ x, y: ly }, { x: x + SWATCH_W, y: ly }], paint: { fill: 'none', stroke: it.line.stroke, strokeWidth: it.line.width ?? 2, dash: it.line.dash }, group: 'g-ds-legend' });
        const tx = x + SWATCH_W + 6;
        addText(ctx, { id: `${id}-label`, role: 'legend', x: tx, y, lines: [it.label], ...st, lineHeight: LEGEND_ROW, anchor: 'start', color: 'inkMuted', group: 'g-ds-legend', slot: 'text' });
        x = tx + textWidth(ctx, it.label, st) + 20;
        return;
      }
      if (it.kind === 'swatch' && it.swatch) {
        addShape(ctx, {
          id: `${id}-swatch`,
          role: 'legend',
          shape: it.swatch.shape ?? 'rect',
          x,
          y: sy,
          w: SWATCH_H,
          h: SWATCH_H,
          radius: 2,
          paint: { fill: it.swatch.fill, stroke: 'none', strokeWidth: 0 },
          box: false,
          group: 'g-ds-legend',
        });
        const tx = x + SWATCH_H + 6;
        addText(ctx, { id: `${id}-label`, role: 'legend', x: tx, y, lines: [it.label], ...st, lineHeight: LEGEND_ROW, anchor: 'start', color: 'inkMuted', group: 'g-ds-legend', slot: 'text' });
        x = tx + textWidth(ctx, it.label, st) + 20;
        return;
      }
      if (it.kind === 'status' && it.status) {
        const look = it.status === 'retired' || it.status === 'at-risk' ? nodeLook(theme, 'normal', it.status) : badgeLook(theme, it.status, 'background');
        paint = it.status === 'retired' || it.status === 'at-risk' ? look.paint : { ...look.paint, stroke: statusToken(it.status), strokeWidth: 1 };
      } else if (it.kind === 'tag' && it.tag) {
        paint = { fill: tagToken(ctx.tagIndex.get(it.tag) ?? 0), stroke: 'none', strokeWidth: 0 };
      } else if (it.kind === 'emphasis') {
        paint = nodeLook(theme, it.emphasis ?? 'normal').paint;
      }
      if (paint) {
        addShape(ctx, {
          id: `${id}-swatch`,
          role: 'legend',
          shape: it.kind === 'status' && it.status !== 'retired' && it.status !== 'at-risk' ? 'pill' : 'rect',
          x,
          y: sy,
          w: it.kind === 'tag' ? SWATCH_H : SWATCH_W,
          h: SWATCH_H,
          radius: it.kind === 'tag' ? 2 : 3,
          paint: { ...paint, strokeWidth: Math.min(paint.strokeWidth, 1.5), shadow: false },
          box: false,
          group: 'g-ds-legend',
        });
      }
      const tx = x + (paint ? (it.kind === 'tag' ? SWATCH_H : SWATCH_W) + 6 : 0);
      addText(ctx, { id: `${id}-label`, role: 'legend', x: tx, y, lines: [it.label], ...st, lineHeight: LEGEND_ROW, anchor: 'start', color: 'inkMuted', group: 'g-ds-legend', slot: 'text' });
      x = tx + textWidth(ctx, it.label, st) + 20;
    });
  });
}
