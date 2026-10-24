/**
 * The scene graph: positioned, semantic drawing elements produced by a layout
 * module. Colours are theme tokens until `applyTheme` resolves them to hex.
 * Every exporter (SVG, PNG, PDF, PPTX, draw.io) consumes this structure, so
 * all formats share one geometry.
 */
import type { Emphasis, Status } from '../spec.js';
import type { Token } from '../theme/tokens.js';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Values for the SVG `data-role` attribute. */
export type Role =
  | 'background'
  | 'decoration'
  | 'title'
  | 'subtitle'
  | 'node'
  | 'group'
  | 'lane'
  | 'phase'
  | 'band'
  | 'header'
  | 'label'
  | 'edge'
  | 'edge-label'
  | 'callout'
  | 'legend'
  | 'footer'
  | 'badge'
  | 'axis'
  | 'marker'
  | 'icon';

export type ShapeKind =
  | 'rect'
  | 'pill'
  | 'chevron'
  | 'pentagon'
  | 'diamond'
  | 'triangle'
  | 'ellipse'
  | 'document'
  | 'cylinder'
  | 'delay'
  | 'predefined';

export type Dash = 'solid' | 'dashed' | 'dotted';

export interface Paint {
  fill: Token;
  stroke: Token;
  strokeWidth: number;
  dash?: Dash;
  /** Drop shadow from the theme's `shape.shadow` token. */
  shadow?: boolean;
}

export interface NodeMeta {
  /** Spec id of the element this shape represents. */
  specId?: string;
  kind?: string;
  label?: string;
  description?: string;
  emphasis?: Emphasis;
  status?: Status;
  tags?: string[];
}

export interface ShapeEl {
  kind: 'shape';
  id: string;
  role: Role;
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  /** Point depth for chevrons and pentagons. */
  depth?: number;
  paint: Paint;
  /** Counts as a box for overlap checks. */
  box: boolean;
  /** Connectors must not pass through it. */
  obstacle: boolean;
  /** May contain other boxes (bands, lanes, panels). */
  container: boolean;
  /** Text area inside the shape, as insets from its bounds. */
  inset?: Insets;
  /** Collision box used instead of bounds (e.g. interlocking chevrons). */
  hitbox?: Box;
  /** Siblings whose centres must align (`row`: same centre y, `column`: same centre x). */
  align?: { group: string; axis: 'row' | 'column' };
  /** Exporters group elements sharing this key (PPTX groups). */
  group?: string;
  /** Parent container id (draw.io pools, PPTX ordering). */
  parent?: string;
  meta?: NodeMeta;
}

export interface TextEl {
  kind: 'text';
  id: string;
  role: Role;
  /** Anchor x (start, middle or end of each line). */
  x: number;
  /** Top of the first line box. */
  y: number;
  /** Width available for wrapping (used by editable exporters). */
  w: number;
  lines: string[];
  size: number;
  weight: number;
  /** Absolute line height in units. */
  lineHeight: number;
  anchor: 'start' | 'middle' | 'end';
  color: Token;
  /** Id of the shape this text must fit inside. */
  box?: string;
  /** Free-floating label (edge labels, plot labels): checked for collisions. */
  free?: boolean;
  group?: string;
  /** Semantic slot inside a node, used by editable exporters. */
  slot?: 'label' | 'description' | 'metric' | 'owner' | 'badge' | 'heading' | 'item' | 'text';
  uppercase?: boolean;
  letterSpacing?: number;
}

export interface ConnectorEl {
  kind: 'connector';
  id: string;
  role: 'edge';
  points: Point[];
  paint: Paint;
  arrowEnd: boolean;
  from?: string;
  to?: string;
  /** Sides used at each end, for editable exporters. */
  fromSide?: Side;
  toSide?: Side;
  edgeKind?: 'flow' | 'handoff' | 'feedback';
  /** Arrowhead at the start too (two-way flows). */
  arrowStart?: boolean;
  labelId?: string;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface LineEl {
  kind: 'line';
  id: string;
  role: Role;
  points: Point[];
  paint: Paint;
  arrowEnd?: boolean;
  arrowStart?: boolean;
  group?: string;
}

export interface IconEl {
  kind: 'icon';
  id: string;
  role: 'icon';
  /** Icon name: a Lucide name, or a resolved Azure icon id when `set` is "azure". */
  name: string;
  /** "azure" draws the official full-colour Azure icon (never recoloured); default Lucide line icon. */
  set?: 'lucide' | 'azure';
  /** Alternative text (the service name) for exports that carry it. */
  alt?: string;
  x: number;
  y: number;
  size: number;
  color: Token;
  group?: string;
}

export interface GridEl {
  kind: 'grid';
  id: string;
  role: 'decoration';
  x: number;
  y: number;
  w: number;
  h: number;
  spacing: number;
  color: Token;
}

export type SceneElement = ShapeEl | TextEl | ConnectorEl | LineEl | IconEl | GridEl;

export interface SceneMeta {
  type: string;
  altitude: string;
  themeId: string;
  title: string;
  subtitle?: string;
  /** Speaker-notes text for PPTX. */
  notes?: string;
  /** Number of nodes counted against the altitude limit. */
  nodeCount: number;
}

export interface Scene {
  width: number;
  height: number;
  margin: number;
  background: Token;
  elements: SceneElement[];
  meta: SceneMeta;
  /** True once colour tokens have been resolved to hex by the theme stage. */
  resolved?: boolean;
}

export function isShape(e: SceneElement): e is ShapeEl {
  return e.kind === 'shape';
}
export function isText(e: SceneElement): e is TextEl {
  return e.kind === 'text';
}
export function isConnector(e: SceneElement): e is ConnectorEl {
  return e.kind === 'connector';
}
