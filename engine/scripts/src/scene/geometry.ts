/** Geometry helpers: shape outlines as SVG path data, boxes and segments. */
import { fmt } from '../util.js';
import type { Box, Insets, Point, ShapeEl, ShapeKind } from './types.js';

export function n(v: number): string {
  return fmt(v);
}

export function rectPath(x: number, y: number, w: number, h: number, r = 0): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  return (
    `M${n(x + rr)} ${n(y)}H${n(x + w - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w)} ${n(y + rr)}` +
    `V${n(y + h - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w - rr)} ${n(y + h)}` +
    `H${n(x + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x)} ${n(y + h - rr)}` +
    `V${n(y + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)}Z`
  );
}

export function polygonPath(pts: Point[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join('') + 'Z';
}

export function polylinePath(pts: Point[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join('');
}

/** Orthogonal polyline with rounded corners. */
export function roundedPolylinePath(pts: Point[], radius: number): string {
  if (pts.length < 3 || radius <= 0) return polylinePath(pts);
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) {
      d += `L${n(p1.x)} ${n(p1.y)}`;
      continue;
    }
    const a = { x: p1.x - ((p1.x - p0.x) / l1) * r, y: p1.y - ((p1.y - p0.y) / l1) * r };
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * r, y: p1.y + ((p2.y - p1.y) / l2) * r };
    d += `L${n(a.x)} ${n(a.y)}Q${n(p1.x)} ${n(p1.y)} ${n(b.x)} ${n(b.y)}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${n(last.x)} ${n(last.y)}`;
}

/** Outline polygon points for polygonal shapes (used by sketch, PDF, hit tests). */
export function shapePoints(kind: ShapeKind, x: number, y: number, w: number, h: number, depth = 18): Point[] | null {
  const d = Math.min(depth, w / 3);
  switch (kind) {
    case 'chevron':
      return [
        { x, y },
        { x: x + w - d, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w - d, y: y + h },
        { x, y: y + h },
        { x: x + d, y: y + h / 2 },
      ];
    case 'pentagon':
      return [
        { x, y },
        { x: x + w - d, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w - d, y: y + h },
        { x, y: y + h },
      ];
    case 'diamond':
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
      ];
    case 'triangle':
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    case 'hexagon': {
      // Points left and right, like PowerPoint's preset.
      const k = Math.min(w / 2, h * 0.29);
      return [
        { x: x + k, y },
        { x: x + w - k, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w - k, y: y + h },
        { x: x + k, y: y + h },
        { x, y: y + h / 2 },
      ];
    }
    default:
      return null;
  }
}

/** SVG path data for any shape outline. */
export function shapePath(s: Pick<ShapeEl, 'shape' | 'x' | 'y' | 'w' | 'h' | 'radius' | 'depth'>): string {
  const { x, y, w, h } = s;
  const r = s.radius ?? 0;
  switch (s.shape) {
    case 'rect':
      return rectPath(x, y, w, h, r);
    case 'pill':
      return rectPath(x, y, w, h, h / 2);
    case 'chevron':
    case 'pentagon':
    case 'diamond':
    case 'triangle':
    case 'hexagon':
      return polygonPath(shapePoints(s.shape, x, y, w, h, s.depth)!);
    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      return (
        `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 1 1 ${n(x + w)} ${n(y + ry)}` +
        `A${n(rx)} ${n(ry)} 0 1 1 ${n(x)} ${n(y + ry)}Z`
      );
    }
    case 'document': {
      const wave = Math.min(10, h * 0.16);
      return (
        `M${n(x + r)} ${n(y)}H${n(x + w - r)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}` +
        `V${n(y + h - wave)}C${n(x + w * 0.75)} ${n(y + h - wave * 2.2)} ${n(x + w * 0.5)} ${n(y + h + wave * 0.6)} ` +
        `${n(x + w * 0.25)} ${n(y + h - wave * 0.4)}Q${n(x + w * 0.1)} ${n(y + h - wave * 1.2)} ${n(x)} ${n(y + h - wave)}` +
        `V${n(y + r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Z`
      );
    }
    case 'cylinder': {
      const ry = Math.min(8, h * 0.12);
      return (
        `M${n(x)} ${n(y + ry)}A${n(w / 2)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}V${n(y + h - ry)}` +
        `A${n(w / 2)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + h - ry)}Z` +
        `M${n(x)} ${n(y + ry)}A${n(w / 2)} ${n(ry)} 0 0 0 ${n(x + w)} ${n(y + ry)}`
      );
    }
    case 'delay': {
      const rr = Math.min(h / 2, w / 3);
      return (
        `M${n(x)} ${n(y)}H${n(x + w - rr)}A${n(rr)} ${n(h / 2)} 0 0 1 ${n(x + w - rr)} ${n(y + h)}` +
        `H${n(x)}Z`
      );
    }
    case 'predefined': {
      const bar = Math.min(10, w * 0.08);
      return (
        rectPath(x, y, w, h, Math.min(r, 2)) +
        `M${n(x + bar)} ${n(y)}V${n(y + h)}M${n(x + w - bar)} ${n(y)}V${n(y + h)}`
      );
    }
  }
}

/** Default text-area insets for a shape kind (before padding). */
export function shapeTextInsets(kind: ShapeKind, w: number, h: number, depth: number, pad: number): Insets {
  switch (kind) {
    case 'chevron':
      return { l: depth + pad * 0.75, r: depth + pad * 0.5, t: pad * 0.75, b: pad * 0.75 };
    case 'pentagon':
      return { l: pad, r: depth + pad * 0.5, t: pad * 0.75, b: pad * 0.75 };
    case 'diamond':
      // Inscribed text rectangle: 62% of the width by 38% of the height.
      return { l: w * 0.19, r: w * 0.19, t: h * 0.31, b: h * 0.31 };
    case 'ellipse':
      return { l: w * 0.16, r: w * 0.16, t: h * 0.16, b: h * 0.16 };
    case 'triangle':
      return { l: w * 0.25, r: w * 0.25, t: h * 0.4, b: h * 0.05 };
    case 'hexagon':
      return { l: Math.min(w / 2, h * 0.29), r: Math.min(w / 2, h * 0.29), t: pad / 2, b: pad / 2 };
    case 'pill':
      return { l: Math.min(h / 2, pad + 4), r: Math.min(h / 2, pad + 4), t: pad / 2, b: pad / 2 };
    case 'document':
      return { l: pad, r: pad, t: pad * 0.75, b: pad * 0.75 + Math.min(10, h * 0.16) };
    case 'cylinder':
      return { l: pad, r: pad, t: pad * 0.75 + Math.min(8, h * 0.12), b: pad * 0.75 };
    case 'delay':
      return { l: pad, r: Math.min(h / 2, w / 3) * 0.6 + pad / 2, t: pad * 0.75, b: pad * 0.75 };
    case 'predefined':
      return { l: pad * 0.5 + Math.min(10, w * 0.08), r: pad * 0.5 + Math.min(10, w * 0.08), t: pad * 0.75, b: pad * 0.75 };
    default:
      return { l: pad, r: pad, t: pad * 0.75, b: pad * 0.75 };
  }
}

export function innerBox(s: ShapeEl): Box {
  const i = s.inset ?? { l: 0, r: 0, t: 0, b: 0 };
  return { x: s.x + i.l, y: s.y + i.t, w: s.w - i.l - i.r, h: s.h - i.t - i.b };
}

export function boundsOf(s: ShapeEl): Box {
  return s.hitbox ?? { x: s.x, y: s.y, w: s.w, h: s.h };
}

export function intersects(a: Box, b: Box, tol = 0): boolean {
  return a.x < b.x + b.w - tol && b.x < a.x + a.w - tol && a.y < b.y + b.h - tol && b.y < a.y + a.h - tol;
}

export function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function contains(outer: Box, inner: Box, tol = 0.5): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  );
}

export function inflate(b: Box, d: number): Box {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

export function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Does the axis-aligned segment a-b pass through the interior of box? */
export function segmentHitsBox(a: Point, b: Point, box: Box, tol = 0.5): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  if (a.x !== b.x && a.y !== b.y) {
    // Diagonal: sample.
    for (let t = 0; t <= 1; t += 0.02) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (p.x > box.x + tol && p.x < box.x + box.w - tol && p.y > box.y + tol && p.y < box.y + box.h - tol) return true;
    }
    return false;
  }
  return x1 > box.x + tol && x0 < box.x + box.w - tol && y1 > box.y + tol && y0 < box.y + box.h - tol;
}

/** Proper intersection of two orthogonal segments (shared endpoints excluded). */
export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const aH = a1.y === a2.y;
  const bH = b1.y === b2.y;
  if (aH === bH) return false;
  const [h1, h2, v1, v2] = aH ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
  const hx0 = Math.min(h1.x, h2.x);
  const hx1 = Math.max(h1.x, h2.x);
  const vy0 = Math.min(v1.y, v2.y);
  const vy1 = Math.max(v1.y, v2.y);
  const x = v1.x;
  const y = h1.y;
  return x > hx0 + 0.5 && x < hx1 - 0.5 && y > vy0 + 0.5 && y < vy1 - 0.5;
}
