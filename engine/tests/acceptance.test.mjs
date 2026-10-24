// The PRD's acceptance tests, as far as they can be automated.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CLI, ROOT, cleanTmp, dep, examples, load, nodeBoxes, tmpDir } from './helpers.mjs';

const JSZip = await dep('jszip');

const { prepare } = await load('pipeline.js');
const { validateSpec } = await load('validate/spec.js');
const { createBrandTheme } = await load('theme/brand.js');
const { validateThemeFile } = await load('validate/theme.js');
const { renderPptx } = await load('export/pptx.js');
const { segmentsCross } = await load('scene/geometry.js');

const financeHub = path.join(ROOT, 'examples', 'operating-model', '01-finance-hub.json');

function cli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: r.status, json: r.stdout ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
}

describe('PRD acceptance', () => {
  it('a finance operating model with a highlighted hub renders clean to SVG + PNG in one pass', () => {
    const out = tmpDir('acc-finance');
    const r = cli(['render', financeHub, '--png', '--out', out]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.errors).toEqual([]);
    const formats = r.json.files.map((f) => f.format).sort();
    expect(formats).toEqual(['png', 'preview', 'spec', 'svg']);
    for (const f of r.json.files) expect(fs.statSync(f.path).size).toBeGreaterThan(500);
  });

  it('the same spec re-rendered produces byte-identical SVG (separate processes)', () => {
    const a = tmpDir('acc-det-a');
    const b = tmpDir('acc-det-b');
    for (const ex of examples().filter((e) => e.name.startsWith('01'))) {
      cli(['render', ex.file, '--out', a, '--no-preview']);
      cli(['render', ex.file, '--out', b, '--no-preview']);
    }
    const svgs = fs.readdirSync(a).filter((f) => f.endsWith('.svg'));
    expect(svgs.length).toBe(7);
    for (const f of svgs) expect(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), f).toBe(true);
  });

  it('switching boardroom → sketch changes styling only: node positions stay within 8 units', async () => {
    // azure-architecture sizes each service cell from its label in the theme's own font,
    // so a theme with wider type grows the cells; its structure test lives in azure.test.mjs.
    for (const ex of examples().filter((e) => e.type !== 'azure-architecture')) {
      const a = await prepare(ex.spec, { theme: 'boardroom' });
      const b = await prepare(ex.spec, { theme: 'sketch' });
      const na = nodeBoxes(a.scene);
      const nb = nodeBoxes(b.scene);
      expect([...na.keys()].sort(), ex.name).toEqual([...nb.keys()].sort());
      for (const [id, s] of na) {
        const t = nb.get(id);
        const d = Math.max(Math.abs(s.x + s.w / 2 - (t.x + t.w / 2)), Math.abs(s.y + s.h / 2 - (t.y + t.h / 2)));
        expect(d, `${ex.type}/${ex.name}: ${id} moved ${d}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('a 60-character label at executive altitude fails validation, suggesting a shorter label or higher altitude', () => {
    const spec = JSON.parse(fs.readFileSync(financeHub, 'utf8'));
    spec.body.layers[1].nodes[0].label = 'Financial planning, analysis and performance management team';
    expect(spec.body.layers[1].nodes[0].label.length).toBeGreaterThanOrEqual(60);
    const r = validateSpec(spec);
    expect(r.ok).toBe(false);
    const msg = r.errors.map((e) => e.message).join('\n');
    expect(msg).toMatch(/body\.layers\[1\]\.nodes\[0\]\.label/);
    expect(msg).toMatch(/shorter label/);
    expect(msg).toMatch(/"altitude": "management"/);
  });

  it('a swimlane with 4 lanes and 12 steps: no connector crosses a box, at most 2 edge crossings', async () => {
    const ex = examples().find((e) => e.name === '02-customer-onboarding');
    expect(ex.spec.body.lanes.length).toBe(4);
    expect(ex.spec.body.steps.length).toBe(12);
    for (const theme of ['boardroom', 'sketch']) {
      const p = await prepare(ex.spec, { theme });
      expect(p.errors.filter((e) => e.check === 'connector-crosses-box')).toEqual([]);
      expect(p.errors).toEqual([]);
      const conns = p.scene.elements.filter((e) => e.kind === 'connector');
      expect(conns.length).toBe(12);
      let crossings = 0;
      for (let i = 0; i < conns.length; i++)
        for (let j = i + 1; j < conns.length; j++)
          for (let a = 1; a < conns[i].points.length; a++)
            for (let b = 1; b < conns[j].points.length; b++)
              if (segmentsCross(conns[i].points[a - 1], conns[i].points[a], conns[j].points[b - 1], conns[j].points[b])) crossings++;
      expect(crossings).toBeLessThanOrEqual(2);
    }
  });

  it('PPTX: every node is a group holding a shape and an editable text box with its label', async () => {
    for (const ex of examples().filter((e) => e.name.startsWith('01'))) {
      const p = await prepare(ex.spec);
      const { buffer } = await renderPptx(p.scene, p.theme, p.fonts);
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const groups = [...xml.matchAll(/<p:grpSp>[\s\S]*?<\/p:grpSp>/g)].map((m) => m[0]);
      const nodes = p.scene.elements.filter((e) => e.kind === 'shape' && (e.role === 'node' || e.role === 'marker') && e.meta?.specId && e.group);
      expect(nodes.length).toBeGreaterThan(0);
      for (const n of nodes) {
        const g = groups.find((x) => x.includes(`name="${n.group.slice(2)}"`));
        expect(g, `${ex.name}: group for ${n.id}`).toBeTruthy();
        expect(g).toMatch(/<p:sp>[\s\S]*?<a:prstGeom/);
        const firstWord = n.meta.label.split(/\s+/)[0].replace(/&/g, '&amp;');
        expect(g, `${n.id} label text`).toContain(`<a:t>${firstWord}`);
      }
      expect(xml).toMatch(/<p:ph[^>]*type="title"/);
    }
  });

  it('PPTX swimlane connectors are native connectors glued to both shapes', async () => {
    const ex = examples().find((e) => e.name === '01-invoice-approval');
    const p = await prepare(ex.spec);
    const { buffer } = await renderPptx(p.scene, p.theme, p.fonts);
    const xml = await (await JSZip.loadAsync(buffer)).file('ppt/slides/slide1.xml').async('string');
    const cxn = [...xml.matchAll(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g)].map((m) => m[0]);
    expect(cxn.length).toBe(ex.spec.body.edges.length);
    for (const c of cxn) {
      expect(c).toMatch(/<a:stCxn id="\d+" idx="\d"\/>/);
      expect(c).toMatch(/<a:endCxn id="\d+" idx="\d"\/>/);
    }
  });

  it('a brand (two hex codes + a font name) becomes a valid theme that passes contrast checks', async () => {
    const r = createBrandTheme({ id: 'vitest-brand', colors: '#D4001A,#1A1A1A', font: 'Helvetica Neue', fontFiles: {} });
    try {
      expect(r.ok, JSON.stringify(r.errors)).toBe(true);
      const v = validateThemeFile(r.file);
      expect(v.ok).toBe(true);
      expect(v.contrast['ink/surface']).toBeGreaterThanOrEqual(4.5);
      expect(v.contrast['accentInk/accent']).toBeGreaterThanOrEqual(4.5);
      for (const ex of examples().filter((e) => e.name.startsWith('01'))) {
        const p = await prepare(ex.spec, { theme: 'vitest-brand' });
        expect(p.errors, ex.name).toEqual([]);
      }
    } finally {
      fs.rmSync(r.file, { force: true });
    }
  });

  it('pale and dark brand colours still produce contrast-safe themes', () => {
    for (const [colors, background] of [['#FFD400', undefined], ['#00E5FF', '#101418'], ['#777777', undefined]]) {
      const r = createBrandTheme({ id: 'vitest-brand-2', colors, background, fontFiles: {} });
      try {
        expect(r.ok, `${colors}: ${JSON.stringify(r.errors)}`).toBe(true);
      } finally {
        fs.rmSync(r.file, { force: true });
      }
    }
  });

  it('subsequent renders complete in under 3 seconds', () => {
    const out = tmpDir('acc-perf');
    cli(['render', financeHub, '--out', out]);
    for (const ex of examples().filter((e) => e.name.startsWith('01'))) {
      const t0 = Date.now();
      execFileSync(process.execPath, [CLI, 'render', ex.file, '--out', out, '--png']);
      expect(Date.now() - t0, ex.name).toBeLessThan(3000);
    }
  });
});

afterAll(() => cleanTmp('acc-'));
