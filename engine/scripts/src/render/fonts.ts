/** Font subsetting: embeds only the glyphs a diagram uses, as base64 WOFF2. */
import fs from 'node:fs';
import subsetFont from 'subset-font';
import type { DrawItem } from './draw.js';

interface FaceUse {
  family: string;
  weight: number;
  file: string;
  chars: Set<string>;
}

export function collectFaces(items: DrawItem[]): FaceUse[] {
  const byFile = new Map<string, FaceUse>();
  for (const it of items) {
    for (const p of it.prims) {
      if (p.t !== 'text') continue;
      let use = byFile.get(p.file);
      if (!use) {
        use = { family: p.family, weight: p.weight, file: p.file, chars: new Set() };
        byFile.set(p.file, use);
      }
      for (const l of p.lines) for (const ch of l.text) use.chars.add(ch);
    }
  }
  return [...byFile.values()].sort((a, b) => a.weight - b.weight || a.file.localeCompare(b.file));
}

const subsetCache = new Map<string, string>();

export async function fontFaceCss(items: DrawItem[]): Promise<string> {
  const rules: string[] = [];
  for (const use of collectFaces(items)) {
    const text = [...use.chars].sort().join('') + ' ';
    const key = `${use.file}|${text}`;
    let b64 = subsetCache.get(key);
    if (!b64) {
      const buf = fs.readFileSync(use.file);
      const woff2 = await subsetFont(buf, text, { targetFormat: 'woff2' });
      b64 = Buffer.from(woff2).toString('base64');
      subsetCache.set(key, b64);
    }
    rules.push(
      `@font-face{font-family:"${use.family}";font-weight:${use.weight};font-style:normal;` +
        `src:url(data:font/woff2;base64,${b64}) format("woff2");}`,
    );
  }
  return rules.join('');
}
