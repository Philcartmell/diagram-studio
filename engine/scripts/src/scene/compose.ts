/**
 * Scene composition: place one laid-out scene inside another. Every element is
 * scaled about the origin, moved into place and given an id prefix, so two
 * panels may both hold an "apim" node. Composition works on the scene graph,
 * not on SVG, so a composed slide stays editable in PowerPoint and draw.io.
 */
import type { Box, Insets, Point, SceneElement } from './types.js';

export interface Placement {
  dx: number;
  dy: number;
  /** Uniform scale (1 = as laid out). */
  s: number;
  /** Prefix for every id and id reference, e.g. "p1_". */
  prefix: string;
}

export function placeElements(els: SceneElement[], t: Placement): SceneElement[] {
  const { dx, dy, s, prefix } = t;
  const X = (v: number) => dx + v * s;
  const Y = (v: number) => dy + v * s;
  const L = (v: number) => v * s;
  const id = (v: string) => prefix + v;
  const ref = (v: string | undefined) => (v === undefined ? undefined : prefix + v);
  // Group keys "g-<element id>" name the element a badge or label rides on; keep that link.
  const grp = (v: string | undefined) => (v === undefined ? undefined : v.startsWith('g-') ? `g-${prefix}${v.slice(2)}` : prefix + v);
  const pt = (p: Point): Point => ({ x: X(p.x), y: Y(p.y) });
  const box = (b: Box): Box => ({ x: X(b.x), y: Y(b.y), w: L(b.w), h: L(b.h) });
  const ins = (i: Insets): Insets => ({ l: L(i.l), r: L(i.r), t: L(i.t), b: L(i.b) });
  return els.map((e): SceneElement => {
    switch (e.kind) {
      case 'shape':
        return {
          ...e,
          id: id(e.id),
          x: X(e.x),
          y: Y(e.y),
          w: L(e.w),
          h: L(e.h),
          radius: e.radius === undefined ? undefined : L(e.radius),
          depth: e.depth === undefined ? undefined : L(e.depth),
          paint: { ...e.paint, strokeWidth: L(e.paint.strokeWidth) },
          inset: e.inset && ins(e.inset),
          hitbox: e.hitbox && box(e.hitbox),
          align: e.align && { ...e.align, group: prefix + e.align.group },
          group: grp(e.group),
          parent: ref(e.parent),
          meta: e.meta && { ...e.meta, specId: ref(e.meta.specId) },
        };
      case 'text':
        return {
          ...e,
          id: id(e.id),
          x: X(e.x),
          y: Y(e.y),
          w: L(e.w),
          size: L(e.size),
          lineHeight: L(e.lineHeight),
          letterSpacing: e.letterSpacing === undefined ? undefined : L(e.letterSpacing),
          box: ref(e.box),
          group: grp(e.group),
        };
      case 'connector':
        return {
          ...e,
          id: id(e.id),
          points: e.points.map(pt),
          paint: { ...e.paint, strokeWidth: L(e.paint.strokeWidth) },
          from: ref(e.from),
          to: ref(e.to),
          labelId: ref(e.labelId),
        };
      case 'line':
        return { ...e, id: id(e.id), points: e.points.map(pt), paint: { ...e.paint, strokeWidth: L(e.paint.strokeWidth) }, group: grp(e.group) };
      case 'icon':
        return { ...e, id: id(e.id), x: X(e.x), y: Y(e.y), size: L(e.size), group: grp(e.group) };
      case 'grid':
        return { ...e, id: id(e.id), x: X(e.x), y: Y(e.y), w: L(e.w), h: L(e.h), spacing: L(e.spacing) };
    }
  });
}
