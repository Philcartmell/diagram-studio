/** `theme preview <id>`: one sample of every type in a theme, as a contact-sheet PNG. */
import fs from 'node:fs';
import path from 'node:path';
import { exampleFiles } from '../catalog.js';
import { rasterize, renderPng } from '../export/png.js';
import { isFailure, prepare } from '../pipeline.js';
import { DIAGRAM_TYPES } from '../spec.js';
import { fontSetFor } from '../text/measure.js';
import { DiagramError, escapeXml } from '../util.js';
import { findTheme, loadTheme } from './load.js';

const TILE_W = 640;
const TILE_H = 360;
const GAP = 24;
const COLS = 3;

export async function themePreview(id: string, outDir: string): Promise<{ ok: boolean; file: string; theme: string; problems: string[] }> {
  if (!findTheme(id)) throw new DiagramError(`Theme "${id}" was not found.`, 'usage');
  const problems: string[] = [];
  const tiles: { type: string; png?: string; height: number }[] = [];
  for (const type of DIAGRAM_TYPES) {
    const file = exampleFiles(type)[0];
    if (!file) continue;
    const p = await prepare(JSON.parse(fs.readFileSync(file, 'utf8')), { theme: id });
    if (isFailure(p)) {
      problems.push(`${type}: ${p.validationErrors.map((e) => e.message).join('; ')}`);
      tiles.push({ type, height: TILE_H });
      continue;
    }
    for (const e of p.errors) problems.push(`${type}: error ${e.check}: ${e.message}`);
    for (const w of p.warnings) problems.push(`${type}: warning ${w.check}: ${w.message}`);
    const scale = TILE_W / p.scene.width;
    const png = await renderPng(p.scene, p.theme, p.fonts, { scale });
    tiles.push({ type, png: png.toString('base64'), height: Math.round(p.scene.height * scale) });
  }
  const theme = loadTheme(id);
  const rows = Math.ceil(tiles.length / COLS);
  const rowH = (r: number) => Math.max(...tiles.slice(r * COLS, r * COLS + COLS).map((t) => t.height));
  const headH = 72;
  let y = headH;
  const parts: string[] = [];
  for (let r = 0; r < rows; r++) {
    tiles.slice(r * COLS, r * COLS + COLS).forEach((t, c) => {
      const x = GAP + c * (TILE_W + GAP);
      parts.push(`<text x="${x}" y="${y + 16}" font-family="Inter" font-size="14" font-weight="600" fill="#1B2733">${escapeXml(t.type)}</text>`);
      parts.push(`<rect x="${x - 1}" y="${y + 27}" width="${TILE_W + 2}" height="${t.height + 2}" fill="none" stroke="#C9D1DB"/>`);
      if (t.png) parts.push(`<image x="${x}" y="${y + 28}" width="${TILE_W}" height="${t.height}" href="data:image/png;base64,${t.png}"/>`);
      else parts.push(`<text x="${x + 16}" y="${y + 60}" font-family="Inter" font-size="14" fill="#C62828">Failed validation</text>`);
    });
    y += 28 + rowH(r) + GAP;
  }
  const W = GAP + COLS * (TILE_W + GAP);
  const H = y;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#EEF1F5"/>` +
    `<text x="${GAP}" y="40" font-family="Inter" font-size="22" font-weight="600" fill="#1B2733">${escapeXml(theme.name)} theme</text>` +
    `<text x="${GAP}" y="60" font-family="Inter" font-size="13" fill="#5B6875">${escapeXml(theme.description ?? '')}</text>` +
    parts.join('') +
    `</svg>`;
  const fonts = fontSetFor(loadTheme('boardroom'));
  const png = rasterize(svg, fonts, 1);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `theme-preview-${id}.png`);
  fs.writeFileSync(file, png);
  return { ok: problems.length === 0, file, theme: id, problems };
}
