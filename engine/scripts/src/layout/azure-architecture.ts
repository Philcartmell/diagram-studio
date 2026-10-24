/**
 * azure-architecture: Microsoft reference-architecture style. Services are the
 * official Azure icons with their names underneath; boundaries nest (Azure,
 * region, virtual network, subnet, zone, group); flows are orthogonal connectors
 * with numbered step badges; an optional workflow panel tells the story.
 *
 * Layout is a measured box tree. Each container arranges its children in a row,
 * a column or a grid; boundaries stretch to fill their row or column; then each
 * service slides within its slot to line up with what it connects to, so most
 * connectors run straight. The orthogonal router draws the flows last.
 */
import { type IconPack, homePackOf, isProductIcon, resolveService } from '../azure/icons.js';
import type { Box, Dash, Point, ShapeKind, Side, TextEl } from '../scene/types.js';
import {
  type AzureArchitectureBody,
  type AzureBoundaryKind,
  type AzureContainer,
  type AzureFlow,
  type AzureItem,
  type AzureLayout,
  type AzureNode,
  type Emphasis,
  isAzureContainer,
} from '../spec.js';
import { STATUS_LABEL, badgeLook, nodeLook } from '../theme/paint.js';
import type { Token } from '../theme/tokens.js';
import type { Theme } from '../theme/types.js';
import { snap, snapUp } from '../util.js';
import { boundaryLabel, stepKey } from '../validate/azure.js';
import { type LayoutContext, type TextStyle, addShape, addText, fitIssue, lh, styles, textWidth, wrap } from './context.js';
import { type LegendItem, beginFrame, endFrame } from './frame.js';
import { type Obstacles, collectObstacles, isFree, placeAlongRoute, textBox } from './labels.js';
import { drawNode, nodeHeight } from './node.js';
import { type RouteNode, Router } from './router.js';

// ---- Dimensions (units ≈ px at 96 dpi; a 1280-wide canvas is a 13.3-inch slide) --

const GRID = 8;
const ICON_SIZE: Record<string, number> = { executive: 64, management: 48, detailed: 48 };
const LABEL_WRAP: Record<string, number> = { executive: 136, management: 120, detailed: 112 };
const BADGE: Record<string, number> = { executive: 26, management: 24, detailed: 22 };
const ICON_GAP = 6;
const GAP_LEAF_X = 32;
const GAP_LEAF_Y = 32;
const GAP_BOX = 24;
const GAP_ROOT = 48;
const PAD = 16;
const HEAD_INSET = 10;
const HEAD_ICON = 20;
const SHIELD = 20;
const ROUTE_MARGIN = 24;
const BOX_MIN_W = 96;
const BOX_MAX_W = 176;
const PANEL_W = 288;
const PANEL_GAP = 32;
const SCALES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const snap16 = (v: number) => Math.ceil(v / 16 - 1e-9) * 16;

// ---- Boundary styling ------------------------------------------------------

interface BoundaryStyle {
  stroke: Token;
  fill: Token;
  dash?: Dash;
  width: number;
  /** Canonical icon id (Azure, or "databricks:<slug>") shown in the header. */
  icon?: string;
  strong: boolean;
  align: 'start' | 'middle';
  /** A filled bar behind the header (Databricks stage columns). */
  headFill?: Token;
  /** Square corners regardless of the theme radius. */
  square?: boolean;
}

/** The Databricks mark for a boundary: the Azure Databricks service icon in Azure diagrams, Databricks' own artwork otherwise. */
const dbxIcon = (home: IconPack, product: 'databricks' | 'workspace') => (home === 'azure' ? 'azure-databricks' : `databricks:${product}`);

function boundaryStyle(kind: AzureBoundaryKind, onFill: boolean, home: IconPack, theme: Theme): BoundaryStyle {
  switch (kind) {
    case 'azure':
      return { stroke: 'notation.network', fill: 'none', dash: 'dashed', width: 1.5, strong: true, align: 'start' };
    case 'on-premises':
      return { stroke: 'lineStrong', fill: 'none', dash: 'dashed', width: 1.5, strong: true, align: 'start' };
    case 'region':
      return { stroke: 'none', fill: 'surface', width: 0, strong: true, align: 'start' };
    case 'subscription':
      return { stroke: 'line', fill: 'none', width: 1, icon: 'subscriptions', strong: false, align: 'start' };
    case 'resource-group':
      return { stroke: 'line', fill: 'none', dash: 'dashed', width: 1, icon: 'resource-groups', strong: false, align: 'start' };
    case 'virtual-network':
      return { stroke: 'notation.network', fill: 'none', dash: 'dashed', width: 1.25, icon: 'virtual-networks', strong: true, align: 'start' };
    case 'subnet':
      return { stroke: 'line', fill: onFill ? 'background' : 'surface@45', width: 1, icon: 'subnet', strong: false, align: 'start' };
    case 'zone':
      return { stroke: 'notation.zone', fill: 'none', width: 1.5, strong: false, align: 'start' };
    case 'group':
      return { stroke: 'line', fill: 'none', dash: 'dashed', width: 1, strong: false, align: 'middle' };
    case 'service':
      return { stroke: 'line', fill: onFill ? 'background' : 'surface@60', width: 1, strong: true, align: 'start', square: true };
    case 'databricks-account':
      return { stroke: 'notation.account', fill: 'none', dash: 'dashed', width: 1.5, icon: dbxIcon(home, 'databricks'), strong: true, align: 'start' };
    case 'cloud-account':
      return { stroke: 'notation.cloud', fill: 'none', dash: 'dashed', width: 1.5, strong: true, align: 'start' };
    case 'plane':
      return { stroke: 'notation.plane', fill: 'background', width: 1, strong: true, align: 'start' };
    case 'workspace':
      return { stroke: 'notation.plane', fill: 'background', width: 1, icon: dbxIcon(home, 'workspace'), strong: true, align: 'start' };
    case 'unity-catalog':
      return { stroke: 'notation.governance', fill: onFill ? 'background' : 'notation.governance@5', width: 1.5, icon: 'databricks:unity-catalog', strong: true, align: 'start' };
    case 'platform':
      return { stroke: 'none', fill: 'notation.platform', width: 0, icon: dbxIcon(home, 'databricks'), strong: true, align: 'start' };
    case 'panel':
      return { stroke: 'none', fill: 'background', width: 0, strong: true, align: 'middle' };
    case 'stage':
      // Databricks draws a lane as a grey header bar over open space; Microsoft as a grey panel.
      return theme.color.notation?.stageHead
        ? { stroke: 'none', fill: 'none', width: 0, strong: true, align: 'middle', headFill: 'notation.stageHead' }
        : { stroke: 'none', fill: 'surface', width: 0, strong: true, align: 'middle' };
    case 'bronze':
    case 'silver':
    case 'gold':
      return { stroke: `notation.${kind}`, fill: 'none', dash: 'dashed', width: 1.5, strong: true, align: 'middle' };
  }
}

// ---- Layout tree -------------------------------------------------------------

interface Base {
  id: string;
  parent?: Cont;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Where a leaf may slide (its row height, column width or grid cell). */
  slot?: Box;
}

interface Leaf extends Base {
  kind: 'leaf';
  node: AzureNode;
  /** product: an official Azure or Databricks icon; glyph: a neutral participant or Lucide icon. */
  look: 'product' | 'glyph' | 'box';
  icon?: string;
  size: number;
  label: string;
  labelLines: string[];
  descLines: string[];
  statusH: number;
}

interface Header {
  lines: string[];
  descLines: string[];
  st: TextStyle;
  icon?: string;
  align: 'start' | 'middle';
  h: number;
}

interface Cont extends Base {
  kind: 'cont';
  spec?: AzureContainer;
  boundary?: AzureBoundaryKind;
  style?: BoundaryStyle;
  layout: AzureLayout;
  columns: number;
  children: Item[];
  pad: { l: number; r: number; t: number; b: number };
  head?: Header;
  gapX: number;
  gapY: number;
}

type Item = Leaf | Cont;

interface Env {
  ctx: LayoutContext;
  size: number;
  wrapW: number;
  badge: number;
  label: TextStyle;
  desc: TextStyle;
  headStrong: TextStyle;
  headPlain: TextStyle;
  caption: TextStyle;
  badgeText: TextStyle;
}

function blockW(env: Env, lines: string[], st: TextStyle): number {
  return lines.length ? env.ctx.fonts.blockWidth(lines, st.size, st.weight) : 0;
}

function measureLeaf(env: Env, n: AzureNode): Leaf {
  const { ctx } = env;
  const res = n.service ? resolveService(n.service, homePackOf(ctx.spec.type)) : undefined;
  const label = n.label ?? res?.label ?? n.id;
  const look: Leaf['look'] = isProductIcon(res) ? 'product' : res?.kind === 'generic' || n.icon ? 'glyph' : 'box';
  const icon = isProductIcon(res) ? res.id : res?.kind === 'generic' ? res.glyph : n.icon;
  const statusH = n.status && n.status !== 'current' ? 20 : 0;
  if (look === 'box') {
    const content = { label, description: n.description, status: n.status };
    const lines = wrap(ctx, label, BOX_MAX_W - 24, styles(ctx.theme).label);
    const want = Math.max(blockW(env, lines, styles(ctx.theme).label), n.description ? Math.min(BOX_MAX_W - 24, textWidth(ctx, n.description, styles(ctx.theme).body)) : 0) + 28;
    const w = snap16(Math.min(BOX_MAX_W, Math.max(BOX_MIN_W, want)));
    const h = nodeHeight(ctx, content, 'rect', w, undefined, 40);
    return { kind: 'leaf', id: n.id, node: n, look, size: 0, label, labelLines: [], descLines: [], statusH: 0, w, h, x: 0, y: 0 };
  }
  const labelLines = wrap(ctx, label, env.wrapW, env.label);
  const descLines = n.description ? wrap(ctx, n.description, env.wrapW + 16, env.desc) : [];
  const textW = Math.max(blockW(env, labelLines, env.label), blockW(env, descLines, env.desc));
  const w = env.size + snap16(Math.max(0, textW + 8 - env.size));
  const h = snapUp(
    env.size + ICON_GAP + labelLines.length * lh(ctx, env.label.size) + (descLines.length ? 2 + descLines.length * lh(ctx, env.desc.size) : 0) + statusH,
  );
  return { kind: 'leaf', id: n.id, node: n, look, icon, size: env.size, label, labelLines, descLines, statusH, w, h, x: 0, y: 0 };
}

function measureCont(env: Env, spec: AzureContainer | undefined, body: AzureArchitectureBody, depth: number, onFill: boolean): Cont {
  const { ctx } = env;
  const boundary = spec?.boundary;
  const style = boundary ? boundaryStyle(boundary, onFill, homePackOf(ctx.spec.type), ctx.theme) : undefined;
  const fills = onFill || (!!style && style.fill !== 'none');
  const items = spec ? spec.children : body.children;
  const children = items.map((it) => measureItem(env, it, body, depth + 1, fills));
  // Sibling boxes share one size, so a row of them reads as a set rather than a ragged edge.
  const boxes = children.filter((c): c is Leaf => c.kind === 'leaf' && c.look === 'box');
  if (boxes.length > 1) {
    const w = Math.max(...boxes.map((b) => b.w));
    const h = Math.max(...boxes.map((b) => b.h));
    for (const b of boxes) Object.assign(b, { w, h });
  }
  const layout = (spec ? spec.layout : body.layout) ?? (spec ? 'row' : 'row');
  const columns = Math.max(1, Math.min(children.length, (spec ? spec.columns : body.columns) ?? Math.ceil(Math.sqrt(children.length))));
  const allLeaves = children.every((c) => c.kind === 'leaf');
  const gapX = !spec ? GAP_ROOT : allLeaves ? GAP_LEAF_X : GAP_BOX;
  const gapY = !spec ? GAP_ROOT : allLeaves ? GAP_LEAF_Y : GAP_BOX;
  const { w: cw, h: ch } = contentSize(children, layout, columns, gapX, gapY);
  const c: Cont = {
    kind: 'cont',
    id: spec?.id ?? 'ds-root',
    spec,
    boundary,
    style,
    layout,
    columns,
    children,
    pad: { l: 0, r: 0, t: 0, b: 0 },
    gapX,
    gapY,
    w: cw,
    h: ch,
    x: 0,
    y: 0,
  };
  for (const k of children) k.parent = c;
  if (spec && boundary && style) {
    const label = boundaryLabel(spec, homePackOf(ctx.spec.type)) ?? '';
    const st = style.strong ? env.headStrong : env.headPlain;
    const icon = boundary === 'service' && spec.service ? resolveService(spec.service, homePackOf(ctx.spec.type)) : style.icon ? resolveService(style.icon) : undefined;
    const iconId = isProductIcon(icon) ? icon.id : undefined;
    const reserve = (spec.nsg ? SHIELD + 12 : 0) + (spec.step !== undefined ? env.badge + 12 : 0);
    const maxW = Math.max(cw, 200) - (iconId ? HEAD_ICON + 6 : 0) - (style.align === 'middle' ? 2 * reserve : reserve);
    const lines = label ? wrap(ctx, label, Math.max(96, maxW), st) : [];
    const descLines = spec.description ? wrap(ctx, spec.description, Math.max(96, maxW), env.caption) : [];
    const textH = lines.length * lh(ctx, st.size) + descLines.length * lh(ctx, env.caption.size);
    const h = lines.length || descLines.length || iconId ? HEAD_INSET + Math.max(iconId ? HEAD_ICON : 0, textH) + 10 : 12;
    c.head = { lines, descLines, st, icon: iconId, align: style.align, h };
    const headW =
      (iconId ? HEAD_ICON + 6 : 0) + Math.max(blockW(env, lines, st), blockW(env, descLines, env.caption)) + (style.align === 'middle' ? 2 * reserve : reserve);
    c.pad = { l: PAD, r: PAD, t: snapUp(h), b: PAD };
    c.w = snap16(Math.max(cw + 2 * PAD, headW + 2 * HEAD_INSET, 96));
    c.h = snapUp(ch + c.pad.t + c.pad.b);
  }
  return c;
}

function measureItem(env: Env, it: AzureItem, body: AzureArchitectureBody, depth: number, onFill: boolean): Item {
  return isAzureContainer(it) ? measureCont(env, it, body, depth, onFill) : measureLeaf(env, it);
}

function gridDims(children: Item[], columns: number) {
  const rows = Math.ceil(children.length / columns);
  const colW = new Array<number>(columns).fill(0);
  const rowH = new Array<number>(rows).fill(0);
  children.forEach((k, i) => {
    colW[i % columns] = Math.max(colW[i % columns], k.w);
    rowH[Math.floor(i / columns)] = Math.max(rowH[Math.floor(i / columns)], k.h);
  });
  return { rows, colW, rowH };
}

function contentSize(children: Item[], layout: AzureLayout, columns: number, gapX: number, gapY: number): { w: number; h: number } {
  if (!children.length) return { w: 0, h: 0 };
  if (layout === 'row') return { w: children.reduce((s, k) => s + k.w, 0) + gapX * (children.length - 1), h: Math.max(...children.map((k) => k.h)) };
  if (layout === 'column') return { w: Math.max(...children.map((k) => k.w)), h: children.reduce((s, k) => s + k.h, 0) + gapY * (children.length - 1) };
  const { colW, rowH } = gridDims(children, columns);
  return { w: colW.reduce((a, b) => a + b, 0) + gapX * (colW.length - 1), h: rowH.reduce((a, b) => a + b, 0) + gapY * (rowH.length - 1) };
}

// ---- Placement -----------------------------------------------------------------

function inner(c: Cont): Box {
  return { x: c.x + c.pad.l, y: c.y + c.pad.t, w: c.w - c.pad.l - c.pad.r, h: c.h - c.pad.t - c.pad.b };
}

/** Split `slack` into `n` lattice-aligned shares. */
function shares(slack: number, n: number): number[] {
  if (n <= 0 || slack <= 0) return new Array(Math.max(0, n)).fill(0);
  const base = Math.floor(slack / n / 16) * 16;
  const out = new Array<number>(n).fill(base);
  let rest = Math.floor((slack - base * n) / 16) * 16;
  for (let i = 0; rest > 0; i = (i + 1) % n, rest -= 16) out[i] += 16;
  return out;
}

/** Centre a leaf in its slot; `band` (the tallest leaf in its row) keeps icon tops level across the row. */
function placeLeaf(l: Leaf, slot: Box, band = l.h) {
  l.slot = slot;
  l.x = snap(slot.x + (slot.w - l.w) / 2);
  l.y = snap(slot.y + (slot.h - band) / 2);
}

function place(c: Cont, x: number, y: number, w: number, h: number) {
  c.x = x;
  c.y = y;
  c.w = w;
  c.h = h;
  const box = inner(c);
  const kids = c.children;
  if (!kids.length) return;
  const put = (k: Item, slot: Box, band?: number) => (k.kind === 'cont' ? place(k, slot.x, slot.y, slot.w, slot.h) : placeLeaf(k, slot, band));
  const leafBand = (list: Item[]) => Math.max(0, ...list.filter((k) => k.kind === 'leaf').map((k) => k.h));
  if (c.layout === 'row' || c.layout === 'column') {
    const row = c.layout === 'row';
    const gap = row ? c.gapX : c.gapY;
    const main = row ? box.w : box.h;
    const used = kids.reduce((s, k) => s + (row ? k.w : k.h), 0) + gap * (kids.length - 1);
    const slack = Math.max(0, main - used);
    const conts = kids.filter((k) => k.kind === 'cont');
    let pos = row ? box.x : box.y;
    let between = 0;
    const grow = new Map<Item, number>();
    if (conts.length && slack > 0) {
      shares(slack, conts.length).forEach((s, i) => grow.set(conts[i], s));
    } else if (slack > 0) {
      between = Math.floor(slack / (kids.length + 1) / GRID) * GRID;
      pos += between;
    }
    const band = row ? leafBand(kids) : undefined;
    for (const k of kids) {
      const len = (row ? k.w : k.h) + (grow.get(k) ?? 0);
      const slot = row ? { x: pos, y: box.y, w: len, h: box.h } : { x: box.x, y: pos, w: box.w, h: len };
      put(k, slot, band);
      pos += len + gap + between;
    }
    return;
  }
  // Grid: columns share horizontal slack, rows share vertical slack.
  const { colW, rowH } = gridDims(kids, c.columns);
  const colExtra = shares(box.w - (colW.reduce((a, b) => a + b, 0) + c.gapX * (colW.length - 1)), colW.length);
  const rowExtra = shares(box.h - (rowH.reduce((a, b) => a + b, 0) + c.gapY * (rowH.length - 1)), rowH.length);
  const xs: number[] = [];
  let cx = box.x;
  colW.forEach((cw, i) => {
    xs.push(cx);
    cx += cw + colExtra[i] + c.gapX;
  });
  const ys: number[] = [];
  let cy = box.y;
  rowH.forEach((rh, i) => {
    ys.push(cy);
    cy += rh + rowExtra[i] + c.gapY;
  });
  const bands = rowH.map((_, r) => leafBand(kids.slice(r * c.columns, r * c.columns + c.columns)));
  kids.forEach((k, i) => {
    const col = i % c.columns;
    const r = Math.floor(i / c.columns);
    put(k, { x: xs[col], y: ys[r], w: colW[col] + colExtra[col], h: rowH[r] + rowExtra[r] }, bands[r]);
  });
}

// ---- Geometry helpers ------------------------------------------------------------

function iconBox(l: Leaf): Box {
  if (l.look === 'box') return { x: l.x, y: l.y, w: l.w, h: l.h };
  return { x: l.x + (l.w - l.size) / 2, y: l.y, w: l.size, h: l.size };
}

function anchorPoint(it: Item): Point {
  if (it.kind === 'leaf') {
    const b = iconBox(it);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return { x: it.x + it.w / 2, y: it.y + it.h / 2 };
}

function within(it: Item, c: Cont): boolean {
  for (let p = it.parent; p; p = p.parent) if (p === c) return true;
  return false;
}

// ---- Alignment: slide services so connectors run straight ----------------------------

function alignToPartners(root: Cont, leaves: Leaf[], partners: Map<string, Item[]>) {
  const conts: Cont[] = [];
  const walk = (c: Cont) => {
    conts.push(c);
    for (const k of c.children) if (k.kind === 'cont') walk(k);
  };
  walk(root);
  const fit = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.max(lo, Math.min(hi, v)));

  for (let pass = 0; pass < 3; pass++) {
    // Main axis: a row (column) of services with spare room lines each one up with
    // a partner above or below (left or right), keeping their order.
    for (const c of conts) {
      if (c.layout === 'grid' || !c.children.length || !c.children.every((k) => k.kind === 'leaf')) continue;
      const row = c.layout === 'row';
      const kids = c.children as Leaf[];
      const box = inner(c);
      const lo = row ? box.x : box.y;
      const hi = row ? box.x + box.w : box.y + box.h;
      const len = (k: Leaf) => (row ? k.w : k.h);
      const used = kids.reduce((s, k) => s + len(k), 0) + (row ? c.gapX : c.gapY) * (kids.length - 1);
      if (hi - lo - used < GRID) continue;
      const gap = row ? c.gapX : c.gapY;
      const desired = kids.map((k) => {
        const a = anchorPoint(k);
        const p = (partners.get(k.id) ?? []).find((q) => !within(q, c) && (row ? Math.abs(anchorPoint(q).y - a.y) > Math.abs(anchorPoint(q).x - a.x) : Math.abs(anchorPoint(q).x - a.x) > Math.abs(anchorPoint(q).y - a.y)));
        const cur = row ? k.x : k.y;
        if (!p) return cur;
        const pa = anchorPoint(p);
        return row ? pa.x - k.w / 2 : pa.y - (iconBox(k).y - k.y) - (k.look === 'box' ? k.h / 2 : k.size / 2);
      });
      const pos = desired.map((d) => snap(d));
      for (let i = 0; i < kids.length; i++) pos[i] = Math.max(pos[i], i ? pos[i - 1] + len(kids[i - 1]) + gap : lo);
      for (let i = kids.length - 1; i >= 0; i--) pos[i] = Math.min(pos[i], i < kids.length - 1 ? pos[i + 1] - gap - len(kids[i]) : hi - len(kids[i]));
      for (let i = 0; i < kids.length; i++) pos[i] = Math.max(pos[i], i ? pos[i - 1] + len(kids[i - 1]) + gap : lo);
      kids.forEach((k, i) => {
        const v = snap(pos[i]);
        if (row) {
          k.x = v;
          k.slot = { ...k.slot!, x: v, w: k.w };
        } else {
          k.y = v;
          k.slot = { ...k.slot!, y: v, h: k.h };
        }
      });
    }
    // Cross axis: each service slides within its slot to sit level with a partner.
    for (const l of leaves) {
      const s = l.slot;
      const par = l.parent;
      if (!s || !par) continue;
      const a = anchorPoint(l);
      const list = partners.get(l.id) ?? [];
      const iconOff = l.look === 'box' ? l.h / 2 : l.size / 2;
      const horiz = par.layout === 'row' || par.layout === 'grid';
      const vert = par.layout === 'column' || par.layout === 'grid';
      if (horiz && s.h > l.h) {
        const p = list.find((q) => !within(q, par) && Math.abs(anchorPoint(q).x - a.x) > Math.abs(anchorPoint(q).y - a.y));
        if (p) l.y = snap(fit(anchorPoint(p).y - iconOff, s.y, s.y + s.h - l.h));
      }
      if (vert && s.w > l.w) {
        const p = list.find((q) => !within(q, par) && Math.abs(anchorPoint(q).y - a.y) >= Math.abs(anchorPoint(q).x - a.x));
        if (p) l.x = snap(fit(anchorPoint(p).x - l.w / 2, s.x, s.x + s.w - l.w));
      }
    }
  }
}

// ---- Flow notation -------------------------------------------------------------------

/** Flow-type colours: Microsoft green then Azure blue where the theme defines notation colours, else accent then highlight. */
const FLOW_COLORS: Token[] = ['notation.step', 'notation.flow2', 'lineStrong', 'cat.2', 'cat.3', 'cat.4'];
const FLOW_COLORS_PLAIN: Token[] = ['accent', 'highlight', 'lineStrong', 'cat.2', 'cat.3', 'cat.4'];
const BADGE_SHAPES: ShapeKind[] = ['ellipse', 'rect', 'triangle', 'diamond', 'ellipse', 'rect'];

interface FlowLook {
  stroke: Token;
  badgeFill: Token;
  badgeShape: ShapeKind;
  dash?: Dash;
}

function flowLooks(body: AzureArchitectureBody, notation: boolean): { byType: Map<string, FlowLook>; plain: FlowLook } {
  const byType = new Map<string, FlowLook>();
  const colors = notation ? FLOW_COLORS : FLOW_COLORS_PLAIN;
  (body.flowTypes ?? []).forEach((t, i) =>
    byType.set(t.id, { stroke: colors[i % colors.length], badgeFill: colors[i % colors.length], badgeShape: BADGE_SHAPES[i % BADGE_SHAPES.length], dash: t.style && t.style !== 'solid' ? t.style : undefined }),
  );
  return { byType, plain: { stroke: 'lineStrong', badgeFill: 'notation.step', badgeShape: 'ellipse' } };
}

// ---- Entry point ---------------------------------------------------------------------

export function layoutAzureArchitecture(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as AzureArchitectureBody;
  const { theme } = ctx;
  const st = styles(theme);
  const altitude = ctx.altitude;
  const env: Env = {
    ctx,
    size: ICON_SIZE[altitude],
    wrapW: LABEL_WRAP[altitude],
    badge: BADGE[altitude],
    label: { size: st.label.size, weight: theme.font.weight.body },
    desc: { size: st.caption.size, weight: theme.font.weight.body },
    headStrong: { size: st.group.size, weight: theme.font.weight.label },
    headPlain: { size: st.group.size, weight: theme.font.weight.body },
    caption: st.caption,
    badgeText: { size: st.caption.size, weight: theme.font.weight.label },
  };

  // 1. Measure.
  const root = measureCont(env, undefined, body, 0, false);
  const leaves: Leaf[] = [];
  const conts: Cont[] = [];
  const byId = new Map<string, Item>();
  const collect = (c: Cont) => {
    conts.push(c);
    for (const k of c.children) {
      byId.set(k.id, k);
      if (k.kind === 'leaf') leaves.push(k);
      else collect(k);
    }
  };
  collect(root);
  const flows = (body.flows ?? []).filter((f) => byId.has(f.from) && byId.has(f.to));

  // 2. Workflow narrative and legend.
  const steps = body.steps ?? [];
  const looks = flowLooks(body, !!theme.color.notation?.step);
  const lookOfStep = new Map<string, FlowLook>();
  for (const f of flows) {
    const k = stepKey(f.step);
    if (k && !lookOfStep.has(k)) lookOfStep.set(k, (f.type && looks.byType.get(f.type)) || looks.plain);
  }
  const legend: LegendItem[] = (body.flowTypes ?? []).map((t) => {
    const lk = looks.byType.get(t.id)!;
    const usesSteps = flows.some((f) => f.type === t.id && f.step !== undefined);
    return { kind: 'flow', label: t.label, flow: { stroke: lk.stroke, dash: lk.dash, badge: usesSteps ? { shape: lk.badgeShape, fill: lk.badgeFill } : undefined } };
  });

  // 3. Canvas: the smallest standard size (or exact fit for "auto") that holds the tree.
  const natW = root.w + 2 * ROUTE_MARGIN;
  const natH = root.h + 2 * ROUTE_MARGIN;
  const wantPanel = steps.length > 0 && body.workflow !== 'none';
  const panelFor = (side: 'right' | 'bottom', contentW: number): { w: number; h: number } => {
    if (side === 'right') return { w: PANEL_W, h: panelHeight(env, steps, PANEL_W) };
    const cols = contentW >= 880 ? 2 : 1;
    const colW = Math.floor((contentW - (cols - 1) * 24) / cols);
    return { w: contentW, h: panelHeight(env, steps, colW, cols) };
  };
  const hideTitle = body.frame === 'figure';
  const base = { W: ctx.W, H: ctx.H };
  type Choice = { scale: number; side?: 'right' | 'bottom' };
  const fits = (scale: number, side?: 'right' | 'bottom'): boolean => {
    const W = snap(base.W * scale);
    const H = snap(base.H * scale);
    const probe = { ...ctx, W, H, els: [], issues: [], anchors: new Map() } as LayoutContext;
    const fr = beginFrame(probe, { hideTitle, legend });
    const C = fr.content;
    let w = C.w;
    let h = C.h;
    if (side === 'right') w -= PANEL_W + PANEL_GAP;
    if (side === 'bottom') h -= panelFor('bottom', C.w).h + PANEL_GAP;
    if (side === 'right' && panelFor('right', C.w).h > C.h) return false;
    return natW <= w && (ctx.auto || natH <= h);
  };
  const sides: ('right' | 'bottom' | undefined)[] = !wantPanel ? [undefined] : body.workflow === 'right' ? ['right'] : body.workflow === 'bottom' ? ['bottom'] : ['right', 'bottom'];
  let choice: Choice | undefined;
  for (const scale of ctx.auto ? [1] : SCALES) {
    for (const side of sides) {
      if (fits(scale, side)) {
        choice = { scale, side };
        break;
      }
    }
    if (choice) break;
  }
  if (ctx.auto) {
    const side = sides[0];
    const needW = natW + (side === 'right' ? PANEL_W + PANEL_GAP : 0) + 2 * ctx.margin;
    ctx.W = Math.max(base.W, snap16(needW));
    choice = { scale: 1, side };
  } else if (!choice) {
    choice = { scale: SCALES[SCALES.length - 1], side: sides[0] };
    ctx.issues.push({
      path: 'body',
      id: 'ds-content',
      code: 'canvas-fit',
      message: `this architecture needs about ${Math.ceil(natW)} × ${Math.ceil(natH)} units, more than the largest ${ctx.spec.canvas?.aspect ?? '16:9'} canvas allows. Split it into two diagrams, group services into fewer boundaries, use "layout": "grid" in wide rows, or set "canvas": { "aspect": "auto" }.`,
    });
  }
  if (!ctx.auto) {
    ctx.W = snap(base.W * choice.scale);
    ctx.H = snap(base.H * choice.scale);
  }
  if (choice.scale > 1) ctx.notes.push(`The canvas grew to ${ctx.W} × ${ctx.H} to fit this architecture; on a 13.3-inch slide its labels print at about ${Math.round((st.label.size * 0.75) / choice.scale)} pt. Split the diagram if it must be read on a slide.`);

  // 4. Frame, then place the tree.
  const frame = beginFrame(ctx, { hideTitle, legend });
  const C = frame.content;
  const side = choice.side;
  const panel = side ? panelFor(side, C.w) : undefined;
  const area: Box = { ...C };
  if (side === 'right') area.w -= PANEL_W + PANEL_GAP;
  if (side === 'bottom') area.h -= panel!.h + PANEL_GAP;
  const ox = snap(area.x + Math.max(0, (area.w - natW) / 2) + ROUTE_MARGIN);
  const oy = snap(area.y + (ctx.auto ? 0 : Math.max(0, (area.h - natH) / 2)) + ROUTE_MARGIN);
  place(root, ox, oy, root.w, root.h);

  // 5. Line services up with their partners.
  const partners = new Map<string, Item[]>();
  for (const f of flows) {
    const a = byId.get(f.from)!;
    const b = byId.get(f.to)!;
    partners.set(f.from, [...(partners.get(f.from) ?? []), b]);
    partners.set(f.to, [...(partners.get(f.to) ?? []), a]);
  }
  alignToPartners(root, leaves, partners);

  const bottom = root.y + root.h + ROUTE_MARGIN;
  const treeArea: Box = { x: root.x - ROUTE_MARGIN, y: root.y - ROUTE_MARGIN, w: root.w + 2 * ROUTE_MARGIN, h: root.h + 2 * ROUTE_MARGIN };

  // 6. Draw boundaries (outermost first).
  const routeObstacles: RouteNode[] = [];
  const softLines: Point[][] = [];
  for (const c of conts) if (c.spec && c.boundary) drawBoundary(env, c, routeObstacles, softLines);

  // 7. Route flows.
  const routeBounds: Box = { x: treeArea.x, y: treeArea.y, w: treeArea.w, h: treeArea.h };
  for (const l of leaves) {
    const ib = iconBox(l);
    routeObstacles.push({ id: l.id, box: ib, shape: 'rect' });
    if (l.look !== 'box') {
      const tb = leafTextBox(env, l);
      if (tb) routeObstacles.push({ id: l.id, box: tb, shape: 'rect' });
    }
  }
  // Routes may cross the boundaries around their own ends, but should not wander through others.
  const softBoxes = conts.filter((c) => c.spec && c.boundary).map((c) => ({ id: c.id, box: { x: c.x, y: c.y, w: c.w, h: c.h } }));
  const ancestry = (it: Item) => {
    const s = new Set<string>();
    for (let p = it.kind === 'cont' ? it : it.parent; p; p = p.parent) s.add(p.id);
    return s;
  };
  const router = new Router({ bounds: routeBounds, obstacles: routeObstacles, step: GRID, clearance: GRID, endStub: 16, softLines, softBoxes });
  const routed: { flow: AzureFlow; points: Point[]; look: FlowLook; id: string }[] = [];
  flows.forEach((f, i) => {
    const a = byId.get(f.from)!;
    const b = byId.get(f.to)!;
    const ra = routeNode(a);
    const rb = routeNode(b);
    const { from, to } = sideCosts(anchorPoint(a), anchorPoint(b));
    const res = router.route({ id: `flow-${i}`, from: ra, to: rb, fromSides: from, toSides: to, allowed: new Set([...ancestry(a), ...ancestry(b)]) });
    const look = (f.type && looks.byType.get(f.type)) || looks.plain;
    const id = `${f.from}--to--${f.to}${flows.findIndex((g) => g.from === f.from && g.to === f.to) === i ? '' : `-${i}`}`;
    const arrows = f.arrows ?? 'forward';
    ctx.els.push({
      kind: 'connector',
      id,
      role: 'edge',
      points: res.points,
      paint: { fill: 'none', stroke: look.stroke, strokeWidth: 1.25, dash: f.style && f.style !== 'solid' ? f.style : look.dash },
      arrowEnd: arrows !== 'none',
      arrowStart: arrows === 'both',
      from: f.from,
      to: f.to,
      fromSide: res.fromSide,
      toSide: res.toSide,
      edgeKind: 'flow',
    });
    routed.push({ flow: f, points: res.points, look, id });
  });

  // 8. Services.
  for (const l of leaves) drawLeaf(env, l);

  // 9. Step badges, then flow labels, beside their lines.
  const widthOf = (t: TextEl) => ctx.fonts.blockWidth(t.lines, t.size, t.weight);
  const badges: Box[] = [];
  const obstacles = (): Obstacles => {
    const o = collectObstacles(ctx.els, widthOf, { x: treeArea.x, y: treeArea.y, w: treeArea.w, h: treeArea.h });
    o.boxes.push(...badges, ...leaves.map(iconBox));
    return o;
  };
  const d = env.badge;
  for (const c of conts) {
    if (!c.spec || !c.boundary || c.spec.step === undefined) continue;
    const b = { x: c.x + c.w - HEAD_INSET - d - (c.spec.nsg ? SHIELD + 12 : 0), y: c.y + Math.max(4, (c.head!.h - d) / 2), w: d, h: d };
    drawBadge(env, `${c.id}--step`, stepKey(c.spec.step)!, b, lookOfStep.get(stepKey(c.spec.step)!) ?? looks.plain);
    badges.push(b);
  }
  for (const l of leaves) {
    if (l.node.step === undefined) continue;
    const ib = iconBox(l);
    const b = badgeNear(ib, d, obstacles()) ?? { x: ib.x - d - 6, y: ib.y - 6, w: d, h: d };
    const k = stepKey(l.node.step)!;
    drawBadge(env, `${l.id}--step`, k, b, lookOfStep.get(k) ?? looks.plain);
    badges.push(b);
  }
  for (const r of routed) {
    if (r.flow.step === undefined) continue;
    const o = obstacles();
    const src = byId.get(r.flow.from)!;
    const b = badgeBesideRoute(r.points, d, o) ?? badgeNear(src.kind === 'leaf' ? iconBox(src) : { x: src.x, y: src.y, w: src.w, h: src.h }, d, o) ?? nearStart(r.points, d);
    drawBadge(env, `${r.id}--step`, stepKey(r.flow.step)!, b, r.look);
    badges.push(b);
  }
  for (const r of routed) {
    if (!r.flow.label) continue;
    const lines = wrap(ctx, r.flow.label, 140, st.caption);
    const w = ctx.fonts.blockWidth(lines, st.caption.size, st.caption.weight);
    const h = lines.length * lh(ctx, st.caption.size);
    const spot = placeAlongRoute(r.points, w, h, obstacles(), 4);
    const at = spot ?? { ...nearStart(r.points, w), h };
    if (!spot) fitIssue(ctx, `${r.id}--label`, `the label "${r.flow.label}" on the flow ${r.flow.from} → ${r.flow.to} has no clear spot beside its line. Shorten it, or move one of the services so the line is longer.`);
    addText(ctx, { id: `${r.id}--label`, role: 'edge-label', x: at.x, y: at.y, w, lines, ...st.caption, anchor: 'start', color: 'ink', free: true, slot: 'text' });
  }

  // 10. Workflow panel.
  let contentBottom = Math.max(bottom, root.y + root.h);
  if (side && panel) {
    if (side === 'right') {
      const x = C.x + C.w - PANEL_W;
      const y = side === 'right' ? Math.max(C.y, treeArea.y) : C.y;
      const h = drawPanel(env, steps, { x, y, w: PANEL_W, h: panel.h }, 1, lookOfStep, looks.plain);
      contentBottom = Math.max(contentBottom, y + h);
    } else {
      const y = snap(bottom + PANEL_GAP / 2);
      const cols = C.w >= 880 ? 2 : 1;
      const h = drawPanel(env, steps, { x: C.x, y, w: C.w, h: panel.h }, cols, lookOfStep, looks.plain);
      contentBottom = y + h;
    }
  }
  endFrame(ctx, frame, contentBottom);
}

// ---- Drawing ------------------------------------------------------------------------

function leafTextBox(env: Env, l: Leaf): Box | undefined {
  const lines = l.labelLines.length + l.descLines.length;
  if (!lines) return undefined;
  const top = l.y + l.size + ICON_GAP;
  const w = Math.max(blockW(env, l.labelLines, env.label), blockW(env, l.descLines, env.desc));
  const h = l.labelLines.length * lh(env.ctx, env.label.size) + (l.descLines.length ? 2 + l.descLines.length * lh(env.ctx, env.desc.size) : 0) + l.statusH;
  return { x: l.x + l.w / 2 - w / 2, y: top, w, h };
}

function routeNode(it: Item): RouteNode {
  if (it.kind === 'leaf' && it.look !== 'box') {
    const ib = iconBox(it);
    const cx = ib.x + ib.w / 2;
    const cy = ib.y + ib.h / 2;
    const spread = Math.max(0, ib.w / 2 - 16);
    return {
      id: it.id,
      box: ib,
      shape: 'rect',
      ports: {
        left: { x: ib.x, y: cy, spread },
        right: { x: ib.x + ib.w, y: cy, spread },
        top: { x: cx, y: ib.y, spread },
        bottom: { x: cx, y: it.y + it.h, spread: 8 },
      },
    };
  }
  return { id: it.id, box: { x: it.x, y: it.y, w: it.w, h: it.h }, shape: 'rect' };
}

function sideCosts(a: Point, b: Point): { from: Partial<Record<Side, number>>; to: Partial<Record<Side, number>> } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const h = Math.abs(dx) >= Math.abs(dy);
  const fx: Side = dx >= 0 ? 'right' : 'left';
  const fy: Side = dy >= 0 ? 'bottom' : 'top';
  const opp: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const from: Partial<Record<Side, number>> = { [fx]: h ? 0 : 40, [fy]: h ? 40 : 0, [opp[fx]]: 160, [opp[fy]]: 160 };
  const to: Partial<Record<Side, number>> = { [opp[fx]]: h ? 0 : 40, [opp[fy]]: h ? 40 : 0, [fx]: 160, [fy]: 160 };
  return { from, to };
}

/** A free spot for a step badge beside a route: the first segment first, near its start. */
function badgeBesideRoute(points: Point[], d: number, o: Obstacles): Box | undefined {
  const off = d / 2 + 6;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const horizontal = a.y === b.y;
    const len = Math.abs(horizontal ? b.x - a.x : b.y - a.y);
    if (len < 8) continue;
    const fractions = len < d + 24 ? [0.5] : k === 1 ? [0.3, 0.5, 0.15, 0.7, 0.85] : [0.5, 0.3, 0.7];
    for (const f of fractions) {
      const px = a.x + (b.x - a.x) * f;
      const py = a.y + (b.y - a.y) * f;
      const cands = horizontal
        ? [{ x: px - d / 2, y: py - off - d / 2 }, { x: px - d / 2, y: py + off - d / 2 }]
        : [{ x: px + off - d / 2, y: py - d / 2 }, { x: px - off - d / 2, y: py - d / 2 }];
      for (const c of cands) {
        const box = { x: snap(c.x, 2), y: snap(c.y, 2), w: d, h: d };
        if (isFree(box, o, 1)) return box;
      }
    }
  }
  return undefined;
}

/** A free spot for a step badge at the corner or side of a node. */
function badgeNear(ib: Box, d: number, o: Obstacles): Box | undefined {
  const cands: Box[] = [
    { x: ib.x - d - 6, y: ib.y - 6, w: d, h: d },
    { x: ib.x + ib.w + 6, y: ib.y - 6, w: d, h: d },
    { x: ib.x - d - 6, y: ib.y + ib.h / 2 - d / 2, w: d, h: d },
    { x: ib.x + ib.w + 6, y: ib.y + ib.h / 2 - d / 2, w: d, h: d },
    { x: ib.x + ib.w / 2 - d / 2, y: ib.y - d - 6, w: d, h: d },
    { x: ib.x - d - 6, y: ib.y + ib.h - d + 6, w: d, h: d },
    { x: ib.x + ib.w + 6, y: ib.y + ib.h - d + 6, w: d, h: d },
  ];
  return cands.find((c) => isFree(c, o, 1));
}

function nearStart(points: Point[], w: number): Box {
  const a = points[0];
  return { x: a.x + 6, y: a.y + 6, w, h: w };
}

function drawBoundary(env: Env, c: Cont, obstacles: RouteNode[], softLines: Point[][]) {
  const { ctx } = env;
  const s = c.style!;
  const spec = c.spec!;
  const emphasis: Emphasis = spec.emphasis ?? 'normal';
  const stroke: Token = emphasis === 'accent' ? 'accent' : emphasis === 'highlight' ? 'highlight' : s.stroke;
  const fill: Token = emphasis === 'accent' ? 'accent@6' : emphasis === 'highlight' ? 'highlight@8' : s.fill;
  addShape(ctx, {
    id: c.id,
    role: 'group',
    shape: 'rect',
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    radius: c.boundary === 'region' || s.square ? 0 : ctx.theme.shape.radius,
    paint: { fill, stroke: stroke === 'none' ? 'none' : stroke, strokeWidth: emphasis === 'accent' || emphasis === 'highlight' ? Math.max(1.5, s.width) : s.width, dash: s.dash },
    container: true,
    obstacle: false,
    inset: { l: c.pad.l, r: c.pad.r, t: c.pad.t, b: c.pad.b },
    parent: c.parent?.spec ? c.parent.id : undefined,
    group: `g-${c.id}`,
    meta: { specId: c.id, kind: c.boundary, label: boundaryLabel(spec, homePackOf(ctx.spec.type)), emphasis },
  });
  ctx.anchors.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h });
  softLines.push([
    { x: c.x, y: c.y },
    { x: c.x + c.w, y: c.y },
    { x: c.x + c.w, y: c.y + c.h },
    { x: c.x, y: c.y + c.h },
    { x: c.x, y: c.y },
  ]);
  const h = c.head!;
  if (s.headFill) {
    addShape(ctx, {
      id: `${c.id}--head`,
      role: 'decoration',
      shape: 'rect',
      x: c.x,
      y: c.y,
      w: c.w,
      h: h.h,
      radius: ctx.theme.shape.radius,
      paint: { fill: s.headFill, stroke: 'none', strokeWidth: 0 },
      box: false,
      group: `g-${c.id}`,
    });
  }
  let tx = c.x + HEAD_INSET;
  const ty = c.y + HEAD_INSET;
  if (h.icon) {
    ctx.els.push({ kind: 'icon', id: `${c.id}--icon`, role: 'icon', set: 'product', name: h.icon, alt: boundaryLabel(spec, homePackOf(ctx.spec.type)), x: tx, y: ty, size: HEAD_ICON, color: 'none', group: `g-${c.id}` });
    obstacles.push({ id: c.id, box: { x: tx, y: ty, w: HEAD_ICON, h: HEAD_ICON }, shape: 'rect' });
    tx += HEAD_ICON + 6;
  }
  const lineH = lh(ctx, h.st.size);
  const textH = h.lines.length * lineH + h.descLines.length * lh(ctx, env.caption.size);
  let y = ty + (h.icon ? Math.max(0, (HEAD_ICON - textH) / 2) : 0);
  const middle = h.align === 'middle';
  const ax = middle ? c.x + c.w / 2 : tx;
  const behind = s.headFill ?? (fill === 'none' ? 'background' : fill);
  const ink: Token = `text(ink,${behind})`;
  if (h.lines.length) {
    const t = addText(ctx, { id: `${c.id}--label`, role: 'header', x: ax, y, lines: h.lines, ...h.st, anchor: middle ? 'middle' : 'start', color: ink, group: `g-${c.id}`, slot: 'heading' });
    obstacles.push({ id: c.id, box: textBox(t, (e) => ctx.fonts.blockWidth(e.lines, e.size, e.weight)), shape: 'rect' });
    y += h.lines.length * lineH;
  }
  if (h.descLines.length) {
    const t = addText(ctx, { id: `${c.id}--description`, role: 'header', x: ax, y, lines: h.descLines, ...env.caption, weight: ctx.theme.font.weight.body, anchor: middle ? 'middle' : 'start', color: `text(inkMuted,${behind})`, group: `g-${c.id}`, slot: 'text' });
    obstacles.push({ id: c.id, box: textBox(t, (e) => ctx.fonts.blockWidth(e.lines, e.size, e.weight)), shape: 'rect' });
  }
  if (spec.nsg && c.boundary === 'subnet') {
    const sx = c.x + c.w - SHIELD - HEAD_INSET;
    const sy = c.y - SHIELD / 2;
    ctx.els.push({ kind: 'icon', id: `${c.id}--nsg`, role: 'icon', set: 'product', name: 'network-security-groups', alt: 'Network security group', x: sx, y: sy, size: SHIELD, color: 'none', group: `g-${c.id}` });
    obstacles.push({ id: c.id, box: { x: sx, y: sy, w: SHIELD, h: SHIELD }, shape: 'rect' });
  }
}

/** The fill a leaf's label sits on: its nearest filled boundary (a dark platform block, say), else the canvas. */
function fillBehind(l: Leaf): Token {
  for (let c = l.parent; c; c = c.parent) if (c.style && c.style.fill !== 'none') return c.style.fill;
  return 'background';
}

function drawLeaf(env: Env, l: Leaf) {
  const { ctx } = env;
  const n = l.node;
  const group = `g-${l.id}`;
  const emphasis = n.emphasis ?? 'normal';
  if (l.look === 'box') {
    drawNode(ctx, {
      id: l.id,
      specId: l.id,
      shape: 'rect',
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      look: nodeLook(ctx.theme, emphasis, n.status),
      content: { label: l.label, description: n.description, status: n.status },
      emphasis,
      parent: l.parent?.spec ? l.parent.id : undefined,
      kind: 'box',
    });
    return;
  }
  const ib = iconBox(l);
  const tb = leafTextBox(env, l);
  if (emphasis !== 'normal') {
    const all = tb ? { x: Math.min(ib.x, tb.x), y: ib.y, w: Math.max(ib.x + ib.w, tb.x + tb.w) - Math.min(ib.x, tb.x), h: tb.y + tb.h - ib.y } : ib;
    const c: Token = emphasis === 'accent' ? 'accent' : emphasis === 'highlight' ? 'highlight' : 'line';
    addShape(ctx, {
      id: `${l.id}--emphasis`,
      role: 'decoration',
      shape: 'rect',
      x: all.x - 8,
      y: all.y - 8,
      w: all.w + 16,
      h: all.h + 16,
      radius: 4,
      paint: { fill: emphasis === 'muted' ? 'none' : `${c}@10`, stroke: c, strokeWidth: emphasis === 'muted' ? 1 : 1.5, dash: emphasis === 'muted' ? 'dashed' : undefined },
      box: false,
      group,
    });
  }
  addShape(ctx, {
    id: l.id,
    role: 'node',
    shape: 'rect',
    ...ib,
    paint: { fill: 'none', stroke: 'none', strokeWidth: 0 },
    obstacle: true,
    parent: l.parent?.spec ? l.parent.id : undefined,
    group,
    meta: { specId: l.id, kind: l.look === 'product' ? 'service' : 'participant', label: l.label, description: n.description, emphasis, status: n.status },
  });
  ctx.anchors.set(l.id, ib);
  if (l.look === 'product') {
    ctx.els.push({ kind: 'icon', id: `${l.id}--icon`, role: 'icon', set: 'product', name: l.icon!, alt: l.label, x: ib.x, y: ib.y, size: ib.w, color: 'none', group });
  } else {
    const g = Math.round(ib.w * 0.75);
    ctx.els.push({ kind: 'icon', id: `${l.id}--icon`, role: 'icon', name: l.icon!, x: ib.x + (ib.w - g) / 2, y: ib.y + (ib.w - g) / 2, size: g, color: 'lineStrong', group });
  }
  const behind: Token = emphasis === 'accent' ? 'accent@10' : emphasis === 'highlight' ? 'highlight@10' : fillBehind(l);
  let y = ib.y + ib.h + ICON_GAP;
  const cx = l.x + l.w / 2;
  if (l.labelLines.length) {
    addText(ctx, { id: `${l.id}--label`, role: 'label', x: cx, y, lines: l.labelLines, ...env.label, anchor: 'middle', color: emphasis === 'muted' ? 'inkMuted' : `text(ink,${behind})`, group, slot: 'label' });
    y += l.labelLines.length * lh(ctx, env.label.size);
  }
  if (l.descLines.length) {
    y += 2;
    addText(ctx, { id: `${l.id}--description`, role: 'label', x: cx, y, lines: l.descLines, ...env.desc, anchor: 'middle', color: `text(inkMuted,${behind})`, group, slot: 'description' });
    y += l.descLines.length * lh(ctx, env.desc.size);
  }
  if (n.status && n.status !== 'current') {
    const text = STATUS_LABEL[n.status];
    const stc = styles(ctx.theme).captionStrong;
    const bw = Math.ceil(textWidth(ctx, text, stc) + 14);
    const look = badgeLook(ctx.theme, n.status, behind);
    const bx = cx - bw / 2;
    const by = y + 3;
    addShape(ctx, { id: `${l.id}--badge`, role: 'badge', shape: 'pill', x: bx, y: by, w: bw, h: 16, paint: { ...look.paint, strokeWidth: 1 }, inset: { l: 6, r: 6, t: 0, b: 0 }, box: false, group });
    addText(ctx, { id: `${l.id}--badge-text`, role: 'label', x: cx, y: by, w: bw - 12, lines: [text], ...stc, lineHeight: 16, anchor: 'middle', color: look.ink, box: `${l.id}--badge`, group, slot: 'badge' });
  }
}

function drawBadge(env: Env, id: string, text: string, b: Box, look: FlowLook) {
  const { ctx } = env;
  const shape = look.badgeShape;
  addShape(ctx, {
    id,
    role: 'badge',
    shape,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    radius: shape === 'rect' ? 2 : undefined,
    paint: { fill: look.badgeFill, stroke: 'none', strokeWidth: 0 },
    box: false,
    group: `g-${id}`,
  });
  const lineH = shape === 'triangle' ? b.h * 0.6 : b.h;
  addText(ctx, {
    id: `${id}-text`,
    role: 'badge',
    x: b.x + b.w / 2,
    y: shape === 'triangle' ? b.y + b.h * 0.38 : b.y,
    w: b.w,
    lines: [text],
    ...env.badgeText,
    size: text.length > 2 ? env.badgeText.size - 1 : env.badgeText.size,
    lineHeight: lineH,
    anchor: 'middle',
    color: `text(notation.stepInk,${look.badgeFill})`,
    free: true,
    group: `g-${id}`,
    slot: 'badge',
  });
}

function panelHeight(env: Env, steps: { step: string | number; text: string }[], width: number, cols = 1): number {
  const { ctx } = env;
  const st = styles(ctx.theme);
  const textW = width - env.badge - 10;
  const rows = steps.map((s) => Math.max(env.badge, wrap(ctx, s.text, textW, st.body).length * lh(ctx, st.body.size)));
  const head = lh(ctx, st.caption.size) + 8;
  if (cols === 1) return snapUp(head + rows.reduce((a, b) => a + b + 10, 0));
  const per = Math.ceil(rows.length / cols);
  let max = 0;
  for (let c = 0; c < cols; c++) max = Math.max(max, rows.slice(c * per, c * per + per).reduce((a, b) => a + b + 10, 0));
  return snapUp(head + max);
}

function drawPanel(
  env: Env,
  steps: { step: string | number; text: string }[],
  box: Box,
  cols: number,
  lookOfStep: Map<string, FlowLook>,
  plain: FlowLook,
): number {
  const { ctx } = env;
  const st = styles(ctx.theme);
  addText(ctx, { id: 'ds-workflow-heading', role: 'label', x: box.x, y: box.y, lines: ['WORKFLOW'], ...st.captionStrong, anchor: 'start', color: 'inkMuted', letterSpacing: 0.6, slot: 'heading' });
  const head = lh(ctx, st.caption.size) + 8;
  const colW = cols === 1 ? box.w : Math.floor((box.w - (cols - 1) * 24) / cols);
  const per = Math.ceil(steps.length / cols);
  let maxY = box.y + head;
  for (let c = 0; c < cols; c++) {
    let y = box.y + head;
    const x = box.x + c * (colW + 24);
    for (const s of steps.slice(c * per, c * per + per)) {
      const k = String(s.step);
      const d = env.badge;
      drawBadge(env, `ds-workflow-${k}`, k, { x, y, w: d, h: d }, lookOfStep.get(k) ?? plain);
      const lines = wrap(ctx, s.text, colW - d - 10, st.body);
      const textH = lines.length * lh(ctx, st.body.size);
      addText(ctx, { id: `ds-workflow-${k}-description`, role: 'label', x: x + d + 10, y: y + Math.max(0, (d - lh(ctx, st.body.size)) / 2), w: colW - d - 10, lines, ...st.body, anchor: 'start', color: 'ink', slot: 'text' });
      y += Math.max(d, textH + Math.max(0, (d - lh(ctx, st.body.size)) / 2)) + 10;
    }
    maxY = Math.max(maxY, y);
  }
  return maxY - box.y;
}
