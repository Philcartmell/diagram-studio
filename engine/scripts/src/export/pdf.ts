/**
 * Vector PDF via pdfkit. Draws the same primitives as the SVG writer
 * (including sketch strokes), with the theme's fonts embedded as subsets.
 */
import PDFDocument from 'pdfkit';
import { sceneToDraw } from '../render/draw.js';
import type { Scene } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import { GENERATOR } from '../render/svg.js';
import { Resvg } from '@resvg/resvg-js';
import { iconSvgAt } from '../azure/icons.js';

const azurePng = new Map<string, Buffer>();
/** Product icons (Azure, Databricks) are full-colour SVG with gradients: embed a crisp 256 px raster of each. */
function azureIconPng(icon: string): Buffer | undefined {
  let png = azurePng.get(icon);
  if (!png) {
    const svg = iconSvgAt(icon, 256);
    if (!svg) return undefined;
    png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 }, font: { loadSystemFonts: false } }).render().asPng();
    azurePng.set(icon, png);
  }
  return png;
}

/** A4 in points; other aspects print at 0.75 pt per unit (a 1280-wide slide is 13.33 in). */
const A4: [number, number] = [841.89, 595.28];

function pageSize(scene: Scene): { w: number; h: number; s: number } {
  const ratio = scene.width / scene.height;
  const a4l = A4[0] / A4[1];
  if (Math.abs(ratio - a4l) < 0.02) return { w: A4[0], h: A4[1], s: A4[0] / scene.width };
  if (Math.abs(ratio - 1 / a4l) < 0.02) return { w: A4[1], h: A4[0], s: A4[1] / scene.width };
  return { w: scene.width * 0.75, h: scene.height * 0.75, s: 0.75 };
}

export interface PdfPage {
  scene: Scene;
  theme: Theme;
  fonts: FontSet;
}

export async function renderPdf(scene: Scene, theme: Theme, fonts: FontSet): Promise<Buffer> {
  return renderPdfPages([{ scene, theme, fonts }], { title: scene.meta.title, subject: scene.meta.subtitle });
}

/**
 * One PDF with a page per scene and a bookmark per action title. `size` fixes every
 * page to one canvas (a deck), scaling any larger page down to fit; without it the
 * single page takes its scene's own size.
 */
export async function renderPdfPages(pages: PdfPage[], meta: { title: string; subject?: string; size?: { width: number; height: number } }): Promise<Buffer> {
  const first = meta.size ? ({ width: meta.size.width, height: meta.size.height } as Scene) : pages[0].scene;
  const { w, h } = pageSize(first);
  const doc = new PDFDocument({
    size: [w, h],
    margin: 0,
    autoFirstPage: false,
    info: { Title: meta.title, Subject: meta.subject ?? '', Creator: GENERATOR, Producer: GENERATOR },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const registered = new Set<string>();
  for (const page of pages) {
    for (const f of page.fonts.faces) {
      if (!registered.has(f.file)) doc.registerFont(f.file, f.file);
      registered.add(f.file);
    }
    doc.addPage({ size: [w, h], margin: 0 });
    if (pages.length > 1) doc.outline.addItem(page.scene.meta.title);
    const s = Math.min(w / page.scene.width, h / page.scene.height);
    doc.rect(0, 0, w, h).fill(page.scene.background);
    doc.save();
    doc.translate((w - page.scene.width * s) / 2, (h - page.scene.height * s) / 2);
    doc.scale(s);
    drawScene(doc, page.scene, page.theme, page.fonts);
    doc.restore();
  }
  doc.end();
  return done;
}

function drawScene(doc: InstanceType<typeof PDFDocument>, scene: Scene, theme: Theme, fonts: FontSet) {
  for (const item of sceneToDraw(scene, { theme, fonts })) {
    for (const p of item.prims) {
      switch (p.t) {
        case 'path': {
          const hasFill = p.fill !== 'none';
          const hasStroke = p.stroke !== 'none' && p.sw > 0;
          if (!hasFill && !hasStroke) break;
          doc.save();
          doc.path(p.d);
          if (hasStroke) {
            doc.lineWidth(p.sw);
            doc.lineCap(p.cap ?? 'butt');
            doc.lineJoin(p.join ?? 'miter');
            if (p.dash) doc.dash(p.dash[0], { space: p.dash[1] });
            else doc.undash();
          }
          if (hasFill && hasStroke) doc.fillAndStroke(p.fill, p.stroke);
          else if (hasFill) doc.fill(p.fill);
          else doc.stroke(p.stroke);
          doc.restore();
          break;
        }
        case 'text': {
          doc.font(p.file).fontSize(p.size).fillColor(p.color);
          for (const line of p.lines) {
            const lw = fonts.width(line.text, p.size, p.weight, p.letterSpacing ?? 0);
            const x = p.anchor === 'start' ? line.x : p.anchor === 'middle' ? line.x - lw / 2 : line.x - lw;
            doc.text(line.text, x, line.y, { lineBreak: false, baseline: 'alphabetic', characterSpacing: p.letterSpacing ?? 0 });
          }
          break;
        }
        case 'icon': {
          doc.save();
          doc.translate(p.x, p.y).scale(p.scale);
          doc.lineWidth(p.sw).lineCap('round').lineJoin('round');
          for (const d of p.paths) doc.path(d).stroke(p.color);
          doc.restore();
          break;
        }
        case 'product': {
          const png = azureIconPng(p.icon);
          if (png) doc.image(png, p.x, p.y, { width: p.size, height: p.size });
          break;
        }
        case 'grid': {
          doc.save();
          doc.lineWidth(0.75);
          for (let x = p.x; x <= p.x + p.w; x += p.spacing) doc.moveTo(x, p.y).lineTo(x, p.y + p.h);
          for (let y = p.y; y <= p.y + p.h; y += p.spacing) doc.moveTo(p.x, y).lineTo(p.x + p.w, y);
          doc.stroke(p.color);
          doc.restore();
          break;
        }
      }
    }
  }
}
