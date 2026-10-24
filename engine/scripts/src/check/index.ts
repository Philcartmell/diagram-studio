/**
 * Automated QA on the resolved scene graph. Most diagram defects are
 * geometric, so they are caught here before anyone looks at a picture.
 * Every issue names an element and suggests a spec-level fix.
 */
import { boundsOf, contains, innerBox, intersectionArea, intersects, segmentHitsBox, segmentsCross } from '../scene/geometry.js';
import type { Box, ConnectorEl, Scene, SceneElement, ShapeEl, TextEl } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import { contrast } from '../theme/color.js';
import type { Theme } from '../theme/types.js';
import { ALTITUDES } from '../validate/altitude.js';
import type { Issue } from '../validate/messages.js';
import type { Altitude } from '../spec.js';

export interface CheckIssue {
  check: string;
  id?: string;
  message: string;
  hint?: string;
}

export interface CheckResult {
  errors: CheckIssue[];
  warnings: CheckIssue[];
}

export interface CheckOptions {
  theme: Theme;
  fonts: FontSet;
  altitude: Altitude;
  layoutIssues?: Issue[];
}

const TOL = 0.75;

function specId(id: string): string {
  return id.split('--')[0];
}

function textBounds(t: TextEl, fonts: FontSet): Box {
  const w = fonts.blockWidth(t.lines, t.size, t.weight) + (t.letterSpacing ?? 0) * Math.max(0, Math.max(...t.lines.map((l) => [...l].length)) - 1);
  const h = t.lines.length * t.lineHeight;
  const x = t.anchor === 'start' ? t.x : t.anchor === 'middle' ? t.x - w / 2 : t.x - w;
  return { x, y: t.y, w, h };
}

function quote(t: TextEl): string {
  const s = t.lines.join(' ');
  return s.length > 40 ? `"${s.slice(0, 38)}…"` : `"${s}"`;
}

function fullBox(s: ShapeEl): Box {
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

export function runChecks(scene: Scene, o: CheckOptions): CheckResult {
  const errors: CheckIssue[] = [];
  const warnings: CheckIssue[] = [];
  const els = scene.elements;
  const shapes = els.filter((e): e is ShapeEl => e.kind === 'shape');
  const texts = els.filter((e): e is TextEl => e.kind === 'text');
  const connectors = els.filter((e): e is ConnectorEl => e.kind === 'connector');
  const shapeById = new Map(shapes.map((s) => [s.id, s]));
  const tb = new Map(texts.map((t) => [t.id, textBounds(t, o.fonts)]));
  const rules = ALTITUDES[o.altitude];

  for (const li of o.layoutIssues ?? []) {
    errors.push({ check: 'canvas-fit', id: li.id, message: li.message, hint: 'Edit the spec to reduce or shorten content; never edit the SVG.' });
  }

  // Text overflow.
  for (const t of texts) {
    if (!t.box) continue;
    const s = shapeById.get(t.box);
    if (!s) continue;
    const inner = innerBox(s);
    const b = tb.get(t.id)!;
    const over = Math.max(inner.x - b.x, b.x + b.w - (inner.x + inner.w), inner.y - b.y, b.y + b.h - (inner.y + inner.h));
    if (over > TOL) {
      errors.push({
        check: 'text-overflow',
        id: specId(t.box),
        message: `Text ${quote(t)} overflows "${specId(t.box)}" by ${Math.ceil(over)} units.`,
        hint: 'Shorten the label or description, or move detail to notes. The box is already at its maximum size for this canvas.',
      });
    }
  }

  // Overlap.
  const boxes = shapes.filter((s) => s.box);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (intersectionArea(boundsOf(a), boundsOf(b)) <= 0.5) continue;
      if (contains(fullBox(a), fullBox(b)) || contains(fullBox(b), fullBox(a))) continue;
      errors.push({
        check: 'overlap',
        id: specId(a.id),
        message: `"${specId(a.id)}" overlaps "${specId(b.id)}".`,
        hint: 'Reduce the number of items in that row or shorten labels so the layout has room.',
      });
    }
  }

  // Orthogonal routing only.
  for (const c of connectors) {
    for (let k = 1; k < c.points.length; k++) {
      const a = c.points[k - 1];
      const b = c.points[k];
      if (a.x !== b.x && a.y !== b.y) {
        errors.push({ check: 'connector-orthogonal', id: c.id, message: `Connector ${c.from} → ${c.to} has a diagonal segment.`, hint: 'This is a renderer defect; report it with the spec.' });
        break;
      }
    }
  }

  // Connectors crossing boxes.
  const obstacles = shapes.filter((s) => s.obstacle);
  for (const c of connectors) {
    for (let k = 1; k < c.points.length; k++) {
      const a = c.points[k - 1];
      const b = c.points[k];
      for (const s of obstacles) {
        const own = s.id === c.from || s.id === c.to;
        if (own && (k === 1 || k === c.points.length - 1)) continue;
        if (segmentHitsBox(a, b, fullBox(s))) {
          errors.push({
            check: 'connector-crosses-box',
            id: c.id,
            message: `Connector ${c.from} → ${c.to} passes through "${specId(s.id)}".`,
            hint: 'Move one of the steps to another phase or lane, or split the diagram.',
          });
          break;
        }
      }
    }
  }

  // Free label collisions.
  const lineEls = els.filter((e) => e.kind === 'connector' || e.kind === 'line') as (ConnectorEl | { points: { x: number; y: number }[] })[];
  const segs = lineEls.flatMap((c) => c.points.slice(1).map((p, k) => [c.points[k], p] as const));
  for (const t of texts.filter((x) => x.free)) {
    const b = tb.get(t.id)!;
    const hitBox = shapes.find((s) => s.box && !s.container && intersectionArea(b, boundsOf(s)) > 0.25);
    const hitText = texts.find((x) => x.id !== t.id && intersectionArea(b, tb.get(x.id)!) > 0.25);
    const hitLine = segs.find(([p, q]) => {
      const x0 = Math.min(p.x, q.x);
      const x1 = Math.max(p.x, q.x);
      const y0 = Math.min(p.y, q.y);
      const y1 = Math.max(p.y, q.y);
      return x1 > b.x + 0.25 && x0 < b.x + b.w - 0.25 && y1 > b.y + 0.25 && y0 < b.y + b.h - 0.25;
    });
    const what = hitBox ? `box "${specId(hitBox.id)}"` : hitText ? `text "${specId(hitText.id)}"` : hitLine ? 'a line' : '';
    if (what) {
      errors.push({
        check: 'label-collision',
        id: specId(t.id),
        message: `Label ${quote(t)} collides with ${what}.`,
        hint: 'Shorten the label, or reposition the item (x/y) so labels have room.',
      });
    }
  }

  // Off-canvas.
  const m = scene.margin - TOL;
  const inside = (b: Box) => b.x >= m && b.y >= m && b.x + b.w <= scene.width - m && b.y + b.h <= scene.height - m;
  for (const e of els) {
    let b: Box | undefined;
    if (e.kind === 'shape') b = fullBox(e);
    else if (e.kind === 'text') b = tb.get(e.id);
    else if (e.kind === 'connector' || e.kind === 'line') {
      const xs = e.points.map((p) => p.x);
      const ys = e.points.map((p) => p.y);
      b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    } else if (e.kind === 'icon') b = { x: e.x, y: e.y, w: e.size, h: e.size };
    if (b && !inside(b)) {
      errors.push({
        check: 'off-canvas',
        id: specId(e.id),
        message: `"${specId(e.id)}" extends outside the canvas margin.`,
        hint: 'Reduce content, or set "canvas": { "aspect": "auto" } so the canvas grows.',
      });
    }
  }

  // Minimum text size.
  for (const t of texts) {
    if (t.size < o.theme.font.size.caption - 0.01) {
      errors.push({ check: 'min-text-size', id: specId(t.id), message: `Text ${quote(t)} is ${t.size} units, below the ${o.theme.font.size.caption} minimum.` });
    }
  }

  // Contrast against whatever is drawn underneath.
  for (let i = 0; i < els.length; i++) {
    const t = els[i];
    if (t.kind !== 'text') continue;
    const b = tb.get(t.id)!;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let bg = scene.background;
    for (let j = i - 1; j >= 0; j--) {
      const s = els[j] as SceneElement;
      if (s.kind !== 'shape' || s.paint.fill === 'none') continue;
      if (cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h) {
        bg = s.paint.fill;
        break;
      }
    }
    const r = contrast(t.color, bg);
    if (r < 4.5) {
      errors.push({
        check: 'contrast',
        id: specId(t.id),
        message: `Text ${quote(t)} has contrast ${r}:1 on its background (needs 4.5:1).`,
        hint: 'Use a different emphasis, or fix the theme colours (run `theme validate`).',
      });
    }
  }

  // Accent count.
  const accented = new Set(shapes.filter((s) => s.meta?.emphasis === 'accent' && s.meta.specId).map((s) => s.meta!.specId!));
  if (accented.size > rules.accentMax) {
    warnings.push({
      check: 'accent-count',
      message: `${accented.size} elements are accented (${[...accented].join(', ')}); ${o.altitude} diagrams should accent at most ${rules.accentMax}.`,
      hint: 'Keep "accent" for the one thing to look at; use "highlight" for secondary emphasis.',
    });
  }

  // Density.
  if (scene.meta.nodeCount > rules.maxNodes) {
    warnings.push({ check: 'density', message: `${scene.meta.nodeCount} nodes exceed the ${o.altitude} limit of ${rules.maxNodes}.`, hint: 'Group nodes or raise the altitude.' });
  }
  const ws = whitespace(scene, shapes, [...tb.values()]);
  if (ws < 0.25) {
    warnings.push({
      check: 'density',
      message: `Only ${Math.round(ws * 100)}% of the canvas is whitespace (aim for at least 25%).`,
      hint: 'Remove or group nodes, shorten descriptions, or raise the altitude.',
    });
  }

  // Edge crossings.
  let crossings = 0;
  for (let i = 0; i < connectors.length; i++) {
    for (let j = i + 1; j < connectors.length; j++) {
      const a = connectors[i].points;
      const b = connectors[j].points;
      for (let p = 1; p < a.length; p++) for (let q = 1; q < b.length; q++) if (segmentsCross(a[p - 1], a[p], b[q - 1], b[q])) crossings++;
    }
  }
  if (crossings > 2) {
    warnings.push({
      check: 'edge-crossings',
      message: `${crossings} connector crossings (aim for 2 or fewer).`,
      hint: 'Reorder lanes so connected steps sit in adjacent lanes, or move steps between phases.',
    });
  }

  // Alignment of siblings.
  const groups = new Map<string, ShapeEl[]>();
  for (const s of shapes) if (s.align) groups.set(s.align.group, [...(groups.get(s.align.group) ?? []), s]);
  for (const [g, list] of groups) {
    if (list.length < 2) continue;
    const axis = list[0].align!.axis;
    const centres = list.map((s) => (axis === 'row' ? s.y + s.h / 2 : s.x + s.w / 2));
    const spread = Math.max(...centres) - Math.min(...centres);
    if (spread > 1) {
      warnings.push({
        check: 'alignment',
        id: g,
        message: `Siblings in "${g}" are misaligned by ${Math.round(spread)} units (${list.map((s) => specId(s.id)).join(', ')}).`,
      });
    }
  }

  // After a canvas-fit failure, overlap and off-canvas errors are usually knock-on effects.
  if (errors.some((e) => e.check === 'canvas-fit')) {
    for (const e of errors) if (e.check === 'overlap' || e.check === 'off-canvas') e.hint = 'Probably a knock-on effect of the canvas-fit error; fix that first.';
  }
  for (const e of [...errors, ...warnings]) e.message = e.message.replace(/"ds-callout"/g, 'the callout').replace(/"ds-legend[^"]*"/g, 'the legend').replace(/"ds-(title|subtitle|footer)"/g, 'the $1');
  return { errors: dedupe(errors), warnings: dedupe(warnings) };
}

function dedupe(list: CheckIssue[]): CheckIssue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.check}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Share of the area inside the margins not covered by boxes or text. */
function whitespace(scene: Scene, shapes: ShapeEl[], textBoxes: Box[]): number {
  const cell = 4;
  const m = scene.margin;
  const cols = Math.ceil((scene.width - 2 * m) / cell);
  const rows = Math.ceil((scene.height - 2 * m) / cell);
  const grid = new Uint8Array(cols * rows);
  const mark = (b: Box) => {
    const c0 = Math.max(0, Math.floor((b.x - m) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((b.x + b.w - m) / cell) - 1);
    const r0 = Math.max(0, Math.floor((b.y - m) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((b.y + b.h - m) / cell) - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * cols + c] = 1;
  };
  for (const s of shapes) if (s.box && !s.container && s.role !== 'header' && s.role !== 'phase') mark(boundsOf(s));
  for (const b of textBoxes) mark(b);
  let covered = 0;
  for (const v of grid) covered += v;
  return 1 - covered / grid.length;
}

export function intersectsAny(b: Box, list: Box[]): boolean {
  return list.some((x) => intersects(b, x));
}
