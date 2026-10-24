/** PNG rasterising with resvg: no browser, consistent font rendering. */
import { Resvg } from '@resvg/resvg-js';
import type { Scene } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import { renderSvg } from '../render/svg.js';

export interface PngOptions {
  scale?: number;
  transparent?: boolean;
}

function needsSystemFonts(scene: Scene, fonts: FontSet): boolean {
  for (const e of scene.elements) {
    if (e.kind !== 'text') continue;
    for (const line of e.lines) for (const ch of line) if (ch.trim() && !fonts.hasGlyph(ch)) return true;
  }
  return false;
}

export function rasterize(svg: string, fonts: FontSet, scale: number, loadSystemFonts = false): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: {
      fontFiles: fonts.faces.map((f) => f.file),
      loadSystemFonts,
      defaultFontFamily: fonts.family,
    },
    shapeRendering: 2,
    textRendering: 1,
  });
  return resvg.render().asPng();
}

export async function renderPng(scene: Scene, theme: Theme, fonts: FontSet, opts: PngOptions = {}): Promise<Buffer> {
  const svg = await renderSvg(scene, { theme, fonts, embedFonts: false, transparent: opts.transparent });
  return rasterize(svg, fonts, opts.scale ?? 2, needsSystemFonts(scene, fonts));
}
