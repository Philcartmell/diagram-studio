/**
 * draw.io / diagrams.net export as uncompressed mxGraph XML. Lanes become
 * swimlane containers holding their steps, bands become containers, node text
 * becomes editable HTML labels and connectors are orthogonal edges attached
 * to their shapes, keeping our waypoints.
 */
import { iconPaths } from '../render/icons.js';
import { iconSvgAt } from '../azure/icons.js';
import { GENERATOR } from '../render/svg.js';
import type { Box, ConnectorEl, LineEl, Point, Scene, ShapeEl, TextEl } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import { escapeXml, fmt } from '../util.js';
import { textBlocks } from './text-blocks.js';

interface Cell {
  id: string;
  parent: string;
  value: string;
  style: string;
  vertex?: boolean;
  edge?: boolean;
  source?: string;
  target?: string;
  geo: string;
}

function styleStr(s: Record<string, string | number | undefined>): string {
  return Object.entries(s)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (v === '' ? k : `${k}=${v}`))
    .join(';') + ';';
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML label for a block of texts (one div per text element). */
function htmlOf(texts: TextEl[], base: TextEl): string {
  return texts
    .map((t) => {
      const css: string[] = [];
      if (t.size !== base.size) css.push(`font-size:${fmt(t.size)}px`);
      if (t.color !== base.color) css.push(`color:${t.color}`);
      if ((t.weight >= 600) !== (base.weight >= 600)) css.push(`font-weight:${t.weight >= 600 ? 'bold' : 'normal'}`);
      const body = t.lines.map(htmlEscape).join('<br>');
      const content = t.slot === 'item' ? `• ${body}` : body;
      return css.length ? `<div style="${css.join(';')}">${content}</div>` : `<div>${content}</div>`;
    })
    .join('');
}

function shapeStyle(s: ShapeEl): Record<string, string | number | undefined> {
  const r = s.radius ?? 0;
  switch (s.shape) {
    case 'rect':
      return r > 0 ? { rounded: 1, absoluteArcSize: 1, arcSize: r * 2 } : { rounded: 0 };
    case 'pill':
      return { rounded: 1, arcSize: 50 };
    case 'ellipse':
      return { ellipse: '' };
    case 'diamond':
      return { rhombus: '' };
    case 'triangle':
      return { shape: 'triangle', direction: 'north', perimeter: 'trianglePerimeter' };
    case 'chevron':
    case 'pentagon':
      return { shape: 'step', perimeter: 'stepPerimeter', fixedSize: 1, size: s.depth ?? 18 };
    case 'document':
      return { shape: 'document', boundedLbl: 1, size: 0.15 };
    case 'cylinder':
      return { shape: 'cylinder3', boundedLbl: 1, backgroundOutline: 1, size: 8 };
    case 'delay':
      return { shape: 'delay' };
    case 'predefined':
      return { shape: 'process', backgroundOutline: 1, size: 0.08 };
  }
}

function dashStyle(dash?: string): Record<string, string | number | undefined> {
  if (dash === 'dashed') return { dashed: 1, dashPattern: '6 4' };
  if (dash === 'dotted') return { dashed: 1, dashPattern: '1 3' };
  return {};
}

function pathMid(points: Point[]): Point {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  let half = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (half <= len) {
      const t = len ? half / len : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    half -= len;
  }
  return points[0];
}

export function renderDrawio(scene: Scene, theme: Theme, fonts: FontSet): string {
  const els = scene.elements;
  const family = theme.font.officeFamily ?? theme.font.family;
  const shapes = new Map(els.filter((e): e is ShapeEl => e.kind === 'shape').map((s) => [s.id, s]));
  const cells: Cell[] = [];
  const cellId = new Map<string, string>();
  const origin = new Map<string, Point>();
  const used = new Set<string>(['0', '1']);
  const uid = (base: string) => {
    let id = base.replace(/[^A-Za-z0-9_-]/g, '_');
    let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    return id;
  };

  // Lane headers are drawn by the swimlane container itself.
  const isLane = (s?: ShapeEl) => !!s && s.role === 'lane' && s.container;
  const laneHeader = (s: ShapeEl) => s.role === 'header' && !!s.parent && isLane(shapes.get(s.parent));
  const isContainer = (s: ShapeEl) => s.container;
  const textsByBox = new Map<string, TextEl[]>();
  for (const e of els) {
    if (e.kind !== 'text' || !e.box) continue;
    const owner = shapes.get(e.box);
    const key = owner && laneHeader(owner) ? owner.parent! : e.box;
    textsByBox.set(key, [...(textsByBox.get(key) ?? []), e]);
  }

  const within = (b: Box, o: Box) => b.x >= o.x - 0.5 && b.y >= o.y - 0.5 && b.x + b.w <= o.x + o.w + 0.5 && b.y + b.h <= o.y + o.h + 0.5;
  const parentOf = (s: { parent?: string; group?: string }, self?: string, box?: Box): { id: string; at: Point; box?: Box } => {
    let p = s.parent;
    // Badges, tags and icons ride on their node when they lie inside it.
    if (!p && s.group?.startsWith('g-')) {
      const owner = s.group.slice(2);
      const o = shapes.get(owner);
      if (owner !== self && cellId.has(owner) && o && box && within(box, o)) p = owner;
    }
    // Nest only inside real containers (lanes, bands, quadrants) or the node a badge rides on.
    const ok = p && cellId.has(p) && (p !== s.parent || shapes.get(p)?.container);
    if (ok) return { id: cellId.get(p!)!, at: origin.get(p!)!, box: shapes.get(p!) };
    return { id: '1', at: { x: 0, y: 0 } };
  };

  const geo = (b: Box, at: Point) =>
    `<mxGeometry x="${fmt(b.x - at.x)}" y="${fmt(b.y - at.y)}" width="${fmt(b.w)}" height="${fmt(b.h)}" as="geometry"/>`;

  const textCell = (texts: TextEl[], parent: { id: string; at: Point; box?: Box }, idBase: string) => {
    const widthOf = (t: TextEl) => fonts.blockWidth(t.lines, t.size, t.weight);
    const boxes = texts.map((t) => {
      const w = widthOf(t);
      const x = t.anchor === 'start' ? t.x : t.anchor === 'middle' ? t.x - w / 2 : t.x - w;
      return { x, y: t.y, w, h: t.lines.length * t.lineHeight };
    });
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    // Slack absorbs draw.io's own text metrics, but never pushes the cell outside its container.
    const room = parent.box ? Math.max(0, parent.box.x + parent.box.w - x1) + Math.max(0, x0 - parent.box.x) : Infinity;
    const slack = Math.min(Math.max(8, (x1 - x0) * 0.12), room);
    const anchor = texts[0].anchor;
    let bx = anchor === 'start' ? x0 : anchor === 'end' ? x0 - slack : x0 - slack / 2;
    if (parent.box) bx = Math.max(parent.box.x, Math.min(bx, parent.box.x + parent.box.w - (x1 - x0 + slack)));
    const t0 = texts[0];
    cells.push({
      id: uid(idBase),
      parent: parent.id,
      value: htmlOf(texts, t0),
      vertex: true,
      style: styleStr({
        text: '',
        html: 1,
        whiteSpace: 'wrap',
        align: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
        verticalAlign: 'top',
        spacing: 0,
        fontFamily: family,
        fontSize: fmt(t0.size),
        fontColor: t0.color,
        fontStyle: t0.weight >= 600 ? 1 : 0,
        strokeColor: 'none',
        fillColor: 'none',
      }),
      geo: geo({ x: bx, y: y0, w: x1 - x0 + slack, h: y1 - y0 }, parent.at),
    });
  };

  for (const e of els) {
    if (e.kind === 'shape') {
      if (laneHeader(e) || /--bullet-\d+$/.test(e.id)) continue;
      const parent = parentOf(e, e.id, e);
      const id = uid(e.id);
      cellId.set(e.id, id);
      origin.set(e.id, { x: e.x, y: e.y });
      const blocks = textBlocks(textsByBox.get(e.id) ?? []);
      const first = blocks[0];
      const t0 = first?.[0];
      const lane = isLane(e);
      const header = lane ? els.find((x): x is ShapeEl => x.kind === 'shape' && x.parent === e.id && x.role === 'header') : undefined;
      const horizontalLane = header ? header.h === e.h : true;
      const align = t0 ? (t0.anchor === 'start' ? 'left' : t0.anchor === 'end' ? 'right' : 'center') : 'center';
      const base: Record<string, string | number | undefined> =
        lane
          ? {
              swimlane: '',
              horizontal: horizontalLane ? 0 : 1,
              startSize: header ? (horizontalLane ? header.w : header.h) : 32,
              fillColor: header?.paint.fill,
              swimlaneFillColor: e.paint.fill,
              collapsible: 0,
            }
          : { ...shapeStyle(e), fillColor: e.paint.fill, container: isContainer(e) ? 1 : undefined, collapsible: isContainer(e) ? 0 : undefined };
      cells.push({
        id,
        parent: parent.id,
        value: first ? htmlOf(first, t0!) : '',
        vertex: true,
        style: styleStr({
          ...base,
          html: 1,
          whiteSpace: 'wrap',
          strokeColor: e.paint.stroke,
          strokeWidth: e.paint.stroke === 'none' ? undefined : fmt(e.paint.strokeWidth),
          ...dashStyle(e.paint.dash),
          fontFamily: family,
          fontSize: t0 ? fmt(t0.size) : undefined,
          fontColor: t0?.color,
          fontStyle: t0 && t0.weight >= 600 ? 1 : 0,
          align: lane ? 'center' : align,
          verticalAlign: lane ? 'middle' : t0 && t0.anchor === 'start' && !e.container ? 'top' : 'middle',
          spacingLeft: align === 'left' && !lane ? fmt(t0!.x - e.x) : undefined,
          spacingTop: align === 'left' && t0 && !e.container ? fmt(Math.max(0, t0.y - e.y)) : undefined,
          spacing: lane ? undefined : 0,
          rotatable: 0,
        }),
        geo: geo(e, parent.at),
      });
      // Side-by-side text blocks become their own text cells inside the shape.
      blocks.slice(1).forEach((b, k) => textCell(b, { id, at: { x: e.x, y: e.y } }, `${e.id}-text-${k + 2}`));
    } else if (e.kind === 'text') {
      if (e.box || (e.role === 'edge-label' && e.free && els.some((c) => c.kind === 'connector' && c.labelId === e.id))) continue;
      const w = fonts.blockWidth(e.lines, e.size, e.weight);
      const tx = e.anchor === 'start' ? e.x : e.anchor === 'middle' ? e.x - w / 2 : e.x - w;
      textCell([e], parentOf(e, undefined, { x: tx, y: e.y, w, h: e.lines.length * e.lineHeight }), e.id);
    } else if (e.kind === 'connector') {
      cells.push(edgeCell(e, cellId, shapes, els, uid, family, fonts));
    } else if (e.kind === 'line') {
      cells.push(lineCell(e as LineEl, uid));
    } else if (e.kind === 'icon' && e.set === 'product') {
      const svg = iconSvgAt(e.name, 64);
      if (!svg) continue;
      const parent = parentOf(e, undefined, { x: e.x, y: e.y, w: e.size, h: e.size });
      cells.push({
        id: uid(e.id),
        parent: parent.id,
        value: '',
        vertex: true,
        style: styleStr({ shape: 'image', html: 1, imageAspect: 1, aspect: 'fixed', image: `data:image/svg+xml,${Buffer.from(svg).toString('base64')}` }),
        geo: geo({ x: e.x, y: e.y, w: e.size, h: e.size }, parent.at),
      });
    } else if (e.kind === 'icon') {
      const paths = iconPaths(e.name);
      if (!paths) continue;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${e.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
      const parent = parentOf(e, undefined, { x: e.x, y: e.y, w: e.size, h: e.size });
      cells.push({
        id: uid(e.id),
        parent: parent.id,
        value: '',
        vertex: true,
        style: styleStr({ shape: 'image', html: 1, imageAspect: 0, aspect: 'fixed', image: `data:image/svg+xml,${Buffer.from(svg).toString('base64')}` }),
        geo: geo({ x: e.x, y: e.y, w: e.size, h: e.size }, parent.at),
      });
    }
  }

  const body = cells
    .map(
      (c) =>
        `<mxCell id="${escapeXml(c.id)}" value="${escapeXml(c.value)}" style="${escapeXml(c.style)}"${c.vertex ? ' vertex="1"' : ''}${c.edge ? ' edge="1"' : ''}${c.source ? ` source="${escapeXml(c.source)}"` : ''}${c.target ? ` target="${escapeXml(c.target)}"` : ''} parent="${escapeXml(c.parent)}">${c.geo}</mxCell>`,
    )
    .join('\n        ');
  return (
    `<mxfile host="diagram-studio" agent="${GENERATOR}" type="device">\n` +
    `  <diagram id="diagram-studio" name="${escapeXml(scene.meta.title.slice(0, 60))}">\n` +
    `    <mxGraphModel dx="${scene.width}" dy="${scene.height}" grid="1" gridSize="8" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${scene.width}" pageHeight="${scene.height}" background="${scene.background}" math="0" shadow="0">\n` +
    `      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        ${body}\n      </root>\n` +
    `    </mxGraphModel>\n  </diagram>\n</mxfile>\n`
  );
}

function edgeCell(
  e: ConnectorEl,
  cellId: Map<string, string>,
  shapes: Map<string, ShapeEl>,
  els: Scene['elements'],
  uid: (b: string) => string,
  family: string,
  fonts: FontSet,
): Cell {
  const src = e.from ? shapes.get(e.from) : undefined;
  const dst = e.to ? shapes.get(e.to) : undefined;
  const p0 = e.points[0];
  const pn = e.points[e.points.length - 1];
  const rel = (s: ShapeEl | undefined, p: Point) => (s ? { x: Math.round(((p.x - s.x) / s.w) * 1000) / 1000, y: Math.round(((p.y - s.y) / s.h) * 1000) / 1000 } : undefined);
  const exit = rel(src, p0);
  const entry = rel(dst, pn);
  const label = e.labelId ? (els.find((x) => x.kind === 'text' && x.id === e.labelId) as TextEl | undefined) : undefined;
  const style = styleStr({
    edgeStyle: 'orthogonalEdgeStyle',
    rounded: 0,
    orthogonalLoop: 1,
    html: 1,
    endArrow: e.arrowEnd ? 'block' : 'none',
    endFill: 1,
    endSize: 6,
    strokeColor: e.paint.stroke,
    strokeWidth: fmt(e.paint.strokeWidth),
    ...dashStyle(e.paint.dash),
    exitX: exit?.x,
    exitY: exit?.y,
    exitDx: 0,
    exitDy: 0,
    entryX: entry?.x,
    entryY: entry?.y,
    entryDx: 0,
    entryDy: 0,
    fontFamily: family,
    fontSize: label ? fmt(label.size) : undefined,
    fontColor: label?.color,
    fontStyle: label && label.weight >= 600 ? 1 : undefined,
    labelBackgroundColor: 'none',
  });
  const way = e.points.slice(1, -1).map((p) => `<mxPoint x="${fmt(p.x)}" y="${fmt(p.y)}"/>`).join('');
  let offset = '';
  if (label) {
    const w = fonts.blockWidth(label.lines, label.size, label.weight);
    const cx = label.x + w / 2;
    const cy = label.y + (label.lines.length * label.lineHeight) / 2;
    const mid = pathMid(e.points);
    offset = `<mxPoint x="${fmt(cx - mid.x)}" y="${fmt(cy - mid.y)}" as="offset"/>`;
  }
  return {
    id: uid(e.id),
    parent: '1',
    value: label ? label.lines.join(' ') : '',
    edge: true,
    style,
    source: src ? cellId.get(src.id) : undefined,
    target: dst ? cellId.get(dst.id) : undefined,
    geo:
      `<mxGeometry relative="1" as="geometry"><mxPoint x="${fmt(p0.x)}" y="${fmt(p0.y)}" as="sourcePoint"/><mxPoint x="${fmt(pn.x)}" y="${fmt(pn.y)}" as="targetPoint"/>` +
      `${way ? `<Array as="points">${way}</Array>` : ''}${offset}</mxGeometry>`,
  };
}

function lineCell(l: LineEl, uid: (b: string) => string): Cell {
  const p0 = l.points[0];
  const pn = l.points[l.points.length - 1];
  const way = l.points.slice(1, -1).map((p) => `<mxPoint x="${fmt(p.x)}" y="${fmt(p.y)}"/>`).join('');
  return {
    id: uid(l.id),
    parent: '1',
    value: '',
    edge: true,
    style: styleStr({
      endArrow: l.arrowEnd ? 'block' : 'none',
      startArrow: l.arrowStart ? 'block' : 'none',
      endFill: 1,
      startFill: 1,
      html: 1,
      rounded: 0,
      strokeColor: l.paint.stroke,
      strokeWidth: fmt(l.paint.strokeWidth),
      ...dashStyle(l.paint.dash),
      editable: 1,
    }),
    geo:
      `<mxGeometry relative="1" as="geometry"><mxPoint x="${fmt(p0.x)}" y="${fmt(p0.y)}" as="sourcePoint"/><mxPoint x="${fmt(pn.x)}" y="${fmt(pn.y)}" as="targetPoint"/>` +
      `${way ? `<Array as="points">${way}</Array>` : ''}</mxGeometry>`,
  };
}
