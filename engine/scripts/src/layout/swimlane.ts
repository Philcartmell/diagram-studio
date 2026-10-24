/**
 * swimlane: ELK (layered, phases as partitions) assigns each step a column;
 * steps then snap into lane rows on the grid and the orthogonal router draws
 * connectors that never cross a box.
 */
import ELKModule from 'elkjs/lib/elk.bundled.js';
import type { Box, Point, ShapeKind, Side, TextEl } from '../scene/types.js';
import type { StepShape, SwimlaneBody, SwimlaneStep } from '../spec.js';
import { bandLook, connectorPaint, nodeLook } from '../theme/paint.js';
import { clamp, snap, snapDown, snapUp } from '../util.js';
import { type LayoutContext, addShape, addText, fitIssue, lh, styles, textWidth, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';
import { collectObstacles, placeAlongRoute } from './labels.js';
import { drawNode, nodeHeight } from './node.js';
import { type RouteNode, Router } from './router.js';
import { segmentsCross } from '../scene/geometry.js';

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  layoutOptions?: Record<string, string>;
}
interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: { id: string; sources: string[]; targets: string[] }[];
}
const ELK = ((ELKModule as unknown as { default?: unknown }).default ?? ELKModule) as new () => {
  layout(g: ElkGraph): Promise<ElkGraph>;
};

const SHAPE: Record<StepShape, ShapeKind> = {
  task: 'rect',
  decision: 'diamond',
  start: 'pill',
  end: 'pill',
  document: 'document',
  system: 'predefined',
  wait: 'delay',
};

const CHANNEL = 48;
const ROW_PAD = 24;
const SUB_GAP = 24;

const snap16 = (v: number) => Math.floor(v / 16) * 16;
const snap16Up = (v: number) => Math.ceil(v / 16) * 16;

function isForward(body: SwimlaneBody, phaseOf: (s: SwimlaneStep) => number, e: SwimlaneBody['edges'][number], byId: Map<string, SwimlaneStep>) {
  const a = byId.get(e.from)!;
  const b = byId.get(e.to)!;
  return e.kind !== 'feedback' && phaseOf(a) <= phaseOf(b);
}

/** Column per step from ELK's layered layering; phases are contiguous column ranges. */
async function assignColumns(body: SwimlaneBody, phaseOf: (s: SwimlaneStep) => number) {
  const byId = new Map(body.steps.map((s) => [s.id, s]));
  const nPhases = Math.max(1, body.phases?.length ?? 0);
  const graph: ElkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.randomSeed': '1',
      'elk.partitioning.activate': body.phases?.length ? 'true' : 'false',
      'elk.layered.spacing.nodeNodeBetweenLayers': '20',
      'elk.spacing.nodeNode': '10',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: body.steps.map((s) => ({
      id: s.id,
      width: 40,
      height: 20,
      layoutOptions: body.phases?.length ? { 'elk.partitioning.partition': String(phaseOf(s)) } : undefined,
    })),
    edges: body.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to) && isForward(body, phaseOf, e, byId))
      .map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
  };
  const res = await new ELK().layout(graph);
  const xOf = new Map(res.children.map((c) => [c.id, Math.round(c.x ?? 0)]));
  // Remap per phase so every phase owns a contiguous run of columns.
  const col = new Map<string, number>();
  const phaseSpan: [number, number][] = [];
  let next = 0;
  for (let p = 0; p < nPhases; p++) {
    const steps = body.steps.filter((s) => phaseOf(s) === p);
    const xs = [...new Set(steps.map((s) => xOf.get(s.id)!))].sort((a, b) => a - b);
    if (!xs.length) {
      phaseSpan.push([next, next]);
      next++;
      continue;
    }
    for (const s of steps) col.set(s.id, next + xs.indexOf(xOf.get(s.id)!));
    phaseSpan.push([next, next + xs.length - 1]);
    next += xs.length;
  }
  return { col, phaseSpan, cols: next };
}

/**
 * Compact layering for long processes: a handoff to another lane may stay in
 * the same column (drawn as a vertical arrow); only same-lane successors move
 * right. Used when one-step-per-column does not fit the canvas.
 */
function compactColumns(body: SwimlaneBody, phaseOf: (s: SwimlaneStep) => number) {
  const steps = body.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const order = new Map(steps.map((s, i) => [s.id, i]));
  let edges = body.edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && isForward(body, phaseOf, e, byId));
  // Break cycles: drop back edges found by a DFS in spec order.
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map<string, number>();
  const back = new Set<string>();
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of out.get(u) ?? []) {
      if (state.get(v) === 1) back.add(`${u}>${v}`);
      else if (!state.get(v)) dfs(v);
    }
    state.set(u, 2);
  };
  for (const s of steps) if (!state.get(s.id)) dfs(s.id);
  edges = edges.filter((e) => !back.has(`${e.from}>${e.to}`));
  // Topological order, ties broken by spec order.
  const indeg = new Map(steps.map((s) => [s.id, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const ready = steps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  const topo: SwimlaneStep[] = [];
  while (ready.length) {
    ready.sort((a, b) => order.get(a)! - order.get(b)!);
    const u = ready.shift()!;
    topo.push(byId.get(u)!);
    for (const e of edges.filter((x) => x.from === u)) {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) ready.push(e.to);
    }
  }
  const col = new Map<string, number>();
  const used = new Set<string>();
  const phaseSpan: [number, number][] = [];
  let start = 0;
  for (let p = 0; p < Math.max(1, body.phases?.length ?? 0); p++) {
    let maxCol = start - 1;
    for (const s of topo.filter((t) => phaseOf(t) === p)) {
      let c = start;
      for (const e of edges.filter((x) => x.to === s.id)) {
        const pc = col.get(e.from);
        if (pc !== undefined) c = Math.max(c, pc + (byId.get(e.from)!.lane === s.lane ? 1 : 0));
      }
      while (used.has(`${s.lane}|${c}`)) c++;
      col.set(s.id, c);
      used.add(`${s.lane}|${c}`);
      maxCol = Math.max(maxCol, c);
    }
    if (maxCol < start) {
      phaseSpan.push([start, start]);
      start++;
    } else {
      phaseSpan.push([start, maxCol]);
      start = maxCol + 1;
    }
  }
  return { col, phaseSpan, cols: start };
}

export async function layoutSwimlane(ctx: LayoutContext): Promise<void> {
  const body = ctx.spec.body as unknown as SwimlaneBody;
  const { theme } = ctx;
  const st = styles(theme);
  const horizontal = (body.orientation ?? 'horizontal') === 'horizontal';
  const phases = body.phases ?? [];
  const phaseOf = (s: SwimlaneStep) => (phases.length ? Math.max(0, phases.indexOf(s.phase ?? '')) : 0);
  const byId = new Map(body.steps.map((s) => [s.id, s]));
  const laneIndex = new Map(body.lanes.map((l, i) => [l.id, i]));

  // Header thickness. u = flow axis, v = lane axis.
  const laneWords = Math.max(...body.lanes.flatMap((l) => l.label.split(/\s+/).map((w) => textWidth(ctx, w, st.group))));
  const laneHeadU = horizontal ? clamp(snapUp(laneWords + 32), 112, 168) : 0;
  const phaseWords = phases.length ? Math.max(...phases.flatMap((p) => p.split(/\s+/).map((w) => textWidth(ctx, w, st.bodyStrong)))) : 0;
  const phaseHeadV = phases.length ? (horizontal ? 32 : clamp(snapUp(phaseWords + 24), 96, 144)) : 0;

  // Columns: one step per column (ELK) when it fits, else the compact layering.
  let layering = await assignColumns(body, phaseOf);
  const minNodeW = 104;
  if (ctx.auto && horizontal) {
    const calloutCol = ctx.spec.callout?.anchor ? 240 + 24 : 0;
    const needFor = (cols: number) => 2 * ctx.margin + calloutCol + laneHeadU + cols * (minNodeW + CHANNEL);
    // A growing canvas still has to read on a slide: past ~1.6x the default
    // width, stack handoffs vertically instead of widening further.
    if (needFor(layering.cols) > ctx.W * 1.6) {
      const compact = compactColumns(body, phaseOf);
      if (compact.cols < layering.cols) layering = compact;
    }
    if (needFor(layering.cols) > ctx.W) ctx.W = snapUp(needFor(layering.cols));
  }
  const frame = beginFrame(ctx, { calloutSide: 'right' });
  const C = frame.content;
  if (!ctx.auto) {
    const fits = (cols: number) => {
      if (horizontal) return (C.w - laneHeadU) / cols >= minNodeW + 40;
      const lw = (C.w - phaseHeadV) / body.lanes.length;
      const nw = snap16(Math.min(208, lw - 32));
      const nh = snap16Up(Math.max(48, ...body.steps.map((s) => nodeHeight(ctx, { label: s.label, description: s.description, metric: s.metric, status: s.status }, SHAPE[s.shape ?? 'task'], nw))));
      return (C.h - 56) / cols >= nh + CHANNEL;
    };
    if (!fits(layering.cols)) {
      const compact = compactColumns(body, phaseOf);
      if (compact.cols < layering.cols) layering = compact;
    }
  }
  const { col, phaseSpan, cols } = layering;

  // Sub-rows: steps sharing a lane and a column stack inside the lane.
  const sub = new Map<string, number>();
  const subCount = body.lanes.map(() => 1);
  const cell = new Map<string, number>();
  for (const s of body.steps) {
    const key = `${s.lane}|${col.get(s.id)}`;
    const k = cell.get(key) ?? 0;
    sub.set(s.id, k);
    cell.set(key, k + 1);
    const li = laneIndex.get(s.lane) ?? 0;
    subCount[li] = Math.max(subCount[li], k + 1);
  }

  // Node size.
  let NW: number;
  let colPitch = 0;
  let laneW = 0;
  if (horizontal) {
    colPitch = (C.w - laneHeadU) / cols;
    NW = snapDown(Math.min(208, colPitch - 40));
    if (NW < 96) {
      fitIssue(ctx, 'ds-content', `the swimlane needs ${cols} columns but only ${Math.floor(C.w - laneHeadU)} units of width are free. Merge steps, split the process, or set "canvas": { "aspect": "auto" }.`);
      NW = 96;
    }
  } else {
    laneW = snapDown((C.w - phaseHeadV) / body.lanes.length);
    const maxSub = Math.max(...subCount);
    NW = snapDown(Math.min(208, (laneW - 32 - (maxSub - 1) * 16) / maxSub));
    if (NW < 96) {
      fitIssue(ctx, 'ds-content', `the lanes are too narrow for their steps. Use fewer lanes or "orientation": "horizontal".`);
      NW = 96;
    }
  }
  const content = (s: SwimlaneStep) => ({
    label: s.label,
    description: s.description,
    metric: s.metric,
    owner: s.owner,
    status: s.status,
    tags: s.tags,
    icon: s.icon,
  });
  // Decision questions use the smaller strong style so they fit inside the diamond.
  const opts = (s: SwimlaneStep) => (s.shape === 'decision' ? { labelStyle: st.bodyStrong } : undefined);
  // Steps share one height (diamonds grow 8 on one side if needed to stay on the lattice).
  const NH = snapUp(Math.max(48, ...body.steps.map((s) => nodeHeight(ctx, content(s), SHAPE[s.shape ?? 'task'], NW, opts(s)))));

  // Lane header thickness for vertical lanes depends on the lane width.
  const laneHeadV = horizontal
    ? 0
    : snapUp(Math.max(...body.lanes.map((l) => wrap(ctx, l.label, laneW - 16, st.group).length)) * lh(ctx, st.group.size) + 16);
  const headU = horizontal ? laneHeadU : laneHeadV; // along flow axis
  const headV = phaseHeadV; // along lane axis

  // Lane extents along v.
  const availU = horizontal ? C.w - headU : C.h - headU;
  const availV = horizontal ? C.h - headV : C.w - headV;
  // Row padding inside lanes tightens (24 → 16 → 12) before a lane count stops fitting.
  const spansFor = (pad: number, gap: number) => body.lanes.map((_, i) => subCount[i] * NH + (subCount[i] - 1) * gap + 2 * pad);
  let laneSpan = horizontal ? spansFor(ROW_PAD, SUB_GAP) : body.lanes.map(() => laneW);
  if (horizontal && !ctx.auto) {
    for (const [pad, gap] of [[16, 16], [12, 16]] as const) {
      if (laneSpan.reduce((a, b) => a + b, 0) <= availV) break;
      laneSpan = spansFor(pad, gap);
    }
  }
  if (horizontal) {
    let extra = availV - laneSpan.reduce((a, b) => a + b, 0);
    if (ctx.auto) extra = 0;
    if (extra < 0) {
      const multi = subCount.some((n) => n > 1);
      fitIssue(
        ctx,
        'ds-content',
        `the ${body.lanes.length} lanes need ${Math.ceil(laneSpan.reduce((a, b) => a + b, 0) + headV)} units of height but ${Math.floor(C.h)} are free. ` +
          `Use "orientation": "vertical" (lanes as columns), merge lanes${multi ? ' or parallel steps' : ''}, drop the subtitle, or set "canvas": { "aspect": "auto" }.`,
      );
    } else {
      const per = Math.min(96, snapDown(extra / body.lanes.length));
      for (let i = 0; i < laneSpan.length; i++) laneSpan[i] += per;
    }
  } else {
    colPitch = availU / cols;
    if (ctx.auto || colPitch < NH + CHANNEL) {
      if (!ctx.auto)
        fitIssue(ctx, 'ds-content', `the vertical swimlane needs ${cols} rows of steps but the canvas is too short. Use "orientation": "horizontal", drop the subtitle or callout, merge sequential steps in the same lane, or set "canvas": { "aspect": "auto" }.`);
      colPitch = Math.max(colPitch, NH + CHANNEL);
      if (ctx.auto) colPitch = NH + CHANNEL + 16;
    }
    colPitch = Math.min(colPitch, NH + CHANNEL + 96);
  }
  if (horizontal) colPitch = Math.min(colPitch, NW + CHANNEL + 160);

  // Map (u, v) → x/y.
  const u0 = (horizontal ? C.x : C.y) + headU;
  const v0 = (horizontal ? C.y : C.x) + headV;
  const box = (u: number, v: number, du: number, dv: number): Box =>
    horizontal ? { x: u, y: v, w: du, h: dv } : { x: v, y: u, w: dv, h: du };
  const totalU = cols * colPitch;
  const laneStart: number[] = [];
  let acc = v0;
  for (const s of laneSpan) {
    laneStart.push(acc);
    acc += s;
  }
  const vEnd = acc;
  const uEnd = snapDown(u0 + totalU);

  // Phase headers and separators.
  phaseSpan.forEach(([a, b], p) => {
    if (!phases.length) return;
    const pu0 = snap(u0 + a * colPitch);
    const pu1 = p === phaseSpan.length - 1 ? uEnd : snap(u0 + (b + 1) * colPitch);
    const cellBox = horizontal
      ? { x: pu0, y: C.y, w: pu1 - pu0, h: headV - 4 }
      : { x: C.x, y: pu0, w: headV - 4, h: pu1 - pu0 };
    addShape(ctx, {
      id: `phase-${p + 1}`,
      role: 'phase',
      shape: 'rect',
      ...cellBox,
      radius: Math.min(4, theme.shape.radius),
      paint: { fill: 'surfaceAlt', stroke: 'none', strokeWidth: 0 },
      inset: { l: 8, r: 8, t: 0, b: 0 },
      meta: { kind: 'phase', label: phases[p] },
    });
    const lines = horizontal ? [phases[p]] : wrap(ctx, phases[p], headV - 20, st.bodyStrong);
    const lineH = horizontal ? headV - 4 : lh(ctx, st.bodyStrong.size);
    const tx = cellBox.x + cellBox.w / 2;
    const ty = horizontal ? cellBox.y : cellBox.y + (cellBox.h - lines.length * lineH) / 2;
    addText(ctx, { id: `phase-${p + 1}--label`, role: 'header', x: tx, y: ty, w: cellBox.w - 16, lines, ...st.bodyStrong, lineHeight: lineH, anchor: 'middle', color: 'text(ink,surfaceAlt)', box: `phase-${p + 1}`, slot: 'heading' });
  });

  // Lanes.
  body.lanes.forEach((lane, i) => {
    const look = bandLook(theme, lane.emphasis ?? 'normal');
    const lb = horizontal
      ? { x: C.x, y: laneStart[i], w: uEnd - C.x, h: laneSpan[i] }
      : { x: laneStart[i], y: C.y, w: laneSpan[i], h: uEnd - C.y };
    addShape(ctx, {
      id: `lane-${lane.id}`,
      role: 'lane',
      shape: 'rect',
      ...lb,
      paint: { fill: 'background', stroke: 'line', strokeWidth: theme.shape.stroke },
      container: true,
      meta: { specId: lane.id, kind: 'lane', label: lane.label, emphasis: lane.emphasis ?? 'normal' },
    });
    ctx.anchors.set(lane.id, lb);
    const hb = horizontal ? { x: lb.x, y: lb.y, w: headU, h: lb.h } : { x: lb.x, y: lb.y, w: lb.w, h: headU };
    const fill = lane.emphasis && lane.emphasis !== 'normal' ? look.fill : 'surface';
    addShape(ctx, {
      id: `lane-${lane.id}--header`,
      role: 'header',
      shape: 'rect',
      ...hb,
      paint: { fill, stroke: lane.emphasis === 'accent' || lane.emphasis === 'highlight' ? look.paint.stroke : 'line', strokeWidth: theme.shape.stroke },
      inset: { l: 12, r: 12, t: 8, b: 8 },
      parent: `lane-${lane.id}`,
    });
    const textW = hb.w - 24;
    const lines = wrap(ctx, lane.label, textW, st.group);
    const desc = lane.description ? wrap(ctx, lane.description, textW, st.caption) : [];
    const blockH = lines.length * lh(ctx, st.group.size) + (desc.length ? 4 + desc.length * lh(ctx, st.caption.size) : 0);
    const ty = hb.y + (hb.h - blockH) / 2;
    addText(ctx, { id: `lane-${lane.id}--label`, role: 'header', x: hb.x + hb.w / 2, y: ty, w: textW, lines, ...st.group, anchor: 'middle', color: `text(${lane.emphasis === 'accent' ? 'accent' : 'ink'},${fill})`, box: `lane-${lane.id}--header`, slot: 'heading' });
    if (desc.length) {
      addText(ctx, { id: `lane-${lane.id}--description`, role: 'header', x: hb.x + hb.w / 2, y: ty + lines.length * lh(ctx, st.group.size) + 4, w: textW, lines: desc, ...st.caption, anchor: 'middle', color: `text(inkMuted,${fill})`, box: `lane-${lane.id}--header`, slot: 'description' });
    }
  });

  // Phase separators inside the lane area.
  if (phases.length > 1) {
    phaseSpan.slice(1).forEach(([a], p) => {
      const u = snap(u0 + a * colPitch);
      const pts: Point[] = horizontal ? [{ x: u, y: v0 }, { x: u, y: vEnd }] : [{ x: v0, y: u }, { x: vEnd, y: u }];
      ctx.els.push({ kind: 'line', id: `phase-sep-${p + 1}`, role: 'decoration', points: pts, paint: { fill: 'none', stroke: 'line', strokeWidth: 1, dash: 'dashed' } });
    });
  }

  // Steps.
  const stepBox = new Map<string, Box>();
  for (const s of body.steps) {
    const li = laneIndex.get(s.lane) ?? 0;
    const c = col.get(s.id) ?? 0;
    const k = sub.get(s.id) ?? 0;
    const n = subCount[li];
    const nodeU = horizontal ? NW : NH;
    const nodeV = horizontal ? NH : NW;
    const gapV = horizontal ? SUB_GAP : 16;
    const blockV = n * nodeV + (n - 1) * gapV;
    const u = snap(u0 + c * colPitch + (colPitch - nodeU) / 2);
    const v = snap(laneStart[li] + (laneSpan[li] - blockV) / 2 + k * (nodeV + gapV));
    let b = box(u, v, nodeU, nodeV);
    // Keep diamond vertices on the 8-unit routing lattice: grow one side into the channel.
    if (s.shape === 'decision') {
      const dw = b.w % 16 ? 8 : 0;
      const dh = b.h % 16 ? 8 : 0;
      b = { x: b.x, y: b.y, w: b.w + dw, h: b.h + dh };
    }
    stepBox.set(s.id, b);
    const shape = SHAPE[s.shape ?? 'task'];
    const look = nodeLook(theme, s.emphasis ?? 'normal', s.status);
    if (s.shape === 'end') look.paint = { ...look.paint, strokeWidth: theme.shape.strokeStrong + 0.5, stroke: s.emphasis && s.emphasis !== 'normal' ? look.paint.stroke : 'lineStrong' };
    drawNode(ctx, {
      id: s.id,
      specId: s.id,
      shape,
      ...b,
      look,
      content: content(s),
      emphasis: s.emphasis,
      alignGroup: horizontal ? { group: `col-${c}`, axis: 'column' } : { group: `row-${c}`, axis: 'row' },
      parent: `lane-${s.lane}`,
      kind: s.shape ?? 'task',
      options: opts(s),
    });
  }

  // Connectors.
  const nodes: RouteNode[] = body.steps.map((s) => ({ id: s.id, box: stepBox.get(s.id)!, shape: SHAPE[s.shape ?? 'task'] }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const bounds = horizontal
    ? { x: u0 - 8, y: v0, w: uEnd - u0 + 8, h: vEnd - v0 }
    : { x: v0, y: u0 - 8, w: vEnd - v0, h: uEnd - u0 + 8 };
  const softLines = ctx.els.filter((e) => e.kind === 'line' && e.id.startsWith('phase-sep-')).map((e) => (e as { points: Point[] }).points);
  // Lane borders too: a connector running along a border reads as part of the frame.
  for (const v of laneStart.slice(1)) softLines.push(horizontal ? [{ x: u0, y: v }, { x: uEnd, y: v }] : [{ x: v, y: u0 }, { x: v, y: uEnd }]);
  const fwd: Side = horizontal ? 'right' : 'bottom';
  const back: Side = horizontal ? 'left' : 'top';
  const below: Side = horizontal ? 'bottom' : 'right';
  const above: Side = horizontal ? 'top' : 'left';
  const rank = (s: SwimlaneStep) => {
    const li = laneIndex.get(s.lane) ?? 0;
    return laneStart[li] + (sub.get(s.id) ?? 0);
  };
  // Stable ids for edges (a repeated pair gets a numeric suffix).
  const edgeIds = new Map<string, number>();
  const edges = body.edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => byId.has(e.from) && byId.has(e.to))
    .map(({ e, i }) => {
      const n = (edgeIds.get(`${e.from}-${e.to}`) ?? 0) + 1;
      edgeIds.set(`${e.from}-${e.to}`, n);
      return { e, i, id: `edge-${e.from}-${e.to}${n > 1 ? `-${n}` : ''}` };
    });
  const sidesFor = (e: SwimlaneBody['edges'][number]) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const dc = (col.get(b.id) ?? 0) - (col.get(a.id) ?? 0);
    const dv = rank(b) - rank(a);
    const toward: Side = dv > 0 ? below : above;
    const away: Side = dv > 0 ? above : below;
    if (e.kind === 'feedback' || dc < 0) return { fromSides: { [below]: 0, [above]: 40, [fwd]: 80 }, toSides: { [below]: 0, [above]: 40, [back]: 80 } };
    if (dc === 0) return { fromSides: { [toward]: 0, [fwd]: 60, [away]: 200 }, toSides: { [dv > 0 ? above : below]: 0, [back]: 60 } };
    return {
      fromSides: { [fwd]: 0, ...(dv !== 0 ? { [toward]: 24 } : { [above]: 120, [below]: 120 }) },
      toSides: { [back]: 0, ...(dv !== 0 ? { [dv > 0 ? above : below]: 40 } : {}) },
    };
  };
  const span = (x: (typeof edges)[number]) => {
    const a = nodeById.get(x.e.from)!.box;
    const b = nodeById.get(x.e.to)!.box;
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  };
  const isFeedback = (x: (typeof edges)[number]) => x.e.kind === 'feedback';
  const main = edges.filter((x) => !isFeedback(x));
  const loops = edges.filter(isFeedback);
  // The route depends on the order edges claim ports and tracks, so try a few
  // deterministic orders and keep the one with the fewest crossings.
  const orders = [
    [...main, ...loops],
    [...[...main].sort((a, b) => span(a) - span(b) || a.i - b.i), ...loops],
    [...[...main].reverse(), ...loops],
    [...[...main].sort((a, b) => span(b) - span(a) || a.i - b.i), ...loops],
  ];
  type Routed = { x: (typeof edges)[number]; r: ReturnType<Router['route']> };
  const routeAll = (order: typeof edges): Routed[] => {
    const router = new Router({ bounds, obstacles: nodes, endStub: 16, softLines });
    return order.map((x) => ({ x, r: router.route({ id: x.id, from: nodeById.get(x.e.from)!, to: nodeById.get(x.e.to)!, ...sidesFor(x.e) }) }));
  };
  const score = (rs: Routed[]) => {
    let crossings = 0;
    let length = 0;
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i].r.points;
      for (let k = 1; k < p.length; k++) length += Math.abs(p[k].x - p[k - 1].x) + Math.abs(p[k].y - p[k - 1].y) + 16;
      for (let j = i + 1; j < rs.length; j++) {
        const q = rs[j].r.points;
        for (let a = 1; a < p.length; a++) for (let b = 1; b < q.length; b++) if (segmentsCross(p[a - 1], p[a], q[b - 1], q[b])) crossings++;
      }
    }
    const failed = rs.filter((x) => !x.r.ok).length;
    return failed * 1e7 + crossings * 1e4 + length;
  };
  let best: Routed[] | undefined;
  let bestScore = Infinity;
  for (const order of orders) {
    const rs = routeAll(order);
    const sc = score(rs);
    if (sc < bestScore) {
      best = rs;
      bestScore = sc;
    }
    if (sc < 1e4) break; // no crossings: good enough
  }
  const routed: { id: string; points: Point[]; label?: string }[] = [];
  // Emit in spec order so ids and z-order do not depend on the routing order.
  for (const { x, r } of [...best!].sort((a, b) => a.x.i - b.x.i)) {
    const e = x.e;
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    if (!r.ok) fitIssue(ctx, x.id, `no clear route from "${e.from}" to "${e.to}". Move one of the steps to a different phase or lane.`);
    const kind = e.kind ?? (a.lane !== b.lane ? 'handoff' : 'flow');
    ctx.els.push({
      kind: 'connector',
      id: x.id,
      role: 'edge',
      points: r.points,
      paint: connectorPaint(theme, kind, e.style ?? 'solid'),
      arrowEnd: true,
      from: e.from,
      to: e.to,
      fromSide: r.fromSide,
      toSide: r.toSide,
      edgeKind: kind,
      labelId: e.label ? `${x.id}--label` : undefined,
    });
    routed.push({ id: x.id, points: r.points, label: e.label });
  }

  // Edge labels beside their lines.
  const lst = st.bodyStrong;
  const widthOf = (t: TextEl) => ctx.fonts.blockWidth(t.lines, t.size, t.weight);
  for (const r of routed) {
    if (!r.label) continue;
    const obstacles = collectObstacles(ctx.els, widthOf, bounds);
    const w = Math.ceil(textWidth(ctx, r.label, lst));
    const h = lh(ctx, lst.size);
    const spot = placeAlongRoute(r.points, w, h, obstacles);
    const at = spot ?? { x: r.points[0].x + 4, y: r.points[0].y - h - 4, w, h };
    if (!spot) fitIssue(ctx, `${r.id}--label`, `no free space for the label "${r.label}" on ${r.id}. Shorten the label or give the steps more room.`);
    addText(ctx, { id: `${r.id}--label`, role: 'edge-label', x: at.x, y: at.y, w, lines: [r.label], ...lst, anchor: 'start', color: 'inkMuted', free: true, slot: 'text' });
  }

  endFrame(ctx, frame, horizontal ? vEnd : uEnd);
}
