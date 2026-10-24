// Golden renders: every example in every built-in theme must pass `check`
// with zero errors and zero warnings, match its snapshot SVG, and stay
// within 0.1% pixel difference of its baseline PNG.
// Refresh baselines deliberately with: UPDATE_GOLDEN=1 npm test (then review the diff).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES, TESTS, dep, examples, load } from './helpers.mjs';

const pixelmatch = await dep('pixelmatch');
const { PNG } = await dep('pngjs');

const { prepare, isFailure } = await load('pipeline.js');
const { renderSvg } = await load('render/svg.js');
const { renderPng } = await load('export/png.js');

const GOLDEN = path.join(TESTS, '__golden__');
const update = process.env.UPDATE_GOLDEN === '1';

describe('golden renders', () => {
  for (const ex of examples()) {
    for (const theme of THEMES) {
      const key = `${ex.type}-${ex.name}-${theme}`;
      it(key, async () => {
        const p = await prepare(ex.spec, { theme });
        expect(isFailure(p), JSON.stringify(p.validationErrors ?? [])).toBe(false);
        expect(p.errors, 'QA errors').toEqual([]);
        expect(p.warnings, 'QA warnings').toEqual([]);

        const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts, embedFonts: false });
        await expect(svg).toMatchFileSnapshot(path.join(GOLDEN, 'svg', `${key}.svg`));

        const png = await renderPng(p.scene, p.theme, p.fonts, { scale: 0.5 });
        const file = path.join(GOLDEN, 'png', `${key}.png`);
        if (update || !fs.existsSync(file)) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, png);
          return;
        }
        const a = PNG.sync.read(png);
        const b = PNG.sync.read(fs.readFileSync(file));
        expect([a.width, a.height]).toEqual([b.width, b.height]);
        const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
        expect(diff / (a.width * a.height), `${diff} pixels differ`).toBeLessThanOrEqual(0.001);
      });
    }
  }
});
