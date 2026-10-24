/** Placement of free labels (edge labels, plot labels) beside lines, never on them. */
import { inflate, intersects } from '../scene/geometry.js';
import type { Box, Point, SceneElement, ShapeEl, TextEl } from '../scene/types.js';
import { contains } from '../scene/geometry.js';

export type Segment = [Point, Point];

export function textBox(t: TextEl, widthOf: (t: TextEl) => number): Box {
  const w = widthOf(t);
  const h = t.lines.length * t.lineHeight;
  const x = t.anchor === 'start' ? t.x : t.anchor === 'middle' ? t.x - w / 2 : t.x - w;
  return { x, y: t.y, w, h };
}

export function segmentsOf(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) out.push([points[i - 1], points[i]]);
  return out;
}

export function segmentBox([a, b]: Segment): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export interface Obstacles {
  boxes: Box[];
  texts: Box[];
  segments: Segment[];
  bounds: Box;
}

export function collectObstacles(els: SceneElement[], widthOf: (t: TextEl) => number, bounds: Box): Obstacles {
  const boxes: Box[] = [];
  const texts: Box[] = [];
  const segments: Segment[] = [];
  for (const e of els) {
    if (e.kind === 'shape' && !(e as ShapeEl).container && (e as ShapeEl).box) boxes.push(e as ShapeEl);
    else if (e.kind === 'text') texts.push(textBox(e, widthOf));
    else if (e.kind === 'connector' || (e.kind === 'line' && e.role !== 'background')) segments.push(...segmentsOf(e.points));
  }
  return { boxes, texts, segments, bounds };
}

export function isFree(b: Box, o: Obstacles, pad = 2): boolean {
  if (!contains(o.bounds, b, 0)) return false;
  const bb = inflate(b, pad);
  if (o.boxes.some((x) => intersects(bb, x))) return false;
  if (o.texts.some((x) => intersects(bb, x))) return false;
  const segPad = inflate(b, 1);
  return !o.segments.some((s) => intersects(segPad, segmentBox(s), -0.01) || touchesSegment(segPad, s));
}

function touchesSegment(b: Box, [p, q]: Segment): boolean {
  const x0 = Math.min(p.x, q.x);
  const x1 = Math.max(p.x, q.x);
  const y0 = Math.min(p.y, q.y);
  const y1 = Math.max(p.y, q.y);
  return x1 >= b.x && x0 <= b.x + b.w && y1 >= b.y && y0 <= b.y + b.h;
}

/**
 * Candidate positions beside a route, nearest the source first. Returns the
 * top-left of the first free spot, or undefined.
 */
export function placeAlongRoute(points: Point[], w: number, h: number, o: Obstacles, gap = 4): Box | undefined {
  const segs = segmentsOf(points);
  const candidates: Box[] = [];
  segs.forEach(([a, b], si) => {
    const horizontal = a.y === b.y;
    const len = Math.abs(horizontal ? b.x - a.x : b.y - a.y);
    const need = (horizontal ? w : h) + 8;
    if (len < need && segs.length > 1) return;
    const dir = Math.sign(horizontal ? b.x - a.x : b.y - a.y) || 1;
    const fractions = si === 0 ? [0, 0.5, 1] : [0.5, 0, 1, 0.25, 0.75];
    for (const f of fractions) {
      if (horizontal) {
        const usable = Math.max(0, len - need);
        const start = Math.min(a.x, b.x) + 4 + (dir > 0 ? f : 1 - f) * usable;
        candidates.push({ x: start, y: a.y - gap - h, w, h }, { x: start, y: a.y + gap, w, h });
      } else {
        const usable = Math.max(0, len - need);
        const start = Math.min(a.y, b.y) + 4 + (dir > 0 ? f : 1 - f) * usable;
        candidates.push({ x: a.x + gap + 2, y: start, w, h }, { x: a.x - gap - 2 - w, y: start, w, h });
      }
    }
  });
  return candidates.find((c) => isFree(c, o));
}
