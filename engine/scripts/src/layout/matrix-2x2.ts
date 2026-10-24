/**
 * matrix-2x2: four named quadrants on two axes. Items sit at x/y (0–1) or are
 * spread inside a quadrant; their labels are placed beside the marker where
 * nothing else is, never on top of other text or markers.
 */
import { inflate, intersects } from '../scene/geometry.js';
import type { Box } from '../scene/types.js';
import type { MatrixBody, MatrixItem, QuadrantPosition } from '../spec.js';
import { bandLook, rulePaint, tagToken } from '../theme/paint.js';
import { snap, snapDown } from '../util.js';
import { type LayoutContext, addShape, addText, fitIssue, lh, styles, textWidth, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';

const GAP = 16;

interface Placed {
  item: MatrixItem;
  cx: number;
  cy: number;
  r: number;
}

export function layoutMatrix(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as MatrixBody;
  const { theme } = ctx;
  const st = styles(theme);
  const frame = beginFrame(ctx, { calloutSide: 'right' });
  const C = frame.content;
  const capLh = lh(ctx, st.caption.size);

  // Gutters for axis labels.
  const yLabels = [body.yAxis.high ?? 'High', body.yAxis.low ?? 'Low'];
  const xLabels = [body.xAxis.low ?? 'Low', body.xAxis.high ?? 'High'];
  const left = snap(Math.max(...yLabels.map((l) => textWidth(ctx, l, st.caption))) + 32);
  const topGutter = snap(lh(ctx, st.bodyStrong.size) + 8);
  const bottomGutter = snap(16 + capLh + 4 + lh(ctx, st.bodyStrong.size));
  let plotH = snapDown(C.h - topGutter - bottomGutter);
  let plotW = snapDown(C.w - left);
  if (ctx.auto) plotH = Math.min(plotH, 560);
  plotW = Math.min(plotW, snapDown(plotH * 2));
  const P: Box = { x: snap(C.x + left + (C.w - left - plotW) / 2), y: C.y + topGutter, w: plotW, h: plotH };
  const qw = (P.w - GAP) / 2;
  const qh = (P.h - GAP) / 2;
  const qBox: Record<QuadrantPosition, Box> = {
    'top-left': { x: P.x, y: P.y, w: qw, h: qh },
    'top-right': { x: P.x + qw + GAP, y: P.y, w: qw, h: qh },
    'bottom-left': { x: P.x, y: P.y + qh + GAP, w: qw, h: qh },
    'bottom-right': { x: P.x + qw + GAP, y: P.y + qh + GAP, w: qw, h: qh },
  };

  // Quadrants and their labels, at the outer corner of each.
  const reserved: Box[] = [];
  const qId = new Map<string, string>();
  for (const q of body.quadrants) {
    const b = qBox[q.position];
    const id = q.id ?? `quadrant-${q.position}`;
    qId.set(q.position, id);
    const look = bandLook(theme, q.emphasis ?? 'normal');
    addShape(ctx, {
      id,
      role: 'group',
      shape: 'rect',
      ...b,
      radius: theme.shape.radius,
      paint: look.paint,
      container: true,
      inset: { l: 12, r: 12, t: 10, b: 10 },
      meta: { specId: q.id, kind: 'quadrant', label: q.label, emphasis: q.emphasis ?? 'normal' },
    });
    if (q.id) ctx.anchors.set(q.id, b);
    const right = q.position.endsWith('right');
    const bottom = q.position.startsWith('bottom');
    const tw = Math.min(b.w - 24, Math.max(160, b.w * 0.55));
    const lLines = wrap(ctx, q.label, tw, st.group);
    const dLines = q.description ? wrap(ctx, q.description, tw, st.caption) : [];
    const blockH = lLines.length * lh(ctx, st.group.size) + (dLines.length ? 2 + dLines.length * capLh : 0);
    const x = right ? b.x + b.w - 12 : b.x + 12;
    let ty = bottom ? b.y + b.h - 10 - blockH : b.y + 10;
    const anchor = right ? 'end' : 'start';
    addText(ctx, { id: `${id}--label`, role: 'header', x, y: ty, w: tw, lines: lLines, ...st.group, anchor, color: look.ink, box: id, slot: 'heading' });
    ty += lLines.length * lh(ctx, st.group.size) + 2;
    if (dLines.length) addText(ctx, { id: `${id}--description`, role: 'header', x, y: ty, w: tw, lines: dLines, ...st.caption, anchor, color: look.inkMuted, box: id, slot: 'description' });
    const bw = Math.max(ctx.fonts.blockWidth(lLines, st.group.size, st.group.weight), ctx.fonts.blockWidth(dLines, st.caption.size, st.caption.weight));
    reserved.push({ x: right ? x - bw : x, y: bottom ? b.y + b.h - 10 - blockH : b.y + 10, w: bw, h: blockH });
  }

  // Axes.
  const ax = P.x - 12;
  const ay = P.y + P.h + 12;
  ctx.els.push({ kind: 'line', id: 'ds-axis-y', role: 'axis', points: [{ x: ax, y: P.y + P.h }, { x: ax, y: P.y }], paint: rulePaint(theme, true), arrowEnd: true });
  ctx.els.push({ kind: 'line', id: 'ds-axis-x', role: 'axis', points: [{ x: P.x, y: ay }, { x: P.x + P.w, y: ay }], paint: rulePaint(theme, true), arrowEnd: true });
  addText(ctx, { id: 'ds-axis-y-high', role: 'axis', x: ax - 8, y: P.y + 2, lines: [yLabels[0]], ...st.caption, anchor: 'end', color: 'inkMuted', slot: 'text' });
  addText(ctx, { id: 'ds-axis-y-low', role: 'axis', x: ax - 8, y: P.y + P.h - capLh, lines: [yLabels[1]], ...st.caption, anchor: 'end', color: 'inkMuted', slot: 'text' });
  addText(ctx, { id: 'ds-axis-x-low', role: 'axis', x: P.x, y: ay + 6, lines: [xLabels[0]], ...st.caption, anchor: 'start', color: 'inkMuted', slot: 'text' });
  addText(ctx, { id: 'ds-axis-x-high', role: 'axis', x: P.x + P.w, y: ay + 6, lines: [xLabels[1]], ...st.caption, anchor: 'end', color: 'inkMuted', slot: 'text' });
  addText(ctx, { id: 'ds-axis-x-title', role: 'axis', x: P.x + P.w / 2, y: ay + 6 + capLh, lines: [body.xAxis.label], ...st.bodyStrong, anchor: 'middle', color: 'ink', slot: 'heading' });
  addText(ctx, { id: 'ds-axis-y-title', role: 'axis', x: ax - 6, y: C.y, lines: [body.yAxis.label], ...st.bodyStrong, anchor: 'start', color: 'ink', slot: 'heading' });

  // Item positions. Each half of an axis maps into its own quadrant's interior,
  // so a marker never lands on the gutter or a quadrant border (0.5 counts as high).
  const pad = 20;
  const along = (v: number, start: number, half: number) =>
    v < 0.5 ? start + pad + (v / 0.5) * (half - 2 * pad) : start + half + GAP + pad + ((v - 0.5) / 0.5) * (half - 2 * pad);
  const placed: Placed[] = [];
  const byQuadrant = new Map<QuadrantPosition, MatrixItem[]>();
  for (const it of body.items) {
    if (it.x !== undefined && it.y !== undefined) {
      placed.push({
        item: it,
        cx: snap(along(it.x, P.x, qw)),
        cy: snap(P.y + P.h - (along(it.y, P.y, qh) - P.y)),
        r: it.emphasis === 'accent' ? 10 : 8,
      });
    } else if (it.quadrant) byQuadrant.set(it.quadrant, [...(byQuadrant.get(it.quadrant) ?? []), it]);
  }
  for (const [q, items] of byQuadrant) {
    const b = qBox[q];
    const right = q.endsWith('right');
    const bottom = q.startsWith('bottom');
    // Spread items over the half of the quadrant away from its label.
    const cols = Math.min(2, items.length);
    const rows = Math.ceil(items.length / cols);
    const area: Box = {
      x: b.x + 24 + (right ? 0 : b.w * 0.08),
      y: bottom ? b.y + 20 : b.y + b.h * 0.42,
      w: b.w * 0.6,
      h: b.h * 0.5,
    };
    if (right) area.x = b.x + 24;
    items.forEach((it, k) => {
      const r = Math.floor(k / cols);
      const c = k % cols;
      placed.push({
        item: it,
        cx: snap(area.x + ((c + 0.5) * area.w) / cols - 40),
        cy: snap(area.y + ((r + 0.5) * area.h) / rows),
        r: it.emphasis === 'accent' ? 10 : 8,
      });
    });
  }

  // Markers.
  const markerBoxes: Box[] = [];
  for (const p of placed) {
    const it = p.item;
    const fill = it.tags?.length
      ? tagToken(ctx.tagIndex.get(it.tags[0]) ?? 0)
      : it.emphasis === 'accent'
        ? 'accent'
        : it.emphasis === 'highlight'
          ? 'highlight'
          : it.emphasis === 'muted'
            ? 'line'
            : 'lineStrong';
    const q = qId.get(quadrantOf(qBox, p.cx, p.cy));
    const b = { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r };
    markerBoxes.push(b);
    ctx.anchors.set(it.id, b);
    addShape(ctx, {
      id: it.id,
      role: 'marker',
      shape: 'ellipse',
      ...b,
      paint: {
        fill,
        stroke: it.status === 'at-risk' ? 'status.atRisk' : 'background',
        strokeWidth: it.status === 'at-risk' ? theme.shape.strokeStrong : 1.5,
        dash: it.status === 'retired' ? 'dashed' : 'solid',
      },
      obstacle: true,
      parent: q,
      group: `g-${it.id}`,
      meta: { specId: it.id, kind: 'item', label: it.label, emphasis: it.emphasis ?? 'normal', status: it.status, tags: it.tags },
    });
  }

  // Labels: try right, left, above, below, then diagonals.
  const labelBoxes: Box[] = [];
  const textOf = (it: MatrixItem) => (it.status && it.status !== 'current' ? `${it.label} (${statusWord(it.status)})` : it.label);
  for (const p of placed) {
    const it = p.item;
    const lst = it.emphasis === 'accent' ? st.label : st.bodyStrong;
    const maxW = Math.min(200, qw * 0.5);
    const lines = wrap(ctx, textOf(it), maxW, lst);
    const mLines = it.metric ? [it.metric] : [];
    const w = Math.ceil(Math.max(ctx.fonts.blockWidth(lines, lst.size, lst.weight), ctx.fonts.blockWidth(mLines, st.caption.size, st.caption.weight)));
    const h = lines.length * lh(ctx, lst.size) + mLines.length * capLh;
    const g = p.r + 6;
    const cands: { b: Box; anchor: 'start' | 'end' | 'middle' }[] = [
      { b: { x: p.cx + g, y: p.cy - h / 2, w, h }, anchor: 'start' },
      { b: { x: p.cx - g - w, y: p.cy - h / 2, w, h }, anchor: 'end' },
      { b: { x: p.cx - w / 2, y: p.cy - g - h, w, h }, anchor: 'middle' },
      { b: { x: p.cx - w / 2, y: p.cy + g, w, h }, anchor: 'middle' },
      { b: { x: p.cx + g - 4, y: p.cy - g - h + 4, w, h }, anchor: 'start' },
      { b: { x: p.cx + g - 4, y: p.cy + g - 4, w, h }, anchor: 'start' },
      { b: { x: p.cx - g + 4 - w, y: p.cy - g - h + 4, w, h }, anchor: 'end' },
      { b: { x: p.cx - g + 4 - w, y: p.cy + g - 4, w, h }, anchor: 'end' },
    ];
    // Then beside the marker but shifted up or down a line, for crowded rows.
    for (const dy of [-1, 1, -2, 2]) {
      const sy = p.cy - h / 2 + dy * 12;
      cands.push({ b: { x: p.cx + g, y: sy, w, h }, anchor: 'start' }, { b: { x: p.cx - g - w, y: sy, w, h }, anchor: 'end' });
    }
    const qb = qBox[quadrantOf(qBox, p.cx, p.cy) as QuadrantPosition];
    const inside = (b: Box) => !(b.x < qb.x + 6 || b.y < qb.y + 6 || b.x + b.w > qb.x + qb.w - 6 || b.y + b.h > qb.y + qb.h - 6);
    const free = (b: Box) => inside(b) && ![...markerBoxes, ...labelBoxes, ...reserved].some((x) => intersects(inflate(b, 3), x));
    let pick = cands.find((c) => free(c.b));
    if (!pick) {
      // Name what is in the way, so the fix is obvious.
      const blockers = new Set<string>();
      for (const c of cands) {
        if (!inside(c.b)) blockers.add('the quadrant edge');
        const bb = inflate(c.b, 3);
        placed.forEach((o, k) => {
          if (o !== p && intersects(bb, markerBoxes[k])) blockers.add(`the marker of "${o.item.id}"`);
        });
        labelBoxes.forEach((lb, k) => {
          if (intersects(bb, lb)) blockers.add(`the label of "${placed[k].item.id}"`);
        });
        if (reserved.some((r) => intersects(bb, r))) blockers.add('the quadrant title');
      }
      fitIssue(
        ctx,
        `${it.id}--label`,
        `the label of "${it.id}" has no free spot inside its quadrant; it is blocked by ${[...blockers].slice(0, 3).join(', ')}. ` +
          'Nudge its x/y by about 0.05 away from them, shorten the label, or use "quadrant" placement.',
      );
      pick = cands[0];
    }
    labelBoxes.push(pick.b);
    const tx = pick.anchor === 'start' ? pick.b.x : pick.anchor === 'end' ? pick.b.x + w : pick.b.x + w / 2;
    addText(ctx, { id: `${it.id}--label`, role: 'label', x: tx, y: pick.b.y, w, lines, ...lst, anchor: pick.anchor, color: 'ink', free: true, group: `g-${it.id}`, slot: 'label' });
    if (mLines.length) {
      addText(ctx, { id: `${it.id}--metric`, role: 'label', x: tx, y: pick.b.y + lines.length * lh(ctx, lst.size), w, lines: mLines, ...st.caption, anchor: pick.anchor, color: 'inkMuted', free: true, group: `g-${it.id}`, slot: 'metric' });
    }
  }

  // Emit each marker next to its labels so editable exports can group them.
  const itemGroups = new Set(placed.map((p) => `g-${p.item.id}`));
  const isItem = (e: (typeof ctx.els)[number]) => 'group' in e && !!e.group && itemGroups.has(e.group);
  ctx.els = [...ctx.els.filter((e) => !isItem(e)), ...placed.flatMap((p) => ctx.els.filter((e) => 'group' in e && e.group === `g-${p.item.id}`))];

  endFrame(ctx, frame, ay + 6 + capLh + lh(ctx, st.bodyStrong.size));
}

function statusWord(s: string): string {
  return s === 'at-risk' ? 'at risk' : s;
}

function quadrantOf(q: Record<QuadrantPosition, Box>, x: number, y: number): string {
  for (const [k, b] of Object.entries(q)) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
  return 'top-left';
}
