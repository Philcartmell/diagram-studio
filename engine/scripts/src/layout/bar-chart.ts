/**
 * bar-chart: columns (vertical) or bars (horizontal), single, stacked, grouped
 * or 100% stacked. Figures sit on the data rather than on an axis: values
 * inside segments (or just beside them when a segment is too thin), totals on
 * top, series named beside the last bar, and difference arrows between bars.
 * The engine computes every total, share and difference from the values.
 */
import type { Box } from '../scene/types.js';
import type { BarCategory, BarChartBody, BarDelta } from '../spec.js';
import type { Token } from '../theme/tokens.js';
import { rulePaint } from '../theme/paint.js';
import { snap } from '../util.js';
import { type Formatter, chartStyles, formatter, inkOn, seriesFills, singleFill, sum } from './chart.js';
import { type LayoutContext, type TextStyle, addShape, addText, fitIssue, lh, textWidth, wrap } from './context.js';
import { type LegendItem, beginFrame, endFrame } from './frame.js';

interface Cat extends BarCategory {
  key: string;
  /** Values as drawn (shares of 100 in percent mode). */
  drawn: (number | null)[];
  total: number;
  pos: number;
  neg: number;
}

interface Prep {
  body: BarChartBody;
  mode: 'stacked' | 'grouped' | 'percent';
  single: boolean;
  cats: Cat[];
  fills: Token[];
  fmt: Formatter;
  pct: Formatter;
  showTotals: boolean;
  anyAccent: boolean;
}

const BADGE_W = 52;
const BADGE_H = 30;

function prepare(ctx: LayoutContext): Prep {
  const body = ctx.spec.body as unknown as BarChartBody;
  const single = body.series.length === 1;
  const mode = single ? 'stacked' : (body.mode ?? 'stacked');
  let cats: Cat[] = body.categories.map((c, i) => {
    const total = sum(c.values);
    const drawn = mode === 'percent' ? c.values.map((v) => (v === null || total === 0 ? v : (v / total) * 100)) : c.values;
    return {
      ...c,
      key: c.id ?? `category-${i + 1}`,
      drawn,
      total,
      // The extent the category reaches: a stack's sum, or a group's tallest bar.
      pos: mode === 'grouped' ? Math.max(0, ...drawn.map((v) => v ?? 0)) : sum(drawn.map((v) => (v !== null && v > 0 ? v : 0))),
      neg: mode === 'grouped' ? Math.min(0, ...drawn.map((v) => v ?? 0)) : sum(drawn.map((v) => (v !== null && v < 0 ? v : 0))),
    };
  });
  // Muted categories ("Other", a total) stay at the end, in their given order, whatever the sort.
  if (body.sort === 'descending' || body.sort === 'ascending') {
    const dir = body.sort === 'descending' ? -1 : 1;
    const ranked = cats.filter((c) => c.emphasis !== 'muted').sort((a, b) => dir * (a.total - b.total));
    cats = [...ranked, ...cats.filter((c) => c.emphasis === 'muted')];
  }
  const all = body.categories.flatMap((c) => c.values);
  return {
    body,
    mode,
    single,
    cats,
    fills: seriesFills(body.series, body.palette, ctx.seriesHues),
    fmt: formatter(ctx, body.format, all),
    pct: formatter(ctx, { suffix: '%', decimals: 0 }, []),
    showTotals: !single && mode === 'stacked' && body.totals !== false,
    anyAccent: body.categories.some((c) => c.emphasis === 'accent'),
  };
}

function fillOf(p: Prep, cat: Cat, si: number): Token {
  return p.single ? singleFill(p.fills[0], cat.emphasis, p.anyAccent) : p.fills[si];
}

function legendFor(ctx: LayoutContext, p: Prep, direct: boolean): LegendItem[] {
  const items: LegendItem[] = [];
  if (!p.single && !direct) {
    const order = p.body.series.map((s, i) => ({ s, fill: p.fills[i] }));
    // Stacked columns read top-down, so the legend lists the top series first.
    if ((p.body.orientation ?? 'vertical') === 'vertical' && p.mode !== 'grouped') order.reverse();
    for (const { s, fill } of order) items.push({ label: s.label, kind: 'swatch', swatch: { fill } });
  }
  if (p.body.badges && p.cats.some((c) => c.badge !== undefined)) items.push({ label: p.body.badges.label, kind: 'swatch', swatch: { fill: 'highlight', shape: 'hexagon' } });
  return items;
}

export function layoutBarChart(ctx: LayoutContext): void {
  const p = prepare(ctx);
  if ((p.body.orientation ?? 'vertical') === 'horizontal') layoutHorizontal(ctx, p);
  else layoutVertical(ctx, p);
}

// ---- Vertical (columns) ----------------------------------------------------

function layoutVertical(ctx: LayoutContext, p: Prep): void {
  const st = chartStyles(ctx);
  const { body, cats } = p;
  const n = cats.length;
  const valueLh = lh(ctx, st.value.size);
  const fullW = ctx.W - 2 * ctx.margin;

  // Series names beside the last column when they fit; a legend otherwise.
  const seriesW = Math.max(0, ...body.series.map((s) => textWidth(ctx, s.label, st.small)));
  const wantDirect = !p.single && p.mode !== 'grouped' && body.seriesLabels !== 'legend';
  const directW = wantDirect ? Math.min(180, seriesW) + 16 : 0;
  const direct = wantDirect && (body.seriesLabels === 'direct' || fullW - directW >= n * 72);
  const frame = beginFrame(ctx, { legend: legendFor(ctx, p, direct) });
  const C = frame.content;

  let top = C.y;
  if (body.unit) {
    addText(ctx, { id: 'chart-unit', role: 'label', x: C.x, y: top, lines: [body.unit], ...st.caption, anchor: 'start', color: 'inkMuted', slot: 'text' });
    top += lh(ctx, st.caption.size) + 12;
  }

  // Horizontal slots: groups get a wider gap; a difference arrow needs room after its target.
  const groupBreak = (i: number) => i > 0 && (cats[i].group ?? `\u0000${i}`) !== (cats[i - 1].group ?? `\u0000${i - 1}`);
  const hasGroups = cats.some((c) => c.group);
  const breaks = hasGroups ? cats.filter((_, i) => groupBreak(i)).length : 0;
  const GROUP_GAP = 40;
  const deltas = (body.deltas ?? []).map((d) => deltaInfo(ctx, p, d));
  // Values too thin to label inside sit just right of their segment.
  const outsideW = Math.max(0, ...cats.flatMap((c) => c.values.map((v) => (v === null ? 0 : textWidth(ctx, valueText(p, c, v), st.small)))));
  // A difference arrow sits right of its target column, beyond any figures beside that column.
  const extra = new Map<string, number>();
  for (const d of deltas) if (d) extra.set(d.to.key, Math.max(extra.get(d.to.key) ?? 0, outsideW + 12 + d.width + 8));
  const availW = C.w - (direct ? directW + outsideW + 8 : 0) - breaks * GROUP_GAP - [...extra.values()].reduce((a, b) => a + b, 0);
  const slotW = availW / n;
  if (slotW < 40) fitIssue(ctx, 'ds-content', `${n} columns leave ${Math.floor(slotW)} units each; at least 40 are needed. Remove categories, group them, or use "orientation": "horizontal".`);
  const barW = snap(Math.min(120, Math.max(16, slotW * (p.mode === 'grouped' ? 0.8 : 0.58))));
  const slots: { x: number; w: number }[] = [];
  let x = C.x;
  cats.forEach((c, i) => {
    if (hasGroups && groupBreak(i)) x += GROUP_GAP;
    slots.push({ x, w: slotW });
    x += slotW + (extra.get(c.key) ?? 0);
  });
  // Outside labels shrink the gap between bars; keep them clear of the neighbour.
  const pad = (slotW - barW) / 2;

  // Group headings with a rule, like "2030 ________".
  if (hasGroups) {
    const gst = st.group;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && !groupBreak(j + 1)) j++;
      const label = cats[i].group;
      if (label) {
        const x0 = slots[i].x;
        const x1 = slots[j].x + slots[j].w + (extra.get(cats[j].key) ?? 0);
        addText(ctx, { id: `group-${i + 1}`, role: 'header', x: x0, y: top, w: x1 - x0, lines: [label], ...gst, anchor: 'start', color: 'ink', slot: 'heading' });
        const ry = top + lh(ctx, gst.size) + 4;
        ctx.els.push({ kind: 'line', id: `group-${i + 1}--rule`, role: 'decoration', points: [{ x: x0, y: ry }, { x: x1, y: ry }], paint: rulePaint(ctx.theme) });
      }
      i = j + 1;
    }
    top += lh(ctx, gst.size) + 4 + 16;
  }

  // Bottom: badges, then category labels.
  let bottom = C.y + C.h;
  const badges = cats.some((c) => c.badge !== undefined);
  const badgeY = bottom - BADGE_H;
  if (badges) bottom = badgeY - 12;
  const labelLines = cats.map((c) => wrap(ctx, c.label, slotW - 8, st.category));
  const maxLines = Math.max(...labelLines.map((l) => l.length));
  if (maxLines > 3) fitIssue(ctx, cats[labelLines.findIndex((l) => l.length === maxLines)].key, `category label wraps to ${maxLines} lines; keep it to three. Shorten it or use "orientation": "horizontal".`);
  const catH = maxLines * lh(ctx, st.category.size);
  const labelY = bottom - catH;
  bottom = labelY - 8;

  // Vertical scale: room above for totals (and below negative bars for their labels).
  const maxV = Math.max(0, ...cats.map((c) => c.pos));
  const minV = Math.min(0, ...cats.map((c) => c.neg));
  const above = valueLh + 6;
  const below = minV < 0 ? valueLh + 6 : 0;
  const plotTop = top + above;
  const plotBottom = bottom - below;
  if (plotBottom - plotTop < 80) fitIssue(ctx, 'ds-content', `the columns get ${Math.floor(plotBottom - plotTop)} units of height; at least 80 are needed. Drop the subtitle or footnotes, shorten category labels, or give the chart more room.`);
  const k = (plotBottom - plotTop) / Math.max(1e-9, maxV - minV);
  const yOf = (v: number) => plotTop + (maxV - v) * k;
  const base = yOf(0);

  const bars = new Map<string, Box>();
  const totalBoxes = new Map<string, Box>();
  /** Figures beside thin segments, and how far right of its column each one reaches. */
  const figures: Box[] = [];
  const besideW = new Map<string, number>();
  const nS = body.series.length;
  cats.forEach((c, ci) => {
    const s = slots[ci];
    const bx = s.x + pad;
    const group = `g-${c.key}`;
    let up = 0;
    let down = 0;
    const outside: { y: number; text: string; id: string }[] = [];
    c.drawn.forEach((v, si) => {
      if (v === null || v === 0) return;
      const sid = body.series[si].id;
      let y0: number;
      let y1: number;
      let sx = bx;
      let sw = barW;
      if (p.mode === 'grouped') {
        sw = (barW - (nS - 1) * 2) / nS;
        sx = bx + si * (sw + 2);
        y0 = yOf(Math.max(0, v));
        y1 = yOf(Math.min(0, v));
      } else if (v > 0) {
        y0 = yOf(up + v);
        y1 = yOf(up);
        up += v;
      } else {
        y0 = yOf(down);
        y1 = yOf(down + v);
        down += v;
      }
      const id = `${c.key}--${sid}`;
      const fill = fillOf(p, c, si);
      addShape(ctx, {
        id,
        role: 'node',
        shape: 'rect',
        x: sx,
        y: y0,
        w: sw,
        h: Math.max(0.5, y1 - y0),
        paint: { fill, stroke: 'none', strokeWidth: 0 },
        box: false,
        inset: { l: 2, r: 2, t: 1, b: 1 },
        group,
        meta: { specId: p.single ? c.key : sid, kind: 'bar', label: `${c.label}: ${body.series[si].label}`, emphasis: p.single ? c.emphasis : body.series[si].emphasis },
      });
      if (body.labels === 'none') return;
      const text = valueText(p, c, c.values[si]!);
      const h = y1 - y0;
      if (p.mode === 'grouped' || p.single) {
        // One figure per bar, at its outer end.
        const sm = textWidth(ctx, text, st.value) <= sw + (p.single ? pad : 2) ? st.value : st.small;
        if (textWidth(ctx, text, sm) > sw + (p.single ? 2 * pad - 4 : 4)) return;
        const ty = v >= 0 ? y0 - 4 - lh(ctx, sm.size) : y1 + 4;
        addText(ctx, { id: `${id}--value`, role: 'label', x: sx + sw / 2, y: ty, lines: [text], ...(p.single ? st.total : sm), anchor: 'middle', color: 'ink', free: true, group, slot: 'text' });
        if (p.single) totalBoxes.set(c.key, { x: sx + sw / 2 - textWidth(ctx, text, st.total) / 2, y: ty, w: textWidth(ctx, text, st.total), h: lh(ctx, st.total.size) });
        return;
      }
      // Inside the segment at full size, else at the small size, else just beside the column.
      const inside = [st.value, st.small].find((x) => h >= lh(ctx, x.size) + 2 && textWidth(ctx, text, x) <= sw - 4);
      if (inside) {
        addText(ctx, { id: `${id}--value`, role: 'label', x: sx + sw / 2, y: y0 + h / 2 - lh(ctx, inside.size) / 2, lines: [text], ...inside, anchor: 'middle', color: inkOn(fill), box: id, group, slot: 'text' });
      } else outside.push({ y: y0 + h / 2, text, id: `${id}--value` });
    });
    // Thin segments: their figure just right of the column, spread so they never touch.
    const smLh = lh(ctx, st.small.size);
    const room = pad + (extra.get(c.key) ?? 0) + (ci === n - 1 && direct ? outsideW + 8 : 0) - 4;
    const fits = outside.filter((o) => textWidth(ctx, o.text, st.small) <= room);
    // Above the baseline: stack upwards from the baseline, so no figure touches the axis.
    let ceiling = base - 2;
    const beside = (o: { id: string; text: string }, ty: number) => {
      const tw = textWidth(ctx, o.text, st.small);
      addText(ctx, { id: o.id, role: 'label', x: bx + barW + 4, y: ty, lines: [o.text], ...st.small, anchor: 'start', color: 'inkMuted', free: true, group, slot: 'text' });
      figures.push({ x: bx + barW + 4, y: ty, w: tw, h: smLh });
      besideW.set(c.key, Math.max(besideW.get(c.key) ?? 0, tw));
    };
    for (const o of fits.filter((f) => f.y < base).sort((a, b) => b.y - a.y)) {
      const ty = Math.min(o.y - smLh / 2, ceiling - smLh);
      ceiling = ty;
      beside(o, ty);
    }
    let floor = base + 2;
    for (const o of fits.filter((f) => f.y >= base).sort((a, b) => a.y - b.y)) {
      const ty = Math.max(o.y - smLh / 2, floor);
      floor = ty + smLh;
      beside(o, ty);
    }
    const topY = yOf(p.mode === 'grouped' ? Math.max(0, ...c.drawn.map((v) => v ?? 0)) : up);
    bars.set(c.key, { x: bx, y: topY, w: barW, h: base - topY });
    if (p.showTotals) {
      const text = p.fmt(c.total);
      const tw = textWidth(ctx, text, st.total);
      const ty = topY - 4 - lh(ctx, st.total.size);
      addText(ctx, { id: `${c.key}--total`, role: 'label', x: bx + barW / 2, y: ty, lines: [text], ...st.total, anchor: 'middle', color: c.emphasis === 'accent' ? 'text(accent,background)' : 'ink', free: true, group, slot: 'text' });
      totalBoxes.set(c.key, { x: bx + barW / 2 - tw / 2, y: ty, w: tw, h: lh(ctx, st.total.size) });
    }
    addText(ctx, {
      id: `${c.key}--label`,
      role: 'label',
      x: s.x + s.w / 2,
      y: labelY,
      w: s.w - 8,
      lines: labelLines[ci],
      ...st.category,
      weight: c.emphasis === 'accent' ? st.total.weight : st.category.weight,
      anchor: 'middle',
      color: c.emphasis === 'accent' ? 'text(accent,background)' : 'ink',
      slot: 'text',
    });
    if (c.badge !== undefined) {
      const bf = formatter(ctx, body.badges?.format ?? body.format, cats.map((x) => x.badge));
      const id = `${c.key}--badge`;
      addShape(ctx, { id, role: 'badge', shape: 'hexagon', x: s.x + s.w / 2 - BADGE_W / 2, y: badgeY, w: BADGE_W, h: BADGE_H, paint: { fill: 'highlight', stroke: 'none', strokeWidth: 0 }, inset: { l: 6, r: 6, t: 2, b: 2 }, group: `${group}-badge` });
      addText(ctx, { id: `${id}--text`, role: 'badge', x: s.x + s.w / 2, y: badgeY + BADGE_H / 2 - lh(ctx, st.total.size) / 2, lines: [bf(c.badge)], ...st.total, anchor: 'middle', color: inkOn('highlight'), box: id, group: `${group}-badge`, slot: 'badge' });
    }
  });

  // Baseline across the columns.
  const x0 = slots[0].x;
  const x1 = slots[n - 1].x + slots[n - 1].w;
  ctx.els.push({ kind: 'line', id: 'chart-baseline', role: 'axis', points: [{ x: x0, y: base }, { x: x1, y: base }], paint: { fill: 'none', stroke: 'lineStrong', strokeWidth: ctx.theme.shape.stroke } });

  if (direct) directLabels(ctx, p, cats[n - 1], bars.get(cats[n - 1].key)!, yOf, outsideW, C);
  // Dashed levels break around figures and around any column they would otherwise cross.
  for (const d of deltas) if (d) drawDelta(ctx, d, bars, [...totalBoxes.values(), ...figures, ...bars.values()], besideW);
  endFrame(ctx, frame, C.y + C.h);
}

function valueText(p: Prep, c: Cat, v: number): string {
  if (p.mode === 'percent') return p.pct(c.total === 0 ? 0 : (v / c.total) * 100);
  return p.fmt(v);
}

/** Series names to the right of the last column, each level with its segment. */
function directLabels(ctx: LayoutContext, p: Prep, c: Cat, bar: Box, yOf: (v: number) => number, outsideW: number, C: Box) {
  const st = chartStyles(ctx);
  const smLh = lh(ctx, st.small.size);
  const x = bar.x + bar.w + 8 + outsideW + 8;
  const maxW = C.x + C.w - x;
  const items: { y: number; label: string; id: string; lines: string[] }[] = [];
  let up = 0;
  c.drawn.forEach((v, si) => {
    if (v === null || v <= 0) return;
    const mid = yOf(up + v / 2);
    up += v;
    const s = p.body.series[si];
    items.push({ y: mid, label: s.label, id: `series-${s.id}--label`, lines: wrap(ctx, s.label, maxW, st.small) });
  });
  // Spread downwards so names never overlap, then pull the block up if it runs past the baseline.
  let last = -Infinity;
  const placed = items
    .sort((a, b) => a.y - b.y)
    .map((it) => {
      const h = it.lines.length * smLh;
      const y = Math.max(it.y - h / 2, last + 2);
      last = y + h;
      return { ...it, top: y, h };
    });
  const over = last - yOf(0);
  if (over > 0) for (const it of placed) it.top -= over;
  for (const it of placed) addText(ctx, { id: it.id, role: 'label', x, y: it.top, w: maxW, lines: it.lines, ...st.small, anchor: 'start', color: 'inkMuted', free: true, slot: 'text' });
}

interface DeltaInfo {
  from: Cat;
  to: Cat;
  text: string;
  width: number;
}

function deltaInfo(ctx: LayoutContext, p: Prep, d: BarDelta): DeltaInfo | undefined {
  const st = chartStyles(ctx);
  const from = p.cats.find((c) => c.key === d.from);
  const to = p.cats.find((c) => c.key === d.to);
  if (!from || !to) return undefined;
  const diff = to.total - from.total;
  const show = d.show ?? 'absolute';
  const parts: string[] = [];
  if (show !== 'percent') parts.push(p.fmt(diff, { sign: true }));
  if (show !== 'absolute') parts.push(formatter(ctx, { suffix: '%', decimals: 0 }, [])(from.total === 0 ? 0 : (diff / from.total) * 100, { sign: true }));
  const text = d.label ?? (show === 'both' ? `${parts[0]} (${parts[1]})` : parts[0]);
  return { from, to, text, width: textWidth(ctx, text, st.total) };
}

/** A difference arrow: dashed levels from both columns and a vertical arrow beside the target. */
function drawDelta(ctx: LayoutContext, d: DeltaInfo, bars: Map<string, Box>, texts: Box[], besideW: Map<string, number>) {
  const st = chartStyles(ctx);
  const a = bars.get(d.from.key);
  const b = bars.get(d.to.key);
  if (!a || !b) return;
  // Clear of any figures beside the target column.
  const ax = b.x + b.w + (besideW.has(d.to.key) ? 4 + besideW.get(d.to.key)! + 10 : 12);
  const id = `delta-${d.from.key}-${d.to.key}`;
  const dash = { fill: 'none', stroke: 'line', strokeWidth: ctx.theme.shape.stroke, dash: 'dashed' as const };
  // Each level runs across to the arrow, broken around any figure in its way.
  const level = (y: number, x0: number, x1: number, suffix: string) => {
    const blockers = texts.filter((t) => y >= t.y - 2 && y <= t.y + t.h + 2 && t.x + t.w > x0 && t.x < x1).sort((u, v) => u.x - v.x);
    let x = x0;
    let k = 0;
    for (const t of blockers) {
      if (t.x - 4 > x) ctx.els.push({ kind: 'line', id: `${id}--${suffix}-${k++}`, role: 'decoration', points: [{ x, y }, { x: t.x - 4, y }], paint: dash });
      x = Math.max(x, t.x + t.w + 4);
    }
    if (x1 > x) ctx.els.push({ kind: 'line', id: `${id}--${suffix}-${k}`, role: 'decoration', points: [{ x, y }, { x: x1, y }], paint: dash });
  };
  level(a.y, a.x + a.w + 2, ax + 6, 'from');
  level(b.y, b.x + b.w + 2, ax + 6, 'to');
  if (Math.abs(b.y - a.y) >= 8) {
    ctx.els.push({ kind: 'line', id: `${id}--arrow`, role: 'decoration', points: [{ x: ax, y: a.y }, { x: ax, y: b.y }], paint: { fill: 'none', stroke: 'lineStrong', strokeWidth: ctx.theme.shape.stroke + 0.25 }, arrowEnd: true });
  }
  const ty = Math.min(a.y, b.y) + Math.abs(b.y - a.y) / 2 - lh(ctx, st.total.size) / 2;
  addText(ctx, { id: `${id}--label`, role: 'label', x: ax + 8, y: ty, lines: [d.text], ...st.total, anchor: 'start', color: 'ink', free: true, slot: 'text' });
}

// ---- Horizontal (bars) -----------------------------------------------------

function layoutHorizontal(ctx: LayoutContext, p: Prep): void {
  const st = chartStyles(ctx);
  const { body, cats } = p;
  const n = cats.length;
  const frame = beginFrame(ctx, { legend: legendFor(ctx, p, false) });
  const C = frame.content;
  let top = C.y;
  const capLh = lh(ctx, st.caption.size);
  if (body.unit) top += capLh + 12;

  // Label column on the left, figures at the bar ends.
  const labelColW = Math.min(Math.max(...cats.map((c) => textWidth(ctx, c.label, st.category))) + 4, snap(C.w * 0.32));
  const labelLines = cats.map((c) => wrap(ctx, c.label, labelColW, st.category));
  const endText = (c: Cat, v: number) => (p.mode === 'percent' ? p.pct(c.total === 0 ? 0 : (v / c.total) * 100) : p.fmt(v));
  const endStyle: TextStyle = p.single ? st.total : st.value;
  const endW = (c: Cat) => {
    if (body.labels === 'none') return 0;
    if (p.mode === 'grouped') return Math.max(0, ...c.values.map((v) => (v === null ? 0 : textWidth(ctx, endText(c, v), st.small))));
    if (p.showTotals || p.single) return textWidth(ctx, p.fmt(c.total), endStyle);
    return 0;
  };
  const maxEnd = Math.max(0, ...cats.map(endW));
  const maxV = Math.max(0, ...cats.map((c) => c.pos));
  const minV = Math.min(0, ...cats.map((c) => c.neg));
  const plotX = C.x + labelColW + 16 + (minV < 0 ? maxEnd + 6 : 0);
  const plotW = C.x + C.w - plotX - (maxEnd ? maxEnd + 8 : 0);
  const k = plotW / Math.max(1e-9, maxV - minV);
  const xOf = (v: number) => plotX + (v - minV) * k;
  const base = xOf(0);

  const rowH = (C.y + C.h - top) / n;
  const needH = Math.max(...labelLines.map((l) => l.length)) * lh(ctx, st.category.size) + 6;
  if (rowH < needH || rowH < 18) fitIssue(ctx, 'ds-content', `${n} bars leave ${Math.floor(rowH)} units per row; ${Math.ceil(Math.max(needH, 18))} are needed. Remove categories, shorten labels, or give the chart more room.`);
  const barH = snap(Math.min(36, Math.max(8, rowH * (p.mode === 'grouped' ? 0.78 : 0.6))), 2);
  if (body.unit) addText(ctx, { id: 'chart-unit', role: 'label', x: plotX, y: C.y, lines: [body.unit], ...st.caption, anchor: 'start', color: 'inkMuted', slot: 'text' });

  const nS = body.series.length;
  cats.forEach((c, ci) => {
    const ry = top + ci * rowH;
    const by = ry + (rowH - barH) / 2;
    const group = `g-${c.key}`;
    let right = 0;
    let left = 0;
    c.drawn.forEach((v, si) => {
      if (v === null || v === 0) return;
      const sid = body.series[si].id;
      let x0: number;
      let x1: number;
      let sy = by;
      let sh = barH;
      if (p.mode === 'grouped') {
        sh = (barH - (nS - 1) * 2) / nS;
        sy = by + si * (sh + 2);
        x0 = xOf(Math.min(0, v));
        x1 = xOf(Math.max(0, v));
      } else if (v > 0) {
        x0 = xOf(right);
        x1 = xOf(right + v);
        right += v;
      } else {
        x0 = xOf(left + v);
        x1 = xOf(left);
        left += v;
      }
      const id = `${c.key}--${sid}`;
      const fill = fillOf(p, c, si);
      addShape(ctx, {
        id,
        role: 'node',
        shape: 'rect',
        x: x0,
        y: sy,
        w: Math.max(0.5, x1 - x0),
        h: sh,
        paint: { fill, stroke: 'none', strokeWidth: 0 },
        box: false,
        inset: { l: 3, r: 3, t: 0, b: 0 },
        group,
        meta: { specId: p.single ? c.key : sid, kind: 'bar', label: `${c.label}: ${body.series[si].label}`, emphasis: p.single ? c.emphasis : body.series[si].emphasis },
      });
      if (body.labels === 'none') return;
      const text = endText(c, c.values[si]!);
      if (p.mode === 'grouped') {
        const sLh = lh(ctx, st.small.size);
        if (sh < sLh - 2) return;
        addText(ctx, { id: `${id}--value`, role: 'label', x: v >= 0 ? x1 + 4 : x0 - 4, y: sy + sh / 2 - sLh / 2, lines: [text], ...st.small, anchor: v >= 0 ? 'start' : 'end', color: 'ink', free: true, group, slot: 'text' });
        return;
      }
      if (p.single) return;
      const vLh = lh(ctx, st.value.size);
      if (x1 - x0 >= textWidth(ctx, text, st.value) + 6 && sh >= vLh) {
        addText(ctx, { id: `${id}--value`, role: 'label', x: (x0 + x1) / 2, y: sy + sh / 2 - vLh / 2, lines: [text], ...st.value, anchor: 'middle', color: inkOn(fill), box: id, group, slot: 'text' });
      }
    });
    if (body.labels !== 'none' && (p.single || p.showTotals)) {
      const text = p.fmt(c.total);
      const eLh = lh(ctx, endStyle.size);
      const neg = c.total < 0;
      addText(ctx, { id: `${c.key}--total`, role: 'label', x: neg ? xOf(left) - 6 : xOf(right) + 6, y: by + barH / 2 - eLh / 2, lines: [text], ...endStyle, anchor: neg ? 'end' : 'start', color: c.emphasis === 'accent' ? 'text(accent,background)' : 'ink', free: true, group, slot: 'text' });
    }
    const lLh = lh(ctx, st.category.size);
    addText(ctx, {
      id: `${c.key}--label`,
      role: 'label',
      x: C.x + labelColW,
      y: ry + rowH / 2 - (labelLines[ci].length * lLh) / 2,
      w: labelColW,
      lines: labelLines[ci],
      ...st.category,
      weight: c.emphasis === 'accent' ? st.total.weight : st.category.weight,
      anchor: 'end',
      color: c.emphasis === 'accent' ? 'text(accent,background)' : 'ink',
      slot: 'text',
    });
  });
  ctx.els.push({ kind: 'line', id: 'chart-baseline', role: 'axis', points: [{ x: base, y: top }, { x: base, y: top + n * rowH }], paint: { fill: 'none', stroke: 'lineStrong', strokeWidth: ctx.theme.shape.stroke } });
  endFrame(ctx, frame, C.y + C.h);
}
