/**
 * Stacked horizontal bands with a header column and an equal-width grid of
 * boxes. Operating models and layered architectures are both built from it.
 */
import type { Box, ShapeKind } from '../scene/types.js';
import type { Emphasis, SpecNode, Status } from '../spec.js';
import { STATUS_LABEL, badgeLook, bandLook, nodeLook } from '../theme/paint.js';
import { clamp, snap, snapDown, snapUp } from '../util.js';
import { type LayoutContext, addShape, addText, lh, styles, textWidth, wrap } from './context.js';
import { type NodeContent, drawNode, minLabelWidth, nodeHeight, nodePad } from './node.js';

export interface BandItem {
  id: string;
  specId?: string;
  content: NodeContent;
  emphasis?: Emphasis;
}

export interface Band {
  id: string;
  specId?: string;
  label: string;
  description?: string;
  emphasis?: Emphasis;
  status?: Status;
  items: BandItem[];
  /** Box style for this band's items. */
  itemKind: 'node' | 'pill' | 'tile';
  /** Counted nodes share one height across bands of the same kind. */
}

export interface BandLayout {
  bottom: number;
  boxes: Map<string, Box>;
}

const BAND_GAP = 16;
const MIN_NODE_W = 112;

export function headerWidth(ctx: LayoutContext, area: Box, bands: Band[]): number {
  const st = styles(ctx.theme).group;
  const widest = Math.max(...bands.flatMap((b) => b.label.split(/\s+/).map((w) => textWidth(ctx, w, st))));
  return clamp(snapUp(Math.max(widest + 32, area.w * 0.15)), 128, 200);
}

function itemLook(ctx: LayoutContext, it: BandItem, band: Band) {
  if (band.itemKind === 'tile') {
    const l = nodeLook(ctx.theme, it.emphasis ?? 'normal', it.content.status, 'band');
    // Tiles use the tint the band does not, so they never vanish into it.
    const tile = ctx.theme.style.bandFill === 'surfaceAlt' ? 'surface' : 'surfaceAlt';
    return it.emphasis && it.emphasis !== 'normal' ? l : { ...l, paint: { ...l.paint, fill: tile, stroke: 'none' }, fill: tile, ink: `text(ink,${tile})`, inkMuted: `text(inkMuted,${tile})` };
  }
  const look = nodeLook(ctx.theme, it.emphasis ?? 'normal', it.content.status, 'band');
  // Nodes in an emphasised band carry its colour on their border, so the
  // whole group reads as the subject rather than just its background.
  const bandColour = band.emphasis === 'accent' ? 'accent' : band.emphasis === 'highlight' ? 'highlight' : undefined;
  if (bandColour && (it.emphasis ?? 'normal') === 'normal' && (!it.content.status || it.content.status === 'current' || it.content.status === 'new' || it.content.status === 'changed')) {
    return { ...look, paint: { ...look.paint, stroke: bandColour, strokeWidth: ctx.theme.shape.strokeStrong - 0.5 } };
  }
  return look;
}

function itemShape(band: Band): ShapeKind {
  return band.itemKind === 'pill' ? 'pill' : 'rect';
}

interface Grid {
  cols: number;
  rows: number;
  w: number;
}

function grid(ctx: LayoutContext, band: Band, areaW: number): Grid {
  const n = band.items.length;
  const pad = nodePad(ctx);
  const minW = Math.max(MIN_NODE_W, ...band.items.map((it) => minLabelWidth(ctx, it.content.label) + 2 * pad + 2));
  const perRow = Math.max(1, Math.floor((areaW + BAND_GAP) / (minW + BAND_GAP)));
  const rows = Math.ceil(n / perRow);
  const cols = Math.ceil(n / rows);
  const w = snapDown((areaW - BAND_GAP * (cols - 1)) / cols);
  return { cols, rows, w };
}

function itemHeight(ctx: LayoutContext, band: Band, w: number): number {
  if (band.itemKind === 'pill') {
    const st = styles(ctx.theme).label;
    const fits = band.items.every((it) => wrap(ctx, it.content.label, w - 32, st).length === 1);
    return fits ? 32 : Math.max(...band.items.map((it) => nodeHeight(ctx, it.content, 'rect', w, undefined, 40)));
  }
  // Tiles reserve two lines so their height does not depend on how a font wraps.
  const min = 56;
  return Math.max(...band.items.map((it) => nodeHeight(ctx, it.content, itemShape(band), w, undefined, min)));
}

function headerHeight(ctx: LayoutContext, band: Band, hw: number): number {
  const st = styles(ctx.theme);
  const textW = hw - 24;
  let h = wrap(ctx, band.label, textW, st.group).length * lh(ctx, st.group.size);
  if (band.description) h += 4 + wrap(ctx, band.description, textW, st.caption).length * lh(ctx, st.caption.size);
  if (band.status && band.status !== 'current') h += 6 + 16;
  return h;
}

/**
 * Lay out bands top to bottom inside `area`. Extra height is shared out
 * (taller bands, then larger gaps) so the stack fills fixed canvases.
 */
export function layoutBands(ctx: LayoutContext, area: Box, bands: Band[], opts: { hw?: number; fill?: boolean } = {}): BandLayout {
  const { theme } = ctx;
  const hw = opts.hw ?? headerWidth(ctx, area, bands);
  const areaW = area.w - hw - 16;
  const grids = bands.map((b) => grid(ctx, b, areaW));
  // Node bands share one item height so rows line up across the model.
  const nodeH = Math.max(
    56,
    ...bands.map((b, i) => (b.itemKind === 'node' ? itemHeight(ctx, b, grids[i].w) : 0)),
  );
  const itemH = bands.map((b, i) => (b.itemKind === 'node' ? nodeH : itemHeight(ctx, b, grids[i].w)));
  const contentH = bands.map((b, i) => grids[i].rows * itemH[i] + (grids[i].rows - 1) * BAND_GAP);
  const heights = (pad: (b: Band) => number, headPad: number) =>
    bands.map((b, i) => snapUp(Math.max(contentH[i] + 2 * pad(b), headerHeight(ctx, b, hw) + headPad)));
  let bandH = heights((b) => (b.itemKind === 'node' ? 16 : 12), 16);
  let gap = BAND_GAP;
  const total = () => bandH.reduce((a, b) => a + b, 0) + gap * (bands.length - 1);
  // Tight canvas: band padding (not the sibling gap) gives way first.
  if (!ctx.auto && total() > area.h) bandH = heights(() => 8, 8);

  if (opts.fill !== false && !ctx.auto) {
    let extra = snapDown(area.h - total());
    // Grow node bands first (up to 32 each), then gaps (up to 24).
    const growable = bands.map((b, i) => (b.itemKind === 'node' ? i : -1)).filter((i) => i >= 0);
    if (extra > 0 && growable.length) {
      const per = Math.min(32, snapDown(extra / growable.length));
      for (const i of growable) bandH[i] += per;
      extra -= per * growable.length;
    }
    if (extra > 0 && bands.length > 1) {
      const add = Math.min(8, snapDown(extra / (bands.length - 1)));
      gap += add;
      extra -= add * (bands.length - 1);
    }
  }

  const boxes = new Map<string, Box>();
  let y = area.y;
  bands.forEach((band, bi) => {
    const look = bandLook(theme, band.emphasis ?? 'normal', band.status);
    const box: Box = { x: area.x, y, w: area.w, h: bandH[bi] };
    boxes.set(band.id, box);
    if (band.specId) ctx.anchors.set(band.specId, box);
    addShape(ctx, {
      id: band.id,
      role: 'band',
      shape: 'rect',
      ...box,
      radius: theme.shape.radius,
      paint: look.paint,
      container: true,
      inset: { l: 12, r: 8, t: 8, b: 8 },
      meta: { specId: band.specId, kind: 'band', label: band.label, emphasis: band.emphasis ?? 'normal', status: band.status },
    });
    // Header text, vertically centred in the header column.
    const st = styles(theme);
    const textW = hw - 24;
    const hh = headerHeight(ctx, band, hw);
    let ty = y + (box.h - hh) / 2;
    const lLines = wrap(ctx, band.label, textW, st.group);
    addText(ctx, { id: `${band.id}--label`, role: 'header', x: area.x + 16, y: ty, w: textW, lines: lLines, ...st.group, anchor: 'start', color: look.ink, box: band.id, slot: 'heading' });
    ty += lLines.length * lh(ctx, st.group.size);
    if (band.description) {
      ty += 4;
      const dLines = wrap(ctx, band.description, textW, st.caption);
      addText(ctx, { id: `${band.id}--description`, role: 'header', x: area.x + 16, y: ty, w: textW, lines: dLines, ...st.caption, anchor: 'start', color: look.inkMuted, box: band.id, slot: 'description' });
      ty += dLines.length * lh(ctx, st.caption.size);
    }
    if (band.status && band.status !== 'current') {
      ty += 6;
      const text = STATUS_LABEL[band.status];
      const bw = Math.ceil(textWidth(ctx, text, st.captionStrong) + 14);
      const bl = badgeLook(theme, band.status, look.fill);
      addShape(ctx, { id: `${band.id}--badge`, role: 'badge', shape: 'pill', x: area.x + 16, y: ty, w: bw, h: 16, paint: { ...bl.paint, strokeWidth: 1 }, inset: { l: 6, r: 6, t: 0, b: 0 } });
      addText(ctx, { id: `${band.id}--badge-text`, role: 'label', x: area.x + 16 + bw / 2, y: ty, w: bw - 12, lines: [text], ...st.captionStrong, lineHeight: 16, anchor: 'middle', color: bl.ink, box: `${band.id}--badge`, slot: 'badge' });
    }

    // Items grid, centred vertically in the band.
    const g = grids[bi];
    const ih = itemH[bi];
    const blockH = g.rows * ih + (g.rows - 1) * BAND_GAP;
    const top = snap(y + (box.h - blockH) / 2);
    const rowW = g.cols * g.w + (g.cols - 1) * BAND_GAP;
    const left = snap(area.x + hw + (areaW - rowW) / 2);
    band.items.forEach((it, k) => {
      const r = Math.floor(k / g.cols);
      const c = k % g.cols;
      const inRow = Math.min(g.cols, band.items.length - r * g.cols);
      // Centre a short last row.
      const rowLeft = inRow < g.cols ? snap(left + ((g.cols - inRow) * (g.w + BAND_GAP)) / 2) : left;
      drawNode(ctx, {
        id: it.id,
        specId: it.specId,
        shape: itemShape(band),
        x: rowLeft + c * (g.w + BAND_GAP),
        y: top + r * (ih + BAND_GAP),
        w: g.w,
        h: ih,
        look: itemLook(ctx, it, band),
        content: it.content,
        emphasis: it.emphasis,
        alignGroup: { group: `${band.id}-row-${r}`, axis: 'row' },
        parent: band.id,
        kind: band.itemKind,
      });
    });
    y += box.h + gap;
  });
  return { bottom: y - gap, boxes };
}

export function nodeItem(n: SpecNode): BandItem {
  return {
    id: n.id,
    specId: n.id,
    emphasis: n.emphasis,
    content: {
      label: n.label,
      description: n.description,
      metric: n.metric,
      owner: n.owner,
      status: n.status,
      tags: n.tags,
      icon: n.icon,
    },
  };
}
