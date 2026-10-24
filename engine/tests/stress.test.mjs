// Stress specs: longest labels, node limits, a single node, non-Latin text
// and growing canvases. All must render with zero QA errors and warnings.
import { describe, expect, it } from 'vitest';
import { THEMES, load, stressSpecs } from './helpers.mjs';

const { prepare, isFailure } = await load('pipeline.js');
const { renderSvg } = await load('render/svg.js');
const { renderPng } = await load('export/png.js');

describe('stress specs', () => {
  for (const s of stressSpecs()) {
    for (const theme of THEMES) {
      it(`${s.name} @ ${theme}`, async () => {
        const p = await prepare(s.spec, { theme });
        expect(isFailure(p), JSON.stringify(p.validationErrors ?? [])).toBe(false);
        expect(p.errors).toEqual([]);
        expect(p.warnings).toEqual([]);
        const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
        expect(svg).toMatch(/^<svg /);
        const png = await renderPng(p.scene, p.theme, p.fonts, { scale: 1 });
        expect(png.subarray(1, 4).toString()).toBe('PNG');
      });
    }
  }

  it('swimlane routing does not depend on the order edges are listed in', async () => {
    const { segmentsCross } = await load('scene/geometry.js');
    const base = stressSpecs().find((x) => x.name === '08-six-lanes-16x9').spec;
    for (const edges of [base.body.edges, [...base.body.edges].reverse()]) {
      const spec = structuredClone(base);
      spec.body.edges = edges;
      const p = await prepare(spec);
      expect(p.errors).toEqual([]);
      const c = p.scene.elements.filter((e) => e.kind === 'connector');
      let crossings = 0;
      for (let i = 0; i < c.length; i++)
        for (let j = i + 1; j < c.length; j++)
          for (let a = 1; a < c[i].points.length; a++)
            for (let b = 1; b < c[j].points.length; b++) if (segmentsCross(c[i].points[a - 1], c[i].points[a], c[j].points[b - 1], c[j].points[b])) crossings++;
      expect(crossings).toBe(0);
    }
  });

  it('non-Latin text survives into the SVG unchanged', async () => {
    const s = stressSpecs().find((x) => x.name === '06-non-latin-text');
    const p = await prepare(s.spec);
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    for (const t of ['Zürich', 'São Paulo', '東京', '東京の物流センター', 'Größere']) expect(svg).toContain(t);
  });
});
