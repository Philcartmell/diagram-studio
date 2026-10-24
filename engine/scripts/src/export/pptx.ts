/**
 * Editable PowerPoint export. Every node becomes a native shape plus a text
 * box, grouped so it moves as one; connectors become elbow connectors glued
 * to their shapes where the route allows (else freeform lines). The title
 * goes in the slide's title placeholder and the subtitle in the notes.
 */
import { Resvg } from '@resvg/resvg-js';
import JSZip from 'jszip';
import PptxModule from 'pptxgenjs';
import { iconPaths } from '../render/icons.js';
import type { Box, ConnectorEl, LineEl, Point, Scene, SceneElement, ShapeEl, Side, TextEl } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import { textBox } from '../layout/labels.js';
import { textBlocks } from './text-blocks.js';
import { iconSvgAt } from '../azure/icons.js';

type Pptx = InstanceType<typeof import('pptxgenjs').default>;
type Slide = ReturnType<Pptx['addSlide']>;
const PptxGenJS = ((PptxModule as unknown as { default?: unknown }).default ?? PptxModule) as new () => Pptx;

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const EMU = 914400;

interface Geo {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Ctx {
  scene: Scene;
  theme: Theme;
  fonts: FontSet;
  S: number;
  ox: number;
  oy: number;
  slide: Slide;
  pptx: Pptx;
  /** name → extra info for post-processing. */
  adj: Map<string, number>;
  edges: Map<string, { c: ConnectorEl }>;
  names: string[];
}

const hex = (c: string) => c.replace('#', '').toUpperCase();
const inX = (c: Ctx, x: number) => c.ox + x * c.S;
const inY = (c: Ctx, y: number) => c.oy + y * c.S;
const inL = (c: Ctx, v: number) => v * c.S;
const pt = (c: Ctx, v: number) => Math.round(v * c.S * 72 * 100) / 100;

function name(c: Ctx, group: string | undefined, id: string): string {
  const n = `ds~${group ?? ''}~${id}`;
  c.names.push(n);
  return n;
}

function line(c: Ctx, stroke: string, sw: number, dash?: string) {
  if (stroke === 'none' || sw <= 0) return { type: 'none' as const };
  return {
    color: hex(stroke),
    width: pt(c, sw),
    dashType: dash === 'dashed' ? ('dash' as const) : dash === 'dotted' ? ('sysDot' as const) : ('solid' as const),
  };
}

function fill(fillColor: string) {
  return fillColor === 'none' ? { type: 'none' as const } : { color: hex(fillColor) };
}

const PRESET: Record<string, string> = {
  rect: 'rect',
  pill: 'roundRect',
  ellipse: 'ellipse',
  diamond: 'diamond',
  triangle: 'triangle',
  chevron: 'chevron',
  pentagon: 'homePlate',
  document: 'flowChartDocument',
  cylinder: 'can',
  delay: 'flowChartDelay',
  predefined: 'flowChartPredefinedProcess',
};

function addShape(c: Ctx, s: ShapeEl) {
  let prst = PRESET[s.shape];
  let rectRadius: number | undefined;
  if (s.shape === 'rect' && (s.radius ?? 0) > 0) {
    prst = 'roundRect';
    rectRadius = inL(c, s.radius!);
  }
  if (s.shape === 'pill') rectRadius = inL(c, s.h / 2);
  const n = name(c, s.group, s.id);
  if ((s.shape === 'chevron' || s.shape === 'pentagon') && s.depth) c.adj.set(n, Math.round((s.depth / Math.min(s.w, s.h)) * 100000));
  c.slide.addShape(prst as never, {
    x: inX(c, s.x),
    y: inY(c, s.y),
    w: inL(c, s.w),
    h: inL(c, s.h),
    rectRadius,
    fill: fill(s.paint.fill),
    line: line(c, s.paint.stroke, s.paint.stroke === 'none' ? 0 : s.paint.strokeWidth, s.paint.dash),
    objectName: n,
  } as never);
}

/** One editable text box for a block of text inside a shape (or a standalone text). */
function addTextBox(c: Ctx, texts: TextEl[], shape: ShapeEl | undefined, group?: string) {
  const widthOf = (t: TextEl) => c.fonts.blockWidth(t.lines, t.size, t.weight);
  const boxes = texts.map((t) => textBox(t, widthOf));
  const u: Box = {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    w: Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)),
    h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)),
  };
  const anchor = texts[0].anchor;
  // Line breaks are carried over as soft breaks so PowerPoint wraps exactly
  // like the SVG; the box gets slack so substitute fonts never re-wrap.
  let g: Geo;
  if (shape && shape.inset && anchor === 'middle') {
    const i = shape.inset;
    const inner = shape.w - i.l - i.r;
    const w = Math.max(inner + 8, u.w * 1.15 + 8);
    g = { x: shape.x + i.l + inner / 2 - w / 2, y: u.y - 2, w, h: u.h + 4 };
  } else {
    const extra = Math.max(12, u.w * 0.15);
    const x = anchor === 'start' ? u.x : anchor === 'end' ? u.x - extra : u.x - extra / 2;
    g = { x: x - 1, y: u.y - 2, w: u.w + extra + 2, h: u.h + 4 };
  }
  const runs = texts.flatMap((t, k) =>
    t.lines.map((lineText, li) => ({
      text: lineText,
      options: {
        fontSize: pt(c, t.size),
        bold: t.weight >= 600,
        color: hex(t.color),
        charSpacing: t.letterSpacing ? pt(c, t.letterSpacing) : undefined,
        softBreakBefore: li > 0,
        breakLine: li === t.lines.length - 1 && k < texts.length - 1,
        lineSpacing: pt(c, t.lineHeight),
        bullet: t.slot === 'item' ? { indent: 10 } : undefined,
      },
    })),
  );
  c.slide.addText(runs as never, {
    x: inX(c, g.x),
    y: inY(c, g.y),
    w: inL(c, g.w),
    h: inL(c, g.h),
    fontFace: c.theme.font.officeFamily ?? c.theme.font.family,
    align: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
    valign: 'top',
    margin: 0,
    wrap: true,
    fit: 'none',
    objectName: name(c, group ?? shape?.group ?? texts[0].group, `${shape?.id ?? texts[0].id}--text`),
  } as never);
}

function addPolyline(c: Ctx, id: string, pts: Point[], stroke: string, sw: number, dash: string | undefined, arrowEnd: boolean, arrowStart: boolean, group?: string) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const kind = c.theme.connector.arrow === 'open' ? 'arrow' : 'triangle';
  c.slide.addShape('custGeom' as never, {
    x: inX(c, x0),
    y: inY(c, y0),
    w: inL(c, Math.max(w, 0.01)),
    h: inL(c, Math.max(h, 0.01)),
    points: pts.map((p) => ({ x: inL(c, p.x - x0), y: inL(c, p.y - y0) })),
    line: { ...line(c, stroke, sw, dash), endArrowType: arrowEnd ? kind : undefined, beginArrowType: arrowStart ? kind : undefined },
    objectName: name(c, group, id),
  } as never);
}

function iconPng(nameStr: string, color: string): string | undefined {
  const paths = iconPaths(nameStr);
  if (!paths) return undefined;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  return 'image/png;base64,' + new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng().toString('base64');
}

export async function renderPptx(scene: Scene, theme: Theme, fonts: FontSet): Promise<{ buffer: Buffer; notes: string[] }> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = scene.meta.title;
  pptx.company = 'diagram-studio';
  const S = Math.min(SLIDE_W / scene.width, SLIDE_H / scene.height);
  const ox = (SLIDE_W - scene.width * S) / 2;
  const oy = (SLIDE_H - scene.height * S) / 2;
  const els = scene.elements;
  const title = els.find((e): e is TextEl => e.kind === 'text' && e.role === 'title');
  const widthOf = (t: TextEl) => fonts.blockWidth(t.lines, t.size, t.weight);
  const tb = title ? textBox(title, widthOf) : undefined;
  pptx.defineSlideMaster({
    title: 'DIAGRAM',
    background: { color: hex(scene.background) },
    objects: tb
      ? [{ placeholder: { options: { name: 'title', type: 'title', x: ox + (tb.x - 2) * S, y: oy + (tb.y - 2) * S, w: (scene.width - 2 * scene.margin + 4) * S, h: (tb.h + 4) * S }, text: '' } }]
      : [],
  } as never);
  const slide = pptx.addSlide({ masterName: 'DIAGRAM' });
  const c: Ctx = { scene, theme, fonts, S, ox, oy, slide, pptx, adj: new Map(), edges: new Map(), names: [] };

  const textsByBox = new Map<string, TextEl[]>();
  for (const e of els) if (e.kind === 'text' && e.box) textsByBox.set(e.box, [...(textsByBox.get(e.box) ?? []), e]);

  for (const e of els as SceneElement[]) {
    switch (e.kind) {
      case 'grid':
        break;
      case 'shape': {
        // Bullet dots become native bullets on the text instead.
        if (/--bullet-\d+$/.test(e.id)) break;
        addShape(c, e);
        for (const block of textBlocks(textsByBox.get(e.id) ?? [])) addTextBox(c, block, e);
        break;
      }
      case 'text': {
        if (e.box) break;
        if (e.role === 'title') {
          slide.addText(e.lines.join(' '), {
            placeholder: 'title',
            fontFace: theme.font.officeFamily ?? theme.font.family,
            fontSize: pt(c, e.size),
            bold: e.weight >= 600,
            color: hex(e.color),
            align: 'left',
            valign: 'top',
            margin: 0,
          } as never);
          break;
        }
        addTextBox(c, [e], undefined, e.group);
        break;
      }
      case 'connector': {
        const n = `ds~~${e.id}`;
        c.edges.set(n, { c: e });
        addPolyline(c, e.id, e.points, e.paint.stroke, e.paint.strokeWidth, e.paint.dash, e.arrowEnd && theme.connector.arrow !== 'none', !!e.arrowStart && theme.connector.arrow !== 'none');
        break;
      }
      case 'line': {
        const l = e as LineEl;
        addPolyline(c, l.id, l.points, l.paint.stroke, l.paint.strokeWidth, l.paint.dash, !!l.arrowEnd, !!l.arrowStart, l.group);
        break;
      }
      case 'icon': {
        if (e.set === 'azure') {
          // Native SVG (PowerPoint 365); the PNG fallback is filled in after writing.
          const svg = iconSvgAt(e.name, 96);
          if (svg) slide.addImage({ data: 'image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), x: inX(c, e.x), y: inY(c, e.y), w: inL(c, e.size), h: inL(c, e.size), altText: e.alt ?? '', objectName: name(c, e.group, e.id) } as never);
          break;
        }
        const data = iconPng(e.name, e.color);
        if (data) slide.addImage({ data, x: inX(c, e.x), y: inY(c, e.y), w: inL(c, e.size), h: inL(c, e.size), objectName: name(c, e.group, e.id) } as never);
        break;
      }
    }
  }
  const notes = [scene.meta.subtitle, scene.meta.notes?.split('\n').filter((l) => l !== scene.meta.subtitle).join('\n')].filter(Boolean).join('\n');
  if (notes) slide.addNotes(notes);

  const raw = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(raw);
  const slidePath = 'ppt/slides/slide1.xml';
  const xml = await zip.file(slidePath)!.async('string');
  zip.file(slidePath, postProcess(xml, c));
  await fixSvgFallbacks(zip);
  // Speaker notes: one paragraph per line (a raw newline would run them together).
  const notesPath = 'ppt/notesSlides/notesSlide1.xml';
  const notesFile = zip.file(notesPath);
  if (notesFile) {
    const nx = await notesFile.async('string');
    zip.file(
      notesPath,
      nx.replace(/<a:p><a:r>(<a:rPr[^>]*\/>)<a:t>([^<]*\n[^<]*)<\/a:t><\/a:r>(<a:endParaRPr[^>]*\/>)?<\/a:p>/, (_m, rpr: string, text: string) =>
        text
          .split('\n')
          .map((t) => `<a:p><a:r>${rpr}<a:t>${t}</a:t></a:r></a:p>`)
          .join(''),
      ),
    );
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const out: string[] = [
    theme.font.officeFamily
      ? `PPTX uses "${theme.font.officeFamily}", which has the same metrics as the theme font "${theme.font.family}", so text wraps exactly as in the SVG.`
      : `PPTX uses the theme font "${theme.font.family}". If it is not installed on the viewer's machine PowerPoint substitutes a default (usually Calibri); the font files are in assets/fonts.`,
  ];
  if (theme.style.renderer === 'sketch') out.push('The sketch style is drawn with clean native shapes in PPTX so every shape stays editable.');
  return { buffer, notes: out };
}

/**
 * pptxgenjs cannot rasterise SVG under Node, so each SVG image's PNG fallback is a
 * broken-image placeholder. Replace them with real renders so PowerPoint versions
 * without SVG support (and thumbnails) still show the icons.
 */
async function fixSvgFallbacks(zip: JSZip) {
  const media = Object.keys(zip.files).filter((f) => /^ppt\/media\/image-\d+-\d+\.svg$/.test(f));
  for (const svgPath of media) {
    const pngPath = svgPath.replace(/-(\d+)\.svg$/, (_m, k: string) => `-${Number(k) - 1}.png`);
    if (!zip.file(pngPath)) continue;
    const svg = await zip.file(svgPath)!.async('string');
    zip.file(pngPath, new Resvg(svg, { fitTo: { mode: 'width', value: 192 }, font: { loadSystemFonts: false } }).render().asPng());
  }
}

// ---- Post-processing: adjust values, real connectors, groups ---------------

interface Part {
  xml: string;
  name: string;
  id: number;
  off?: { x: number; y: number; cx: number; cy: number };
}

const CXN_IDX: Record<Side, number> = { top: 0, left: 1, bottom: 2, right: 3 };

function postProcess(xml: string, c: Ctx): string {
  const start = xml.indexOf('<p:sp>');
  const end = xml.lastIndexOf('</p:spTree>');
  if (start < 0 || end < 0) return xml;
  const head = xml.slice(0, start);
  const body = xml.slice(start, end);
  const tail = xml.slice(end);
  const parts: Part[] = [];
  const re = /<p:(sp|pic)>[\s\S]*?<\/p:\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const x = m[0];
    const nm = /<p:cNvPr id="(\d+)" name="([^"]*)"/.exec(x);
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(x);
    parts.push({
      xml: x,
      id: nm ? Number(nm[1]) : 0,
      name: nm ? nm[2] : '',
      off: off ? { x: Number(off[1]), y: Number(off[2]), cx: Number(off[3]), cy: Number(off[4]) } : undefined,
    });
  }
  let nextId = Math.max(1, ...parts.map((p) => p.id)) + 1;
  const idByElement = new Map<string, number>();
  for (const p of parts) {
    const el = p.name.split('~')[2];
    if (el && !idByElement.has(el)) idByElement.set(el, p.id);
  }
  for (const p of parts) {
    const adj = c.adj.get(p.name);
    if (adj !== undefined) p.xml = p.xml.replace(/<a:avLst>\s*<\/a:avLst>|<a:avLst\/>|<a:avLst><\/a:avLst>/, `<a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst>`);
    const edge = c.edges.get(p.name);
    if (edge) {
      const cx = connectorXml(edge.c, p.id, c, idByElement);
      if (cx) p.xml = cx;
    }
  }
  // Group consecutive parts that share a group key.
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const key = parts[i].name.split('~')[1];
    let j = i + 1;
    if (key) while (j < parts.length && parts[j].name.split('~')[1] === key) j++;
    const run = parts.slice(i, j);
    if (key && run.length > 1 && run.every((p) => p.off)) {
      const x0 = Math.min(...run.map((p) => p.off!.x));
      const y0 = Math.min(...run.map((p) => p.off!.y));
      const x1 = Math.max(...run.map((p) => p.off!.x + p.off!.cx));
      const y1 = Math.max(...run.map((p) => p.off!.y + p.off!.cy));
      const label = key.replace(/^g-/, '');
      out.push(
        `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId++}" name="${label}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr><a:xfrm><a:off x="${x0}" y="${y0}"/><a:ext cx="${x1 - x0}" cy="${y1 - y0}"/><a:chOff x="${x0}" y="${y0}"/><a:chExt cx="${x1 - x0}" cy="${y1 - y0}"/></a:xfrm></p:grpSpPr>` +
          run.map((p) => p.xml).join('') +
          `</p:grpSp>`,
      );
    } else out.push(...run.map((p) => p.xml));
    i = j;
  }
  // Friendly names in the selection pane.
  const result = head + out.join('') + tail;
  return result.replace(/name="ds~[^~"]*~([^"]*)"/g, 'name="$1"');
}

function emu(c: Ctx, v: number, axis: 'x' | 'y' | 'l'): number {
  const inch = axis === 'x' ? inX(c, v) : axis === 'y' ? inY(c, v) : inL(c, v);
  return Math.round(inch * EMU);
}

/**
 * A native connector for orthogonal routes of 1–5 segments (straight or
 * bentConnector2–5). Routes that start vertically use the same preset rotated
 * 90°. Bend positions become adjust values measured from the start along each
 * axis, so U-shaped loops (values beyond 0–100%) work too. Undefined if the
 * route cannot be expressed this way.
 */
function connectorXml(e: ConnectorEl, id: number, c: Ctx, idByElement: Map<string, number>): string | undefined {
  const P = e.points;
  const nseg = P.length - 1;
  if (nseg < 1 || nseg > 5) return undefined;
  const horiz = (a: Point, b: Point) => a.y === b.y && a.x !== b.x;
  for (let k = 1; k < P.length; k++) if (P[k].x !== P[k - 1].x && P[k].y !== P[k - 1].y) return undefined;
  for (let k = 1; k < nseg; k++) if (horiz(P[k - 1], P[k]) === horiz(P[k], P[k + 1])) return undefined;
  const first = P[0];
  const last = P[nseg];
  const hFirst = horiz(P[0], P[1]);
  const rot = !hFirst;
  const A = (q: Point) => (hFirst ? q.x : q.y);
  const B = (q: Point) => (hFirst ? q.y : q.x);
  const spanA = A(last) - A(first);
  const spanB = B(last) - B(first);
  const adjs: number[] = [];
  for (let k = 1; k <= nseg - 2; k++) {
    const alongA = k % 2 === 1;
    const span = alongA ? spanA : spanB;
    if (span === 0) return undefined;
    adjs.push(Math.round(((alongA ? A(P[k]) - A(first) : B(P[k]) - B(first)) / span) * 100000));
  }
  const prst = nseg === 1 ? 'straightConnector1' : `bentConnector${nseg}`;
  const x0 = Math.min(first.x, last.x);
  const y0 = Math.min(first.y, last.y);
  const w = Math.abs(last.x - first.x);
  const h = Math.abs(last.y - first.y);
  let flipH: boolean;
  let flipV: boolean;
  let off: { x: number; y: number; cx: number; cy: number };
  if (rot) {
    // Rotated 90° clockwise about the centre: the unrotated frame is h × w.
    flipV = last.x > first.x;
    flipH = last.y < first.y;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    off = { x: emu(c, cx - h / 2, 'x'), y: emu(c, cy - w / 2, 'y'), cx: emu(c, h, 'l'), cy: emu(c, w, 'l') };
  } else {
    flipH = last.x < first.x;
    flipV = last.y < first.y;
    off = { x: emu(c, x0, 'x'), y: emu(c, y0, 'y'), cx: emu(c, w, 'l'), cy: emu(c, h, 'l') };
  }
  const stId = e.from ? idByElement.get(e.from) : undefined;
  const enId = e.to ? idByElement.get(e.to) : undefined;
  const cnx =
    (stId !== undefined && e.fromSide ? `<a:stCxn id="${stId}" idx="${CXN_IDX[e.fromSide]}"/>` : '') +
    (enId !== undefined && e.toSide ? `<a:endCxn id="${enId}" idx="${CXN_IDX[e.toSide]}"/>` : '');
  const l = line(c, e.paint.stroke, e.paint.strokeWidth, e.paint.dash);
  const dash = 'dashType' in l ? l.dashType : 'solid';
  const arrowKind = c.theme.connector.arrow === 'open' ? 'arrow' : 'triangle';
  const arrow = e.arrowEnd && c.theme.connector.arrow !== 'none' ? `<a:tailEnd type="${arrowKind}" w="med" len="med"/>` : '';
  const attrs = `${rot ? ' rot="5400000"' : ''}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`;
  const gd = adjs.map((v, i) => `<a:gd name="adj${i + 1}" fmla="val ${v}"/>`).join('');
  return (
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="ds~~${e.id}"/><p:cNvCxnSpPr>${cnx}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr><a:xfrm${attrs}><a:off x="${off.x}" y="${off.y}"/><a:ext cx="${off.cx}" cy="${off.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="${prst}"><a:avLst>${gd}</a:avLst></a:prstGeom>` +
    `<a:noFill/><a:ln w="${Math.round(pt(c, e.paint.strokeWidth) * 12700)}"><a:solidFill><a:srgbClr val="${hex(e.paint.stroke)}"/></a:solidFill>` +
    `<a:prstDash val="${dash}"/>${arrow}</a:ln></p:spPr></p:cxnSp>`
  );
}
