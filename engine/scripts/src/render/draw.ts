/**
 * Converts a resolved scene into drawing primitives shared by the SVG and PDF
 * writers. The `sketch` renderer swaps clean outlines for rough.js strokes
 * here, so every vector output gets the same hand-drawn geometry.
 */
import roughModule from 'roughjs';
import type { RoughGenerator } from 'roughjs/bin/generator.js';
import { n, polygonPath, roundedPolylinePath, shapePath, shapePoints } from '../scene/geometry.js';
import type { Dash, Point, Role, Scene, SceneElement, ShapeEl } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import { half, hash32 } from '../util.js';
import { ICON_VIEWBOX, iconPaths } from './icons.js';

export interface PathPrim {
  t: 'path';
  d: string;
  fill: string;
  stroke: string;
  sw: number;
  dash?: number[];
  cap?: 'round' | 'butt';
  join?: 'round' | 'miter';
}

export interface TextLine {
  text: string;
  x: number;
  /** Baseline y. */
  y: number;
}

export interface TextPrim {
  t: 'text';
  lines: TextLine[];
  size: number;
  weight: number;
  family: string;
  file: string;
  color: string;
  anchor: 'start' | 'middle' | 'end';
  letterSpacing?: number;
}

export interface IconPrim {
  t: 'icon';
  x: number;
  y: number;
  scale: number;
  paths: string[];
  color: string;
  sw: number;
}

/** An official product icon (Azure or Databricks), drawn from its own SVG at a square size. */
export interface ProductIconPrim {
  t: 'product';
  icon: string;
  x: number;
  y: number;
  size: number;
}

export interface GridPrim {
  t: 'grid';
  x: number;
  y: number;
  w: number;
  h: number;
  spacing: number;
  color: string;
}

export type Prim = PathPrim | TextPrim | IconPrim | ProductIconPrim | GridPrim;

export interface DrawItem {
  id: string;
  role: Role;
  prims: Prim[];
  shadow?: boolean;
  data?: Record<string, string>;
}

export function dashArray(dash: Dash | undefined, sw: number): number[] | undefined {
  if (!dash || dash === 'solid') return undefined;
  if (dash === 'dashed') return [half(Math.max(5, sw * 4)), half(Math.max(4, sw * 3))];
  return [0.5, half(Math.max(3, sw * 2.5))];
}

interface ArrowGeom {
  shaft: Point[];
  head: Point[];
}

/** Shortens the polyline so the shaft stops at the arrowhead base. */
export function arrowGeometry(points: Point[], sw: number): ArrowGeom {
  const len = half(7 + sw * 2);
  const wid = half(len * 0.8);
  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = Math.sign(end.x - prev.x);
  const dy = Math.sign(end.y - prev.y);
  const base = { x: end.x - dx * len, y: end.y - dy * len };
  const shaft = [...points.slice(0, -1), { x: end.x - dx * (len - 1), y: end.y - dy * (len - 1) }];
  const px = -dy;
  const py = dx;
  const head = [
    end,
    { x: base.x + (px * wid) / 2, y: base.y + (py * wid) / 2 },
    { x: base.x - (px * wid) / 2, y: base.y - (py * wid) / 2 },
  ];
  return { shaft, head };
}

export interface DrawOptions {
  theme: Theme;
  fonts: FontSet;
}

// roughjs ships CommonJS; normalise the default export across loaders.
const rough = ((roughModule as unknown as { default?: unknown }).default ?? roughModule) as {
  generator(): RoughGenerator;
};

type RoughGen = RoughGenerator;
interface RoughPathInfo {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

class SketchPainter {
  private gen: RoughGen;
  constructor(private readonly roughness: number) {
    this.gen = rough.generator();
  }

  private opts(id: string, fill: string, stroke: string, sw: number, extra: Record<string, unknown> = {}) {
    return {
      seed: (hash32(id) % 2147483646) + 1,
      roughness: this.roughness,
      bowing: 0.8,
      stroke: stroke === 'none' ? 'none' : stroke,
      strokeWidth: sw,
      fill: fill === 'none' ? undefined : fill,
      fillStyle: 'solid',
      preserveVertices: true,
      disableMultiStroke: false,
      ...extra,
    };
  }

  private toPrims(drawable: ReturnType<RoughGen['path']>, dash?: number[]): PathPrim[] {
    return this.gen.toPaths(drawable).map((p: RoughPathInfo) => ({
      t: 'path' as const,
      d: roundPathData(p.d),
      fill: p.fill && p.fill !== 'none' ? p.fill : 'none',
      stroke: p.stroke && p.stroke !== 'none' ? p.stroke : 'none',
      sw: p.strokeWidth,
      dash: p.fill && p.fill !== 'none' ? undefined : dash,
      cap: 'round' as const,
      join: 'round' as const,
    }));
  }

  shape(id: string, d: string, fill: string, stroke: string, sw: number, dash?: number[]): PathPrim[] {
    return this.toPrims(this.gen.path(d, this.opts(id, fill, stroke, sw)), dash);
  }

  line(id: string, pts: Point[], stroke: string, sw: number, dash?: number[]): PathPrim[] {
    const d = this.gen.linearPath(
      pts.map((p) => [p.x, p.y] as [number, number]),
      this.opts(id, 'none', stroke, sw, { disableMultiStroke: true }),
    );
    return this.toPrims(d, dash);
  }

  polygon(id: string, pts: Point[], fill: string, stroke: string, sw: number): PathPrim[] {
    const d = this.gen.polygon(
      pts.map((p) => [p.x, p.y] as [number, number]),
      this.opts(id, fill, stroke, sw, { roughness: this.roughness * 0.5 }),
    );
    return this.toPrims(d);
  }
}

/** Round every number in path data to 0.5 for deterministic, compact output. */
export function roundPathData(d: string): string {
  return d
    .replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (m) => n(Number(m)))
    .replace(/\s+/g, ' ')
    .replace(/ ?([MLCQAZHV]) ?/gi, '$1')
    .trim();
}

export function sceneToDraw(scene: Scene, { theme, fonts }: DrawOptions): DrawItem[] {
  const sketch = theme.style.renderer === 'sketch' ? new SketchPainter(theme.style.roughness ?? 1.1) : undefined;
  const items: DrawItem[] = [];
  for (const e of scene.elements) {
    const item = drawElement(e, sketch, fonts, theme);
    if (item) items.push(item);
  }
  return items;
}

function shapeData(e: ShapeEl): Record<string, string> | undefined {
  const d: Record<string, string> = {};
  if (e.meta?.specId) d['data-node'] = e.meta.specId;
  if (e.meta?.emphasis && e.meta.emphasis !== 'normal') d['data-emphasis'] = e.meta.emphasis;
  if (e.meta?.status && e.meta.status !== 'current') d['data-status'] = e.meta.status;
  return Object.keys(d).length ? d : undefined;
}

function drawElement(e: SceneElement, sketch: SketchPainter | undefined, fonts: FontSet, theme: Theme): DrawItem | null {
  switch (e.kind) {
    case 'shape': {
      const { fill, stroke, strokeWidth } = e.paint;
      const sw = stroke === 'none' ? 0 : strokeWidth;
      const dash = dashArray(e.paint.dash, sw);
      const d = shapePath(e);
      let prims: PathPrim[];
      if (sketch && e.role !== 'background' && Math.min(e.w, e.h) >= 14) {
        const pts = shapePoints(e.shape, e.x, e.y, e.w, e.h, e.depth);
        prims = pts
          ? sketch.polygon(e.id, pts, fill, stroke, sw)
          : sketch.shape(e.id, d, fill, stroke, sw, dash);
      } else {
        prims = [{ t: 'path', d, fill, stroke, sw, dash, join: 'round' }];
      }
      return { id: e.id, role: e.role, prims, shadow: e.paint.shadow && !sketch, data: shapeData(e) };
    }
    case 'text': {
      const face = fonts.face(e.weight);
      const base = fonts.baseline(e.size, e.weight, e.lineHeight);
      const lines = e.lines.map((text, i) => ({ text, x: half(e.x), y: half(e.y + i * e.lineHeight + base) }));
      return {
        id: e.id,
        role: e.role,
        prims: [
          {
            t: 'text',
            lines,
            size: e.size,
            weight: face.weight,
            family: face.family,
            file: face.file,
            color: e.color,
            anchor: e.anchor,
            letterSpacing: e.letterSpacing,
          },
        ],
      };
    }
    case 'connector':
    case 'line': {
      const { stroke, strokeWidth } = e.paint;
      const dash = dashArray(e.paint.dash, strokeWidth);
      const wantArrow = e.kind === 'connector' ? e.arrowEnd && theme.connector.arrow !== 'none' : !!e.arrowEnd;
      const open = theme.connector.arrow === 'open';
      let pts = e.points;
      let head: Point[] | undefined;
      if (wantArrow && pts.length >= 2) {
        const g = arrowGeometry(pts, strokeWidth);
        if (!open) pts = g.shaft;
        head = g.head;
      }
      let startHead: Point[] | undefined;
      if (e.arrowStart && pts.length >= 2) {
        const g = arrowGeometry([...pts].reverse(), strokeWidth);
        pts = [...g.shaft].reverse();
        startHead = g.head;
      }
      const radius = e.kind === 'connector' ? theme.connector.cornerRadius : 0;
      const prims: PathPrim[] = [];
      if (sketch) prims.push(...sketch.line(e.id, pts, stroke, strokeWidth, dash));
      else
        prims.push({
          t: 'path',
          d: roundedPolylinePath(pts, radius),
          fill: 'none',
          stroke,
          sw: strokeWidth,
          dash,
          cap: dash && e.paint.dash === 'dotted' ? 'round' : 'butt',
          join: 'round',
        });
      for (const h of [head, startHead]) {
        if (!h) continue;
        if (open) {
          prims.push({ t: 'path', d: `M${n(h[1].x)} ${n(h[1].y)}L${n(h[0].x)} ${n(h[0].y)}L${n(h[2].x)} ${n(h[2].y)}`, fill: 'none', stroke, sw: strokeWidth, cap: 'round', join: 'round' });
        } else if (sketch) prims.push(...sketch.polygon(`${e.id}-head`, h, stroke, stroke, 1));
        else prims.push({ t: 'path', d: polygonPath(h), fill: stroke, stroke: 'none', sw: 0, join: 'miter' });
      }
      const data: Record<string, string> = {};
      if (e.kind === 'connector') {
        if (e.from) data['data-from'] = e.from;
        if (e.to) data['data-to'] = e.to;
        if (e.edgeKind) data['data-kind'] = e.edgeKind;
      }
      return { id: e.id, role: e.role, prims, data: Object.keys(data).length ? data : undefined };
    }
    case 'icon': {
      if (e.set === 'product') {
        return { id: e.id, role: 'icon', prims: [{ t: 'product', icon: e.name, x: half(e.x), y: half(e.y), size: half(e.size) }] };
      }
      const paths = iconPaths(e.name);
      if (!paths) return null;
      const scale = e.size / ICON_VIEWBOX;
      return {
        id: e.id,
        role: 'icon',
        prims: [{ t: 'icon', x: half(e.x), y: half(e.y), scale: Math.round(scale * 1000) / 1000, paths, color: e.color, sw: 2 }],
      };
    }
    case 'grid':
      return {
        id: e.id,
        role: 'decoration',
        prims: [{ t: 'grid', x: e.x, y: e.y, w: e.w, h: e.h, spacing: e.spacing, color: e.color }],
      };
  }
}
