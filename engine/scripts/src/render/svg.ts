/**
 * SVG serialiser. Output is a single self-contained file: fonts are embedded
 * as WOFF2 subsets, every element has a stable id and data-role, and numbers
 * are rounded to 0.5 so identical input gives byte-identical output.
 */
import type { Scene } from '../scene/types.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import { escapeXml, fmt } from '../util.js';
import { type DrawItem, type Prim, sceneToDraw } from './draw.js';
import { fontFaceCss } from './fonts.js';
import { iconSymbol, iconSymbolId } from '../azure/icons.js';

export const GENERATOR = 'diagram-studio 1.0.0';

export interface SvgOptions {
  theme: Theme;
  fonts: FontSet;
  /** Embed subset fonts (default true). PNG rasterising skips this for speed. */
  embedFonts?: boolean;
  /** Omit the background rectangle (transparent PNG). */
  transparent?: boolean;
}

function attrs(a: Record<string, string | number | undefined>): string {
  let s = '';
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === '') continue;
    s += ` ${k}="${typeof v === 'number' ? fmt(v) : escapeXml(v)}"`;
  }
  return s;
}

function familyStack(family: string): string {
  const q = /\s/.test(family) ? `'${family}'` : family;
  return `${q}, 'Helvetica Neue', Arial, sans-serif`;
}

function primToSvg(p: Prim, idAttrs: string): string {
  switch (p.t) {
    case 'path':
      return `<path${idAttrs}${attrs({
        d: p.d,
        fill: p.fill,
        stroke: p.stroke === 'none' ? undefined : p.stroke,
        'stroke-width': p.stroke === 'none' ? undefined : p.sw,
        'stroke-dasharray': p.dash?.map(fmt).join(' '),
        'stroke-linecap': p.stroke === 'none' ? undefined : p.cap,
        'stroke-linejoin': p.stroke === 'none' ? undefined : p.join,
      })}/>`;
    case 'text': {
      const tspans = p.lines
        .map((l) => `<tspan${attrs({ x: l.x, y: l.y })}>${escapeXml(l.text)}</tspan>`)
        .join('');
      return `<text${idAttrs}${attrs({
        'font-family': familyStack(p.family),
        'font-size': p.size,
        'font-weight': p.weight,
        fill: p.color,
        'text-anchor': p.anchor === 'start' ? undefined : p.anchor,
        'letter-spacing': p.letterSpacing ? p.letterSpacing : undefined,
      })}>${tspans}</text>`;
    }
    case 'icon':
      return `<g${idAttrs} transform="translate(${fmt(p.x)} ${fmt(p.y)}) scale(${p.scale})" fill="none" stroke="${p.color}" stroke-width="${p.sw}" stroke-linecap="round" stroke-linejoin="round">${p.paths
        .map((d) => `<path d="${d}"/>`)
        .join('')}</g>`;
    case 'grid':
      return `<rect${idAttrs}${attrs({ x: p.x, y: p.y, width: p.w, height: p.h, fill: 'url(#ds-grid-pattern)' })}/>`;
    case 'product':
      return `<use${idAttrs}${attrs({ href: `#${iconSymbolId(p.icon)}`, x: p.x, y: p.y, width: p.size, height: p.size })}/>`;
  }
}

function itemToSvg(it: DrawItem): string {
  const data = it.data ?? {};
  const id = attrs({ id: it.id, 'data-role': it.role, ...data });
  const filter = it.shadow ? ' filter="url(#ds-shadow)"' : '';
  if (it.prims.length === 1 && it.prims[0].t !== 'icon' && it.prims[0].t !== 'product') {
    const s = primToSvg(it.prims[0], id);
    return filter ? s.replace(/^<(\w+)/, `<$1${filter}`) : s;
  }
  return `<g${id}${filter}>${it.prims.map((p) => primToSvg(p, '')).join('')}</g>`;
}

export async function renderSvg(scene: Scene, opts: SvgOptions): Promise<string> {
  if (!scene.resolved) throw new Error('renderSvg needs a theme-resolved scene');
  const items = sceneToDraw(scene, { theme: opts.theme, fonts: opts.fonts });
  const W = scene.width;
  const H = scene.height;
  const defs: string[] = [];
  if (opts.embedFonts !== false) {
    const css = await fontFaceCss(items);
    if (css) defs.push(`<style>${css}</style>`);
  }
  const grid = items.flatMap((i) => i.prims).find((p) => p.t === 'grid');
  if (grid && grid.t === 'grid') {
    const s = grid.spacing;
    defs.push(
      `<pattern id="ds-grid-pattern" width="${fmt(s)}" height="${fmt(s)}" patternUnits="userSpaceOnUse" x="${fmt(grid.x)}" y="${fmt(grid.y)}">` +
        `<path d="M${fmt(s)} 0H0V${fmt(s)}" fill="none" stroke="${grid.color}" stroke-width="0.75"/></pattern>`,
    );
  }
  // Product icons (Azure, Databricks): one <symbol> per icon used, drawn with <use> (ids inside are namespaced).
  const productIcons = [...new Set(items.flatMap((i) => i.prims).flatMap((p) => (p.t === 'product' ? [p.icon] : [])))].sort();
  for (const icon of productIcons) {
    const sym = iconSymbol(icon);
    if (sym) defs.push(`<symbol id="${iconSymbolId(icon)}" viewBox="${sym.viewBox.join(' ')}">${sym.body}</symbol>`);
  }
  if (items.some((i) => i.shadow)) {
    defs.push(
      '<filter id="ds-shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.12"/></filter>',
    );
  }
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}" height="${fmt(H)}" viewBox="0 0 ${fmt(W)} ${fmt(H)}" role="img" aria-labelledby="ds-svg-title ds-svg-desc"${attrs(
      { 'data-generator': GENERATOR, 'data-type': scene.meta.type, 'data-theme': scene.meta.themeId, 'data-altitude': scene.meta.altitude },
    )}>`,
  );
  out.push(`<title id="ds-svg-title">${escapeXml(scene.meta.title)}</title>`);
  out.push(`<desc id="ds-svg-desc">${escapeXml(scene.meta.subtitle ?? scene.meta.title)}</desc>`);
  if (defs.length) out.push(`<defs>${defs.join('')}</defs>`);
  if (!opts.transparent) out.push(`<rect id="ds-background" data-role="background" width="${fmt(W)}" height="${fmt(H)}" fill="${scene.background}"/>`);
  for (const it of items) out.push(itemToSvg(it));
  out.push('</svg>');
  return out.join('\n') + '\n';
}
