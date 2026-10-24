/**
 * roadmap: horizons as columns (equal width, or proportional to dates with
 * `scale: "time"`), workstreams as rows, items as bars spanning horizons,
 * milestones on a track and gates as dashed lines across every row.
 */
import { inflate, intersects } from '../scene/geometry.js';
import type { Box } from '../scene/types.js';
import type { RoadmapBody, RoadmapItem, RoadmapMilestone } from '../spec.js';
import { bandLook, nodeLook, rulePaint } from '../theme/paint.js';
import { clamp, snap, snapDown, snapUp } from '../util.js';
import { type LayoutContext, addShape, addText, fitIssue, lh, styles, textWidth, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';
import { drawNode, nodeHeight } from './node.js';

const GAP = 16;
const ROW_PAD = 12;
const TRACK = 40;
const MS_ROW = 32;
const DIAMOND = 16;

function days(date: string, end: boolean): number {
  const [y, m, d] = date.split('-').map(Number);
  if (d) return Date.UTC(y, m - 1, d) / 864e5 + (end ? 1 : 0);
  return Date.UTC(y, end ? m : m - 1, 1) / 864e5;
}

export function layoutRoadmap(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as RoadmapBody;
  const { theme } = ctx;
  const st = styles(theme);
  const frame = beginFrame(ctx, { calloutSide: 'right' });
  const C = frame.content;
  const H = body.horizons;
  const hIndex = new Map(H.map((h, i) => [h.id, i]));
  const ms = body.milestones ?? [];
  const trackMs = ms.filter((m) => !m.workstream || m.kind === 'gate');
  const hasTrack = trackMs.length > 0;

  // Columns.
  const wsWords = Math.max(...body.workstreams.flatMap((w) => w.label.split(/\s+/).map((x) => textWidth(ctx, x, st.group))));
  const hw = clamp(snapUp(wsWords + 32), 136, 200);
  const AW = C.w - hw - 8;
  const x0 = C.x + hw + 8;
  let weights = H.map(() => 1);
  if (body.scale === 'time' && H.every((h) => h.start && h.end)) weights = H.map((h) => Math.max(1, days(h.end!, true) - days(h.start!, false)));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const hx: number[] = [x0];
  for (let i = 0; i < H.length; i++) hx.push(i === H.length - 1 ? x0 + snapDown(AW) : snap(hx[i] + (AW * weights[i]) / totalW));
  const colW = (i: number) => hx[i + 1] - hx[i];
  if (Math.min(...H.map((_, i) => colW(i))) < 64) fitIssue(ctx, 'ds-content', 'horizons are too narrow to read. Use fewer horizons or "scale": "equal".');

  // Bars: span, sub-row packing.
  const span = (it: RoadmapItem) => [hIndex.get(it.start) ?? 0, hIndex.get(it.end ?? it.start) ?? 0] as const;
  const barX = (it: RoadmapItem) => {
    const [a, b] = span(it);
    return { x: hx[a] + 8, w: hx[b + 1] - hx[a] - 16 };
  };
  const sub = new Map<string, number>();
  const subs = new Map<string, number>();
  for (const w of body.workstreams) {
    const rows: [number, number][][] = [];
    for (const it of body.items.filter((i) => i.workstream === w.id)) {
      const [a, b] = span(it);
      let r = rows.findIndex((row) => row.every(([s, e]) => b < s || a > e));
      if (r < 0) {
        rows.push([]);
        r = rows.length - 1;
      }
      rows[r].push([a, b]);
      sub.set(it.id, r);
    }
    subs.set(w.id, Math.max(1, rows.length));
  }
  const content = (it: RoadmapItem) => ({ label: it.label, description: it.description, metric: it.metric, owner: it.owner, status: it.status, tags: it.tags, icon: it.icon });
  const BH = Math.max(40, ...body.items.map((it) => nodeHeight(ctx, content(it), 'rect', barX(it).w, undefined, 40)));

  // Header row height.
  const hasDesc = H.some((h) => h.description);
  const HH = snapUp(lh(ctx, st.bodyStrong.size) + (hasDesc ? lh(ctx, st.caption.size) : 0) + 16);

  // Rows.
  const rowMs = (wid: string) => ms.filter((m) => m.workstream === wid && m.kind !== 'gate');
  const wsHead = (w: RoadmapBody['workstreams'][number]) =>
    wrap(ctx, w.label, hw - 24, st.group).length * lh(ctx, st.group.size) + (w.owner ? lh(ctx, st.caption.size) + 2 : 0) + 16;
  const rowH = body.workstreams.map((w) => {
    const n = subs.get(w.id) ?? 1;
    return snapUp(Math.max(2 * ROW_PAD + n * BH + (n - 1) * GAP + (rowMs(w.id).length ? MS_ROW : 0), wsHead(w)));
  });
  const top = C.y + HH + 8 + (hasTrack ? TRACK : 0);
  const need = rowH.reduce((a, b) => a + b, 0);
  if (!ctx.auto) {
    const extra = snapDown(C.y + C.h - top - need);
    if (extra < 0) fitIssue(ctx, 'ds-content', `the roadmap needs ${Math.ceil(need + top - C.y)} units of height but ${Math.floor(C.h)} are free. Merge items, use fewer workstreams, or set "canvas": { "aspect": "auto" }.`);
    else {
      const per = Math.min(48, snapDown(extra / body.workstreams.length));
      for (let i = 0; i < rowH.length; i++) rowH[i] += per;
    }
  }
  const rowY: number[] = [];
  let y = top;
  for (const h of rowH) {
    rowY.push(y);
    y += h;
  }
  const bottom = y;

  // Column tints (behind everything) and horizon headers.
  H.forEach((h, i) => {
    if (i % 2 === 1) {
      addShape(ctx, {
        id: `${h.id}--column`,
        role: 'decoration',
        shape: 'rect',
        x: hx[i],
        y: top,
        w: colW(i),
        h: bottom - top,
        paint: { fill: 'surface@60', stroke: 'none', strokeWidth: 0 },
        box: false,
      });
    }
    const cb: Box = { x: hx[i] + 2, y: C.y, w: colW(i) - 4, h: HH };
    addShape(ctx, {
      id: h.id,
      role: 'phase',
      shape: 'rect',
      ...cb,
      radius: Math.min(4, theme.shape.radius),
      paint: { fill: 'surfaceAlt', stroke: 'none', strokeWidth: 0 },
      inset: { l: 6, r: 6, t: 4, b: 4 },
      align: { group: 'horizons', axis: 'row' },
      meta: { specId: h.id, kind: 'horizon', label: h.label },
    });
    ctx.anchors.set(h.id, cb);
    const lines = wrap(ctx, h.label, cb.w - 12, st.bodyStrong).slice(0, 1);
    const desc = h.description ? wrap(ctx, h.description, cb.w - 12, st.caption).slice(0, 1) : [];
    const bh = lines.length * lh(ctx, st.bodyStrong.size) + desc.length * lh(ctx, st.caption.size);
    const ty = cb.y + (cb.h - bh) / 2;
    addText(ctx, { id: `${h.id}--label`, role: 'header', x: cb.x + cb.w / 2, y: ty, w: cb.w - 12, lines, ...st.bodyStrong, anchor: 'middle', color: 'text(ink,surfaceAlt)', box: h.id, slot: 'heading' });
    if (desc.length) addText(ctx, { id: `${h.id}--description`, role: 'header', x: cb.x + cb.w / 2, y: ty + lh(ctx, st.bodyStrong.size), w: cb.w - 12, lines: desc, ...st.caption, anchor: 'middle', color: 'text(inkMuted,surfaceAlt)', box: h.id, slot: 'description' });
  });

  // Workstream rows: header cell + separators.
  body.workstreams.forEach((w, i) => {
    const look = bandLook(theme, w.emphasis ?? 'normal');
    const hb: Box = { x: C.x, y: rowY[i] + 4, w: hw, h: rowH[i] - 8 };
    addShape(ctx, {
      id: w.id,
      role: 'lane',
      shape: 'rect',
      ...hb,
      radius: theme.shape.radius,
      paint: look.paint,
      inset: { l: 12, r: 12, t: 8, b: 8 },
      align: { group: 'workstreams', axis: 'column' },
      meta: { specId: w.id, kind: 'workstream', label: w.label, emphasis: w.emphasis ?? 'normal' },
    });
    ctx.anchors.set(w.id, { x: C.x, y: rowY[i], w: C.w, h: rowH[i] });
    const lines = wrap(ctx, w.label, hw - 24, st.group);
    const blockH = lines.length * lh(ctx, st.group.size) + (w.owner ? lh(ctx, st.caption.size) + 2 : 0);
    const ty = hb.y + (hb.h - blockH) / 2;
    addText(ctx, { id: `${w.id}--label`, role: 'header', x: hb.x + 12, y: ty, w: hw - 24, lines, ...st.group, anchor: 'start', color: look.ink, box: w.id, slot: 'heading' });
    if (w.owner) addText(ctx, { id: `${w.id}--owner`, role: 'header', x: hb.x + 12, y: ty + lines.length * lh(ctx, st.group.size) + 2, w: hw - 24, lines: [w.owner], ...st.caption, anchor: 'start', color: look.inkMuted, box: w.id, slot: 'owner' });
    if (i > 0) {
      ctx.els.push({ kind: 'line', id: `${w.id}--rule`, role: 'decoration', points: [{ x: C.x, y: rowY[i] }, { x: C.x + C.w, y: rowY[i] }], paint: rulePaint(theme) });
    }
  });

  // Gates: dashed lines across all rows (drawn before bars).
  const msX = (m: RoadmapMilestone) => {
    const i = hIndex.get(m.horizon) ?? 0;
    const at = m.at ?? (m.kind === 'gate' ? 'end' : 'middle');
    return snap(at === 'start' ? hx[i] : at === 'end' ? hx[i + 1] : (hx[i] + hx[i + 1]) / 2);
  };
  for (const g of ms.filter((m) => m.kind === 'gate')) {
    const x = msX(g);
    ctx.els.push({
      kind: 'line',
      id: `${g.id}--line`,
      role: 'decoration',
      points: [{ x, y: top - (hasTrack ? TRACK / 2 - DIAMOND / 2 - 6 : 0) }, { x, y: bottom }],
      paint: { ...rulePaint(theme, true, 'dashed'), stroke: g.emphasis === 'accent' ? 'accent' : 'lineStrong' },
    });
  }

  // Bars.
  for (const it of body.items) {
    const wi = body.workstreams.findIndex((w) => w.id === it.workstream);
    if (wi < 0) continue;
    const n = subs.get(it.workstream) ?? 1;
    const k = sub.get(it.id) ?? 0;
    const msH = rowMs(it.workstream).length ? MS_ROW : 0;
    const blockH = n * BH + (n - 1) * GAP;
    const by = snap(rowY[wi] + (rowH[wi] - msH - blockH) / 2 + k * (BH + GAP));
    const { x, w } = barX(it);
    drawNode(ctx, {
      id: it.id,
      specId: it.id,
      shape: 'rect',
      x,
      y: by,
      w,
      h: BH,
      look: nodeLook(theme, it.emphasis ?? 'normal', it.status),
      content: content(it),
      emphasis: it.emphasis,
      alignGroup: { group: `${it.workstream}-sub-${k}`, axis: 'row' },
      parent: it.workstream,
      kind: 'item',
      options: { align: 'start' },
    });
  }

  // Milestones: diamonds with labels beside them.
  const placedLabels: Box[] = [];
  const markers: Box[] = [];
  const drawMs = (m: RoadmapMilestone, cy: number, band: Box, onLine: boolean) => {
    const size = m.emphasis === 'accent' ? DIAMOND + 4 : DIAMOND;
    // Markers at the very start or end of the timeline stay inside it.
    const x = Math.min(hx[H.length] - size, Math.max(hx[0] + size, msX(m)));
    const b = { x: x - size / 2, y: cy - size / 2, w: size, h: size };
    markers.push(b);
    ctx.anchors.set(m.id, b);
    const gate = m.kind === 'gate';
    addShape(ctx, {
      id: m.id,
      role: 'marker',
      shape: 'diamond',
      ...b,
      paint: {
        fill: m.emphasis === 'accent' ? 'accent' : m.emphasis === 'highlight' ? 'highlight' : gate ? 'background' : 'lineStrong',
        stroke: m.emphasis === 'accent' ? 'accent' : 'lineStrong',
        strokeWidth: gate ? theme.shape.strokeStrong : 1,
      },
      group: `g-${m.id}`,
      meta: { specId: m.id, kind: gate ? 'gate' : 'milestone', label: m.label, emphasis: m.emphasis ?? 'normal' },
    });
    const lst = m.emphasis === 'accent' ? st.label : st.bodyStrong;
    const text = m.description ? `${m.label} · ${m.description}` : m.label;
    const w = Math.ceil(textWidth(ctx, text, lst));
    const h = lh(ctx, lst.size);
    // On the track, labels sit above the line so the line never runs through text.
    const ly = onLine ? cy - h - 3 : cy - h / 2;
    const lx = onLine ? 2 : 6;
    const cands: { b: Box; anchor: 'start' | 'end' }[] = [
      { b: { x: x + size / 2 + lx, y: ly, w, h }, anchor: 'start' },
      { b: { x: x - size / 2 - lx - w, y: ly, w, h }, anchor: 'end' },
    ];
    const free = (c: Box) =>
      c.x >= band.x && c.x + c.w <= band.x + band.w && ![...placedLabels, ...markers.filter((mb) => mb !== b)].some((o) => intersects(inflate(c, 3), o));
    let pick = cands.find((c) => free(c.b));
    if (!pick) {
      fitIssue(ctx, `${m.id}--label`, `the label for milestone "${m.id}" collides with a neighbour. Shorten it or move the milestone ("at": start/middle/end).`);
      pick = cands[0];
    }
    placedLabels.push(pick.b);
    addText(ctx, {
      id: `${m.id}--label`,
      role: 'label',
      x: pick.anchor === 'start' ? pick.b.x : pick.b.x + w,
      y: pick.b.y,
      w,
      lines: [text],
      ...lst,
      anchor: pick.anchor,
      color: m.emphasis === 'accent' ? 'text(accent,background)' : 'ink',
      free: true,
      group: `g-${m.id}`,
      slot: 'label',
    });
  };
  const trackBand: Box = { x: x0, y: C.y + HH + 8, w: AW, h: TRACK };
  if (hasTrack) {
    ctx.els.push({ kind: 'line', id: 'ds-track', role: 'decoration', points: [{ x: x0, y: trackBand.y + TRACK / 2 + 6 }, { x: x0 + snapDown(AW), y: trackBand.y + TRACK / 2 + 6 }], paint: rulePaint(theme) });
    for (const m of trackMs) drawMs(m, trackBand.y + TRACK / 2 + 6, { x: C.x, y: trackBand.y, w: C.w, h: TRACK }, true);
  }
  body.workstreams.forEach((w, i) => {
    const list = rowMs(w.id);
    if (!list.length) return;
    const cy = rowY[i] + rowH[i] - ROW_PAD - MS_ROW / 2 + 4;
    for (const m of list) drawMs(m, cy, { x: x0, y: rowY[i], w: AW, h: rowH[i] }, false);
  });

  endFrame(ctx, frame, bottom);
}
