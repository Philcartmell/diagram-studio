/**
 * waterfall: a starting level, the changes that move it, and the level they
 * reach. The engine runs the totals itself, so subtotals and the end bar
 * always add up; a stated end value that disagrees is a validation error.
 */
import type { WaterfallBody, WaterfallStep } from '../spec.js';
import type { Token } from '../theme/tokens.js';
import { snap } from '../util.js';
import { chartStyles, formatter, niceStep } from './chart.js';
import { type LayoutContext, addShape, addText, fitIssue, lh, textWidth, wrap } from './context.js';
import { type LegendItem, beginFrame, endFrame } from './frame.js';

export interface WaterfallBar {
  step: WaterfallStep;
  key: string;
  kind: 'start' | 'delta' | 'subtotal' | 'end';
  /** Level before and after this bar. */
  from: number;
  to: number;
  /** The figure printed on the bar. */
  value: number;
}

/** Run the levels: start and totals stand on zero, deltas float from the running total. */
export function waterfallBars(body: WaterfallBody): WaterfallBar[] {
  let level = 0;
  return body.steps.map((s, i) => {
    const kind = s.kind ?? (i === 0 ? 'start' : 'delta');
    const key = s.id ?? `step-${i + 1}`;
    if (kind === 'start') {
      level = s.value ?? 0;
      return { step: s, key, kind, from: 0, to: level, value: level };
    }
    if (kind === 'delta') {
      const from = level;
      level += s.value ?? 0;
      return { step: s, key, kind, from, to: level, value: s.value ?? 0 };
    }
    return { step: s, key, kind, from: 0, to: level, value: level };
  });
}

export function layoutWaterfall(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as WaterfallBody;
  const st = chartStyles(ctx);
  const bars = waterfallBars(body);
  const fmt = formatter(ctx, body.format, body.steps.map((s) => s.value));
  const direction = body.colors === 'direction';
  const good: Token = 'status.new';
  const bad: Token = 'status.at-risk';
  const legend: LegendItem[] = direction
    ? [
        { label: body.invert ? 'Decrease' : 'Increase', kind: 'swatch', swatch: { fill: good } },
        { label: body.invert ? 'Increase' : 'Decrease', kind: 'swatch', swatch: { fill: bad } },
      ]
    : [];
  const frame = beginFrame(ctx, { legend });
  const C = frame.content;
  const n = bars.length;

  let top = C.y;
  if (body.unit) {
    addText(ctx, { id: 'chart-unit', role: 'label', x: C.x, y: top, lines: [body.unit], ...st.caption, anchor: 'start', color: 'inkMuted', slot: 'text' });
    top += lh(ctx, st.caption.size) + 12;
  }
  const slotW = C.w / n;
  if (slotW < 48) fitIssue(ctx, 'ds-content', `${n} steps leave ${Math.floor(slotW)} units each; at least 48 are needed. Combine small changes into one "Other" step.`);
  const barW = snap(Math.min(96, Math.max(16, slotW * 0.62)));
  const labelLines = bars.map((b) => wrap(ctx, b.step.label, slotW - 6, st.category));
  const maxLines = Math.max(...labelLines.map((l) => l.length));
  if (maxLines > 3) fitIssue(ctx, bars[labelLines.findIndex((l) => l.length === maxLines)].key, `step label wraps to ${maxLines} lines; keep it to three. Shorten it.`);
  const labelY = C.y + C.h - maxLines * lh(ctx, st.category.size);
  const vLh = lh(ctx, st.total.size);

  // Floating levels only: a total's zero baseline does not count towards the range.
  const levels = bars.flatMap((b) => (b.kind === 'delta' ? [b.from, b.to] : [b.to]));
  const maxV = Math.max(0, ...levels);
  let minV = Math.min(0, ...levels);
  // When every level is well above zero and the changes are small beside it, break the
  // axis: totals start just under the lowest level and carry a break mark, so the changes
  // the chart is about get the height.
  const lowest = Math.min(...levels);
  const broken = (body.axis ?? 'auto') === 'auto' && lowest > 0 && maxV - lowest < 0.5 * lowest;
  if (broken) {
    const step = niceStep(maxV - lowest, 4);
    minV = Math.max(0, Math.floor((lowest - (maxV - lowest) * 0.8) / step) * step);
  }
  const plotTop = top + vLh + 6;
  const plotBottom = labelY - 8 - (minV < 0 ? vLh + 6 : 0);
  if (plotBottom - plotTop < 80) fitIssue(ctx, 'ds-content', `the bars get ${Math.floor(plotBottom - plotTop)} units of height; at least 80 are needed. Drop the subtitle or footnotes, or shorten step labels.`);
  const k = (plotBottom - plotTop) / Math.max(1e-9, maxV - minV);
  const yOf = (v: number) => plotTop + (maxV - Math.max(minV, v)) * k;
  const base = broken ? plotBottom : yOf(0);

  bars.forEach((b, i) => {
    const sx = C.x + i * slotW;
    const x = sx + (slotW - barW) / 2;
    const y0 = yOf(Math.max(b.from, b.to));
    const y1 = yOf(Math.min(b.from, b.to));
    const total = b.kind !== 'delta';
    const rise = b.to >= b.from;
    let fill: Token = total ? 'accent' : 'accent@40';
    if (!total && direction) fill = rise !== !!body.invert ? good : bad;
    // An accented change must still read as a change, not as another total.
    if (b.step.emphasis === 'accent') fill = total ? 'accent' : 'highlight';
    else if (b.step.emphasis === 'highlight') fill = 'highlight';
    else if (b.step.emphasis === 'muted') fill = 'line';
    const id = b.key;
    const group = `g-${b.key}`;
    addShape(ctx, {
      id,
      role: 'node',
      shape: 'rect',
      x,
      y: y0,
      w: barW,
      h: Math.max(1, y1 - y0),
      paint: { fill, stroke: 'none', strokeWidth: 0 },
      box: false,
      inset: { l: 2, r: 2, t: 1, b: 1 },
      group,
      meta: { specId: b.key, kind: 'bar', label: b.step.label, emphasis: b.step.emphasis },
    });
    if (broken && total) {
      // Axis break: two background-coloured slashes across the foot of the bar.
      for (const [k2, dy] of [16, 24].entries()) {
        ctx.els.push({ kind: 'line', id: `${id}--break-${k2 + 1}`, role: 'decoration', points: [{ x: x - 2, y: base - dy + 4 }, { x: x + barW + 2, y: base - dy - 4 }], paint: { fill: 'none', stroke: 'background', strokeWidth: 3 }, group });
      }
    }
    // Figures: totals on top; changes above a rise and below a fall.
    const text = fmt(b.value, { sign: !total });
    // Levels above zero and rises are labelled on top; falls and levels below zero underneath.
    const below = total ? b.value < 0 : !rise && b.value !== 0;
    const ty = below ? y1 + 4 : y0 - 4 - vLh;
    const tw = textWidth(ctx, text, st.total);
    if (tw > slotW - 4) fitIssue(ctx, b.key, `the figure "${text}" is wider than its column. Shorten the number format (a suffix such as "bn") or combine steps.`);
    addText(ctx, { id: `${id}--value`, role: 'label', x: x + barW / 2, y: ty, lines: [text], ...st.total, anchor: 'middle', color: total ? 'ink' : 'inkMuted', free: true, group, slot: 'text' });
    // Dotted connector to the next bar at the running level.
    if (i < n - 1) {
      const lvl = yOf(b.to);
      ctx.els.push({ kind: 'line', id: `${id}--link`, role: 'decoration', points: [{ x: x + barW, y: lvl }, { x: x + slotW, y: lvl }], paint: { fill: 'none', stroke: 'line', strokeWidth: ctx.theme.shape.stroke, dash: 'dotted' } });
    }
    addText(ctx, {
      id: `${id}--label`,
      role: 'label',
      x: sx + slotW / 2,
      y: labelY,
      w: slotW - 6,
      lines: labelLines[i],
      ...st.category,
      weight: total ? st.total.weight : st.category.weight,
      anchor: 'middle',
      color: 'ink',
      slot: 'text',
    });
  });
  ctx.els.push({ kind: 'line', id: 'chart-baseline', role: 'axis', points: [{ x: C.x, y: base }, { x: C.x + C.w, y: base }], paint: { fill: 'none', stroke: 'lineStrong', strokeWidth: ctx.theme.shape.stroke } });
  endFrame(ctx, frame, C.y + C.h);
}
