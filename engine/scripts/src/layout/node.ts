/**
 * Node boxes: measure the text a node needs at a given width, then draw the
 * shape, its text stack, status badge, tag markers and optional icon.
 */
import { shapeTextInsets } from '../scene/geometry.js';
import type { Insets, ShapeEl, ShapeKind } from '../scene/types.js';
import type { Emphasis, Status } from '../spec.js';
import { type Look, STATUS_LABEL, badgeLook, tagToken } from '../theme/paint.js';
import { snapUp } from '../util.js';
import { type LayoutContext, type TextStyle, addShape, addText, lh, styles, textOn, textWidth, wrap } from './context.js';

export interface NodeContent {
  label: string;
  description?: string;
  metric?: string;
  owner?: string;
  status?: Status;
  tags?: string[];
  icon?: string;
  /** Extra short lines (e.g. value-chain activities), rendered as body text. */
  items?: string[];
}

export interface NodeOptions {
  align?: 'middle' | 'start';
  labelStyle?: TextStyle;
  /** Max description lines (defaults to the altitude rule). */
  descriptionLines?: number;
  /** Padding override. */
  pad?: number;
}

interface Block {
  slot: 'label' | 'description' | 'metric' | 'owner' | 'item';
  lines: string[];
  st: TextStyle;
  gap: number;
  tone: 'ink' | 'muted' | 'accent';
}

const BADGE_H = 16;
const TAG = 8;

export function nodePad(ctx: LayoutContext, o?: NodeOptions): number {
  return o?.pad ?? Math.round(ctx.theme.space.padding * 0.75);
}

function showsBadge(shape: ShapeKind, status?: Status): boolean {
  return !!status && status !== 'current' && !['diamond', 'ellipse'].includes(shape);
}

function statusLine(shape: ShapeKind, status?: Status): boolean {
  return !!status && status !== 'current' && ['diamond', 'ellipse'].includes(shape);
}

function showsIcon(ctx: LayoutContext, c: NodeContent): boolean {
  return !!c.icon && ctx.theme.style.showIcons;
}

/** Extra insets for badges (top) and tag markers (bottom). */
function decorInsets(ctx: LayoutContext, shape: ShapeKind, c: NodeContent): { t: number; b: number } {
  const t = showsBadge(shape, c.status) ? BADGE_H + 6 : 0;
  const b = c.tags?.length && !['diamond', 'ellipse'].includes(shape) ? TAG + 6 : 0;
  return { t, b };
}

function blocks(ctx: LayoutContext, c: NodeContent, width: number, shape: ShapeKind, o?: NodeOptions): Block[] {
  const st = styles(ctx.theme);
  const out: Block[] = [];
  const labelSt = o?.labelStyle ?? st.label;
  out.push({ slot: 'label', lines: wrap(ctx, c.label, width, labelSt), st: labelSt, gap: 0, tone: 'ink' });
  if (c.description) {
    const lines = wrap(ctx, c.description, width, st.body);
    out.push({ slot: 'description', lines, st: st.body, gap: 4, tone: 'muted' });
  }
  for (const item of c.items ?? []) {
    out.push({ slot: 'item', lines: wrap(ctx, item, width, st.body), st: st.body, gap: out.length === 1 ? 6 : 2, tone: 'ink' });
  }
  if (c.metric) out.push({ slot: 'metric', lines: wrap(ctx, c.metric, width, st.bodyStrong), st: st.bodyStrong, gap: 4, tone: 'accent' });
  if (c.owner) out.push({ slot: 'owner', lines: wrap(ctx, c.owner, width, st.caption), st: st.caption, gap: 4, tone: 'muted' });
  if (statusLine(shape, c.status)) {
    out.push({ slot: 'owner', lines: [STATUS_LABEL[c.status!]], st: st.captionStrong, gap: 2, tone: 'muted' });
  }
  return out;
}

function blocksHeight(ctx: LayoutContext, bs: Block[]): number {
  return bs.reduce((h, b) => h + b.gap + b.lines.length * lh(ctx, b.st.size), 0);
}

function iconBlock(ctx: LayoutContext, c: NodeContent): number {
  return showsIcon(ctx, c) ? 20 + 6 : 0;
}

/** Horizontal insets for a shape of width w (height-independent part). */
function hInsets(shape: ShapeKind, w: number, depth: number, pad: number): { l: number; r: number } {
  const i = shapeTextInsets(shape, w, 100, depth, pad);
  return { l: i.l, r: i.r };
}

/** Smallest height (snapped to the grid) that fits the content at width w. */
export function nodeHeight(ctx: LayoutContext, c: NodeContent, shape: ShapeKind, w: number, o?: NodeOptions, minH = 48): number {
  const pad = nodePad(ctx, o);
  const depth = ctx.theme.shape.chevronDepth;
  const { l, r } = hInsets(shape, w, depth, pad);
  const textW = w - l - r;
  const bs = blocks(ctx, c, textW, shape, o);
  const textH = blocksHeight(ctx, bs) + iconBlock(ctx, c);
  const deco = decorInsets(ctx, shape, c);
  let h: number;
  if (shape === 'diamond') h = textH / (1 - 0.62);
  else if (shape === 'ellipse') h = textH / (1 - 0.32);
  else {
    const i = shapeTextInsets(shape, w, 64, depth, pad);
    h = textH + i.t + i.b + deco.t + deco.b;
  }
  return Math.max(minH, snapUp(h));
}

/** Widest single word in the label: the minimum useful text width. */
export function minLabelWidth(ctx: LayoutContext, label: string, o?: NodeOptions): number {
  const st = o?.labelStyle ?? styles(ctx.theme).label;
  return Math.max(...label.split(/\s+/).map((w) => textWidth(ctx, w, st)));
}

export interface DrawNodeArgs {
  id: string;
  specId?: string;
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  look: Look;
  content: NodeContent;
  emphasis?: Emphasis;
  role?: ShapeEl['role'];
  alignGroup?: { group: string; axis: 'row' | 'column' };
  parent?: string;
  obstacle?: boolean;
  options?: NodeOptions;
  radius?: number;
  hitbox?: ShapeEl['hitbox'];
  kind?: string;
  /** Point depth override for chevrons and pentagons. */
  depth?: number;
}

export function drawNode(ctx: LayoutContext, a: DrawNodeArgs): ShapeEl {
  const { theme } = ctx;
  const pad = nodePad(ctx, a.options);
  const depth = a.depth ?? theme.shape.chevronDepth;
  const base = shapeTextInsets(a.shape, a.w, a.h, depth, pad);
  const deco = decorInsets(ctx, a.shape, a.content);
  const inset: Insets = { l: base.l, r: base.r, t: base.t + deco.t, b: base.b + deco.b };
  const group = `g-${a.id}`;
  const shape = addShape(ctx, {
    id: a.id,
    role: a.role ?? 'node',
    shape: a.shape,
    x: a.x,
    y: a.y,
    w: a.w,
    h: a.h,
    radius: ['rect', 'document', 'predefined'].includes(a.shape) ? theme.shape.radius : undefined,
    depth: ['chevron', 'pentagon'].includes(a.shape) ? depth : undefined,
    paint: a.look.paint,
    obstacle: a.obstacle ?? true,
    inset,
    hitbox: a.hitbox,
    align: a.alignGroup,
    group,
    parent: a.parent,
    meta: {
      specId: a.specId,
      kind: a.kind,
      label: a.content.label,
      description: a.content.description,
      emphasis: a.emphasis ?? 'normal',
      status: a.content.status,
      tags: a.content.tags,
    },
  });
  if (a.specId) ctx.anchors.set(a.specId, { x: a.x, y: a.y, w: a.w, h: a.h });

  const innerX = a.x + inset.l;
  const innerW = a.w - inset.l - inset.r;
  const innerY = a.y + inset.t;
  const innerH = a.h - inset.t - inset.b;
  const bs = blocks(ctx, a.content, innerW, a.shape, a.options);
  const iconH = iconBlock(ctx, a.content);
  const totalH = blocksHeight(ctx, bs) + iconH;
  const align = a.options?.align ?? 'middle';
  const ax = align === 'middle' ? innerX + innerW / 2 : innerX;
  let y = innerY + Math.max(0, (innerH - totalH) / 2);

  if (iconH) {
    ctx.els.push({
      kind: 'icon',
      id: `${a.id}--icon`,
      role: 'icon',
      name: a.content.icon!,
      x: align === 'middle' ? ax - 10 : innerX,
      y,
      size: 20,
      color: textOn('accent', a.look.fill),
      group,
    });
    y += iconH;
  }
  for (const b of bs) {
    y += b.gap;
    const color = b.tone === 'ink' ? a.look.ink : b.tone === 'muted' ? a.look.inkMuted : textOn('accent', a.look.fill);
    const slotCount = bs.filter((x) => x.slot === b.slot).length;
    const idx = bs.filter((x) => x.slot === b.slot).indexOf(b);
    addText(ctx, {
      id: `${a.id}--${b.slot}${slotCount > 1 ? `-${idx + 1}` : ''}`,
      role: 'label',
      x: ax,
      y,
      w: innerW,
      lines: b.lines,
      size: b.st.size,
      weight: b.st.weight,
      anchor: align,
      color,
      box: a.id,
      group,
      slot: b.slot === 'item' ? 'item' : b.slot,
    });
    y += b.lines.length * lh(ctx, b.st.size);
  }

  if (showsBadge(a.shape, a.content.status)) drawBadge(ctx, a, group);
  if (a.content.tags?.length && !['diamond', 'ellipse'].includes(a.shape)) {
    const left = a.shape === 'chevron' ? a.x + depth + 6 : a.x + 8;
    a.content.tags.forEach((t, i) => {
      addShape(ctx, {
        id: `${a.id}--tag-${t}`,
        role: 'marker',
        shape: 'rect',
        x: left + i * (TAG + 4),
        y: a.y + a.h - 6 - TAG,
        w: TAG,
        h: TAG,
        radius: 2,
        paint: { fill: tagToken(ctx.tagIndex.get(t) ?? 0), stroke: 'none', strokeWidth: 0 },
        box: false,
        group,
      });
    });
  }
  return shape;
}

function drawBadge(ctx: LayoutContext, a: DrawNodeArgs, group: string) {
  const st = styles(ctx.theme).captionStrong;
  const text = STATUS_LABEL[a.content.status!];
  const tw = textWidth(ctx, text, st);
  const bw = Math.ceil(tw + 14);
  const right = a.shape === 'chevron' || a.shape === 'pentagon' ? a.x + a.w - ctx.theme.shape.chevronDepth - 4 : a.x + a.w - 6;
  const bx = right - bw;
  const by = a.y + 6;
  const look = badgeLook(ctx.theme, a.content.status!, a.look.fill.startsWith('text(') ? 'background' : a.look.fill);
  addShape(ctx, {
    id: `${a.id}--badge`,
    role: 'badge',
    shape: 'pill',
    x: bx,
    y: by,
    w: bw,
    h: BADGE_H,
    paint: { ...look.paint, strokeWidth: 1 },
    inset: { l: 6, r: 6, t: 0, b: 0 },
    group,
  });
  const lineH = BADGE_H;
  addText(ctx, {
    id: `${a.id}--badge-text`,
    role: 'label',
    x: bx + bw / 2,
    y: by,
    w: bw - 12,
    lines: [text],
    size: st.size,
    weight: st.weight,
    lineHeight: lineH,
    anchor: 'middle',
    color: look.ink,
    box: `${a.id}--badge`,
    group,
    slot: 'badge',
  });
}
