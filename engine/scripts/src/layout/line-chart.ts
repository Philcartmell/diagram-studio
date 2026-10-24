/**
 * line-chart: values over time as lines on light gridlines, each line named
 * at its end with its last value (a legend only when asked), plus an
 * optional reference line and vertical event markers.
 */
import type { LineChartBody } from '../spec.js';
import { snap } from '../util.js';
import { chartStyles, formatter, lineStrokes, niceDomain } from './chart.js';
import { type LayoutContext, addShape, addText, fitIssue, lh, textWidth } from './context.js';
import { type LegendItem, beginFrame, endFrame } from './frame.js';

export function layoutLineChart(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as LineChartBody;
  const st = chartStyles(ctx);
  const strokes = lineStrokes(body.series, ctx.seriesHues);
  const useLegend = body.labels === 'legend';
  const legend: LegendItem[] = useLegend
    ? body.series.map((s, i) => ({ label: s.label, kind: 'line', line: { stroke: strokes[i], dash: s.style === 'dashed' ? 'dashed' : undefined, width: 2.5 } }))
    : [];
  const frame = beginFrame(ctx, { legend });
  const C = frame.content;
  const values = body.series.flatMap((s) => s.values).filter((v): v is number => typeof v === 'number');
  const fmt = formatter(ctx, body.format, values);
  const capLh = lh(ctx, st.caption.size);
  const smLh = lh(ctx, st.small.size);

  // Value domain: the data (and any reference line), rounded out to tidy ticks.
  const lo = Math.min(...values, body.reference?.value ?? Infinity);
  const hi = Math.max(...values, body.reference?.value ?? -Infinity);
  const dom = niceDomain(body.yAxis?.min ?? lo, body.yAxis?.max ?? hi, 5);
  const yMin = body.yAxis?.min ?? dom.min;
  const yMax = body.yAxis?.max ?? dom.max;
  const ticks = dom.ticks.filter((t) => t >= yMin - 1e-9 && t <= yMax + 1e-9);
  const tickFmt = formatter(ctx, { ...body.format, decimals: undefined }, ticks);

  let top = C.y;
  if (body.unit) {
    addText(ctx, { id: 'chart-unit', role: 'label', x: C.x, y: top, lines: [body.unit], ...st.caption, anchor: 'start', color: 'inkMuted', slot: 'text' });
    top += capLh + 12;
  }
  if (body.annotations?.length) top += smLh + 6;

  // End labels: "Series  240" at the right of each line.
  const lastIdx = body.series.map((s) => {
    for (let i = s.values.length - 1; i >= 0; i--) if (typeof s.values[i] === 'number') return i;
    return -1;
  });
  const endText = body.series.map((s, i) => (lastIdx[i] >= 0 ? `${s.label}  ${fmt(s.values[lastIdx[i]] as number)}` : s.label));
  const endW = useLegend ? 0 : Math.min(snap(C.w * 0.28), Math.max(...endText.map((t) => textWidth(ctx, t, st.total))) + 12);
  if (!useLegend && endW >= snap(C.w * 0.28) && endText.some((t) => textWidth(ctx, t, st.total) + 12 > endW))
    fitIssue(ctx, 'ds-content', 'series names are too long to sit at the line ends. Shorten them or set "labels": "legend".');
  const tickW = Math.max(...ticks.map((t) => textWidth(ctx, tickFmt(t), st.small)));
  const plotX = C.x + tickW + 10;
  const plotW = C.x + C.w - endW - plotX;
  const xLabelH = smLh + 8;
  const plotTop = top + smLh / 2;
  const plotBottom = C.y + C.h - xLabelH;
  if (plotBottom - plotTop < 100) fitIssue(ctx, 'ds-content', `the plot gets ${Math.floor(plotBottom - plotTop)} units of height; at least 100 are needed. Give the chart more room or drop the subtitle.`);
  const nX = body.x.length;
  const xOf = (i: number) => plotX + (nX === 1 ? plotW / 2 : (i * plotW) / (nX - 1));
  const yOf = (v: number) => plotTop + ((yMax - v) / (yMax - yMin || 1)) * (plotBottom - plotTop);

  // Gridlines and tick labels.
  ticks.forEach((t, i) => {
    const y = yOf(t);
    const strong = i === 0;
    ctx.els.push({ kind: 'line', id: `grid-${i + 1}`, role: strong ? 'axis' : 'decoration', points: [{ x: plotX, y }, { x: plotX + plotW, y }], paint: { fill: 'none', stroke: strong ? 'lineStrong' : 'line@45', strokeWidth: strong ? ctx.theme.shape.stroke : 0.75 } });
    addText(ctx, { id: `grid-${i + 1}--label`, role: 'axis', x: plotX - 8, y: y - smLh / 2, lines: [tickFmt(t)], ...st.small, anchor: 'end', color: 'inkMuted', slot: 'text' });
  });

  // X labels: thinned so they never touch.
  const xw = Math.max(...body.x.map((l) => textWidth(ctx, l, st.small)));
  const dx = nX > 1 ? plotW / (nX - 1) : plotW;
  const every = Math.max(1, Math.ceil((xw + 12) / dx));
  const lastShown = Math.floor((nX - 1) / every) * every;
  // The final label too, when it clears the one before it.
  const showLast = lastShown !== nX - 1 && (nX - 1 - lastShown) * dx >= xw + 12;
  body.x.forEach((l, i) => {
    if (i % every !== 0 && !(showLast && i === nX - 1)) return;
    addText(ctx, { id: `x-${i + 1}`, role: 'axis', x: xOf(i), y: plotBottom + 6, lines: [l], ...st.small, anchor: 'middle', color: 'inkMuted', slot: 'text' });
  });

  if (body.reference) {
    const y = yOf(body.reference.value);
    ctx.els.push({ kind: 'line', id: 'reference', role: 'decoration', points: [{ x: plotX, y }, { x: plotX + plotW, y }], paint: { fill: 'none', stroke: 'lineStrong', strokeWidth: ctx.theme.shape.stroke, dash: 'dashed' } });
    if (body.reference.label) addText(ctx, { id: 'reference--label', role: 'label', x: plotX + 4, y: y - 2 - smLh, lines: [body.reference.label], ...st.small, anchor: 'start', color: 'inkMuted', slot: 'text' });
  }

  for (const [i, a] of (body.annotations ?? []).entries()) {
    const xi = body.x.indexOf(a.at);
    if (xi < 0) continue;
    const x = xOf(xi);
    ctx.els.push({ kind: 'line', id: `annotation-${i + 1}`, role: 'decoration', points: [{ x, y: plotTop - 4 }, { x, y: plotBottom }], paint: { fill: 'none', stroke: 'inkMuted', strokeWidth: 1, dash: 'dotted' } });
    const tw = textWidth(ctx, a.label, st.small);
    const anchor = x + tw + 4 > plotX + plotW ? 'end' : 'start';
    addText(ctx, { id: `annotation-${i + 1}--label`, role: 'label', x: anchor === 'start' ? x + 4 : x - 4, y: plotTop - 6 - smLh, lines: [a.label], ...st.small, anchor, color: 'inkMuted', slot: 'text' });
  }

  // Lines: accented or highlighted series drawn last, on top.
  const order = body.series.map((_, i) => i).sort((a, b) => rank(body.series[a].emphasis) - rank(body.series[b].emphasis));
  for (const si of order) {
    const s = body.series[si];
    const width = s.emphasis === 'accent' ? 3 : 2.25;
    // Gaps (null values) break the line into runs.
    let run: { x: number; y: number }[] = [];
    let k = 0;
    const flush = () => {
      if (run.length >= 2) ctx.els.push({ kind: 'line', id: `${s.id}--line-${++k}`, role: 'edge', points: run, paint: { fill: 'none', stroke: strokes[si], strokeWidth: width, dash: s.style === 'dashed' ? 'dashed' : undefined }, group: `g-${s.id}` });
      run = [];
    };
    s.values.forEach((v, i) => {
      if (typeof v !== 'number') return flush();
      run.push({ x: xOf(i), y: yOf(v) });
    });
    flush();
    if (body.markers) {
      s.values.forEach((v, i) => {
        if (typeof v !== 'number') return;
        addShape(ctx, { id: `${s.id}--point-${i + 1}`, role: 'marker', shape: 'ellipse', x: xOf(i) - 3.5, y: yOf(v) - 3.5, w: 7, h: 7, paint: { fill: strokes[si], stroke: 'background', strokeWidth: 1 }, box: false, group: `g-${s.id}` });
      });
    }
  }

  // End labels, spread so they never overlap.
  if (!useLegend) {
    const tLh = lh(ctx, st.total.size);
    const items = body.series
      .map((s, i) => ({ i, y: lastIdx[i] >= 0 ? yOf(s.values[lastIdx[i]] as number) : plotBottom, text: endText[i] }))
      .sort((a, b) => a.y - b.y);
    let last = -Infinity;
    const placed = items.map((it) => {
      const y = Math.max(it.y - tLh / 2, last + 2);
      last = y + tLh;
      return { ...it, top: y };
    });
    const over = last - (plotBottom + xLabelH);
    if (over > 0) for (const it of placed) it.top -= over;
    for (const it of placed) {
      const s = body.series[it.i];
      addText(ctx, { id: `${s.id}--label`, role: 'label', x: plotX + plotW + 10, y: it.top, lines: [it.text], ...st.total, weight: s.emphasis === 'accent' ? st.total.weight : st.value.weight, anchor: 'start', color: `text(${strokes[it.i]},background)`, slot: 'text' });
    }
  }
  endFrame(ctx, frame, C.y + C.h);
}

function rank(e: string | undefined): number {
  return e === 'accent' ? 3 : e === 'highlight' ? 2 : e === 'muted' ? 0 : 1;
}
