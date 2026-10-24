// Charts, exhibits and decks: figures come from the data, panels compose
// into one editable slide, and a deck renders every page into one file.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, cleanTmp, dep, load, tmpDir } from './helpers.mjs';

const { prepare, isFailure } = await load('pipeline.js');
const { validateSpec } = await load('validate/spec.js');
const { renderSvg } = await load('render/svg.js');
const { renderDeck, prepareDeck } = await load('deck.js');
const { seriesPalette } = await load('layout/series.js');
const JSZip = await dep('jszip');
const { XMLValidator } = await dep('fast-xml-parser');

afterAll(() => cleanTmp('charts-'));

const example = (type, n = 1) => {
  const dir = path.join(ROOT, 'examples', type);
  const file = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()[n - 1];
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
};
const texts = (scene) => scene.elements.filter((e) => e.kind === 'text').map((e) => e.lines.join(' '));
const codes = (r) => r.errors.map((e) => e.code);
const clone = (v) => JSON.parse(JSON.stringify(v));
// Each series' line colour, by element id ("p1_uk" in a panel, "uk" on its own).
const lineColours = (scene) =>
  Object.fromEntries(scene.elements.filter((e) => e.kind === 'line' && e.id.endsWith('--line-1')).map((e) => [e.id.slice(0, -'--line-1'.length), e.paint.stroke]));
const lines = (title, series) => ({
  version: '1.0',
  type: 'line-chart',
  title,
  body: { x: ['2024', '2025', '2026'], series: series.map((id, i) => ({ id, label: id.toUpperCase(), values: [10 + i, 12 + i, 15 + i] })) },
});

describe('bar-chart', () => {
  it('computes totals and differences from the segment values', async () => {
    const p = await prepare(example('bar-chart'));
    expect(isFailure(p)).toBe(false);
    const t = texts(p.scene);
    for (const total of ['370', '310', '1,400', '1,100']) expect(t).toContain(total);
    expect(t.some((s) => /^[−–-]60$/.test(s))).toBe(true);
    expect(t.some((s) => /^[−–-]300$/.test(s))).toBe(true);
    // One number format throughout: 1050 prints with a thousands separator like the totals.
    expect(t).toContain('1,050');
  });

  it('names the series beside the last column and labels every segment it can', async () => {
    const p = await prepare(example('bar-chart'));
    const ids = p.scene.elements.map((e) => e.id);
    for (const s of ['grid', 'chargers', 'electricity']) expect(ids).toContain(`series-${s}--label`);
    expect(ids).toContain('pooled-2040--badge');
  });

  it('rejects a values list that does not match the series', () => {
    const spec = clone(example('bar-chart'));
    spec.body.categories[0].values = [20, 90];
    expect(codes(validateSpec(spec))).toContain('ref.values');
  });

  it('rejects a delta to a category that does not exist, or one running right to left', () => {
    const spec = clone(example('bar-chart'));
    spec.body.deltas = [{ from: 'separate-2030', to: 'poled-2030' }];
    const r = validateSpec(spec);
    expect(codes(r)).toContain('ref.delta');
    expect(r.errors.find((e) => e.code === 'ref.delta').message).toMatch(/Did you mean "pooled-2030"/);
    spec.body.deltas = [{ from: 'pooled-2030', to: 'separate-2030' }];
    expect(validateSpec(spec).errors.find((e) => e.code === 'ref.delta').message).toMatch(/Swap them/);
  });

  it('keeps 100% stacks positive and charts within the altitude limits', () => {
    const spec = clone(example('bar-chart'));
    spec.body.mode = 'percent';
    spec.body.deltas = undefined;
    spec.body.categories[1].values = [30, -80, 200];
    expect(codes(validateSpec(spec))).toContain('ref.values');
    const many = clone(example('bar-chart', 3));
    many.body.categories = Array.from({ length: 13 }, (_, i) => ({ label: `Region ${i + 1}`, values: [i, i + 1] }));
    expect(codes(validateSpec(many))).toContain('altitude.categories');
  });

  it('scales grouped columns to the tallest bar, not the sum of the group', async () => {
    const p = await prepare(example('bar-chart', 3));
    const tallest = p.scene.elements.find((e) => e.id === 'category-1--fy26');
    const base = p.scene.elements.find((e) => e.id === 'chart-baseline');
    // The tallest bar uses most of the plot height.
    expect(base.points[0].y - tallest.y).toBeGreaterThan(400);
  });
});

describe('waterfall', () => {
  it('computes the end level and breaks the axis when the changes are small', async () => {
    const p = await prepare(example('waterfall'));
    expect(texts(p.scene)).toContain('14.5%');
    expect(p.scene.elements.some((e) => e.id.endsWith('--break-1'))).toBe(true);
  });

  it('refuses a stated total that does not add up', () => {
    const spec = clone(example('waterfall', 2));
    spec.body.steps[spec.body.steps.length - 1].value = 190;
    const r = validateSpec(spec);
    expect(codes(r)).toContain('ref.waterfall-total');
    expect(r.errors[0].message).toMatch(/add up to 189/);
  });

  it('needs the start first and the end last', () => {
    const spec = clone(example('waterfall'));
    spec.body.steps[2].kind = 'start';
    expect(codes(validateSpec(spec))).toContain('ref.waterfall');
  });
});

describe('line-chart', () => {
  it('names each line at its end with its last value', async () => {
    const p = await prepare(example('line-chart'));
    const t = texts(p.scene);
    expect(t.some((s) => s.startsWith('Online orders') && s.endsWith('100'))).toBe(true);
    expect(t).toContain('Website relaunch');
  });

  it('checks values against the x labels and annotations against x', () => {
    const spec = clone(example('line-chart'));
    spec.body.series[0].values.pop();
    spec.body.annotations = [{ at: '2030', label: 'Later' }];
    const c = codes(validateSpec(spec));
    expect(c).toContain('ref.values');
    expect(c).toContain('ref.annotation');
  });
});

describe('series colours', () => {
  it('gives page-mates different hues and lets labels that never meet share one', () => {
    const hues = seriesPalette([
      ['china', 'uk', 'eu'],
      ['eu', 'uk'],
      ['2024', '2026'],
    ]);
    expect(Object.fromEntries(hues)).toEqual({ china: 0, uk: 1, eu: 2, 2024: 0, 2026: 1 });
  });

  it('keeps a series in one colour across the panels of an exhibit', async () => {
    const panel = (id, series) => ({ id, type: 'line-chart', body: lines(id, series).body });
    const p = await prepare({ version: '1.0', type: 'exhibit', title: 'UK and EU demand is flat while China grows', body: { panels: [panel('all', ['china', 'uk', 'eu']), panel('europe', ['eu', 'uk'])] } });
    expect(isFailure(p)).toBe(false);
    const c = lineColours(p.scene);
    expect(c.p2_uk).toBe(c.p1_uk);
    expect(c.p2_eu).toBe(c.p1_eu);
    expect(c.p2_eu).not.toBe(c.p1_china);
  });
});

describe('exhibit', () => {
  it('composes panels of any type into one slide with unique ids', async () => {
    const p = await prepare(example('exhibit', 3));
    expect(isFailure(p)).toBe(false);
    expect(p.errors).toEqual([]);
    const ids = p.scene.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The Azure panel keeps its official icons; the waterfall panel its computed end.
    expect(p.scene.elements.some((e) => e.kind === 'icon' && e.set === 'product' && e.id.startsWith('p1_'))).toBe(true);
    expect(texts(p.scene)).toContain('830');
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('validates each panel body as its own type, with the panel in the path', () => {
    const spec = clone(example('exhibit'));
    spec.body.panels[1].body.categories[0].values = [1];
    const r = validateSpec(spec);
    const e = r.errors.find((x) => x.code === 'ref.values');
    expect(e.path).toMatch(/^body\.panels\[1\]\.body\.categories\[0\]/);
  });

  it('lets panels reuse ids but not share a panel id', () => {
    const spec = clone(example('exhibit', 2));
    expect(validateSpec(spec).errors).toEqual([]);
    spec.body.panels[1].id = spec.body.panels[0].id;
    expect(codes(validateSpec(spec))).toContain('ref.duplicate-id');
  });

  it('refuses to shrink a panel past legibility', async () => {
    const spec = clone(example('exhibit', 3));
    spec.body.panels[0].span = 0.3;
    const p = await prepare(spec);
    expect(p.errors.some((e) => e.check === 'canvas-fit' && /too small to read/.test(e.message))).toBe(true);
  });
});

describe('deck', () => {
  const deck = () => ({
    version: '1.0',
    title: 'Investment case',
    subtitle: 'Steering committee',
    theme: 'boardroom',
    footer: { classification: 'Confidential' },
    pages: [
      { kind: 'title', tag: '24 October 2026' },
      { spec: path.join(ROOT, 'examples/bar-chart/01-fleet-charging-costs.json'), tag: 'Exhibit 1' },
      { kind: 'section', title: 'How we will run it', tag: 'Section 2' },
      { spec: path.join(ROOT, 'examples/operating-model/01-finance-hub.json'), tag: 'Exhibit 2' },
      { spec: path.join(ROOT, 'examples/databricks-architecture/01-medallion-pipeline.json'), tag: 'Exhibit 3' },
      { diagram: example('waterfall') },
    ],
  });

  it('renders every page into one PPTX, PDF and draw.io file', async () => {
    const out = tmpDir('charts-deck');
    const r = await renderDeck(deck(), { outDir: out, formats: ['svg', 'pptx', 'pdf', 'drawio'] });
    expect(r.errors).toEqual([]);
    expect(r.exitCode).toBe(0);
    expect(r.pages.map((p) => p.kind)).toEqual(['title', 'diagram', 'section', 'diagram', 'diagram', 'diagram']);
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(out, 'investment-case.pptx')));
    expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(6);
    const pdf = fs.readFileSync(path.join(out, 'investment-case.pdf'), 'latin1');
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(6);
    const drawio = fs.readFileSync(path.join(out, 'investment-case.drawio'), 'utf8');
    expect(drawio.match(/<diagram /g)).toHaveLength(6);
    expect(fs.readdirSync(path.join(out, 'pages')).filter((f) => f.endsWith('.png'))).toHaveLength(6);
    expect(fs.readFileSync(path.join(out, 'investment-case.storyline.md'), 'utf8')).toMatch(/2\. Pooled fleet charging/);
  });

  it('puts every title in the same place and numbers every page but the first', async () => {
    const { pages } = await prepareDeck(deck());
    const content = pages.filter((p) => p.kind === 'diagram').map((p) => p.prepared.scene);
    const titleY = content.map((s) => s.elements.find((e) => e.id === 'ds-title').y);
    expect(new Set(titleY).size).toBe(1);
    // The oversized Databricks page was redrawn under the standard frame at deck size.
    expect(content.every((s) => s.width === 1280 && s.height === 720)).toBe(true);
    const footers = pages.map((p) => p.prepared.scene.elements.find((e) => e.id === 'ds-classification')?.lines[0]);
    expect(footers[0]).toBe('CONFIDENTIAL');
    expect(footers[3]).toBe('CONFIDENTIAL   4');
  });

  it('names the page and file in errors and writes no deliverables', async () => {
    const d = deck();
    d.pages.push({ spec: 'missing/page.json' });
    const bad = clone(example('waterfall'));
    bad.body.steps[0].kind = 'delta';
    d.pages.push({ diagram: bad });
    const out = tmpDir('charts-deck-bad');
    const r = await renderDeck(d, { outDir: out, formats: ['svg', 'pptx'], deckPath: path.join(out, 'deck.json') });
    expect(r.exitCode).toBe(1);
    expect(r.errors.some((e) => /^page 7 \(missing\/page\.json\): cannot find/.test(e.message))).toBe(true);
    expect(r.errors.some((e) => /^page 8: body\.steps\[0\]/.test(e.message))).toBe(true);
    expect(fs.existsSync(path.join(out, 'investment-case.pptx'))).toBe(false);
  });

  it('keeps a series in one colour on every page', async () => {
    const { pages } = await prepareDeck({
      version: '1.0',
      title: 'Markets',
      pages: [{ diagram: lines('China leads growth', ['china', 'uk', 'eu']) }, { diagram: lines('Europe is flat', ['eu', 'uk']) }],
    });
    const [one, two] = pages.map((p) => lineColours(p.prepared.scene));
    expect(two.uk).toBe(one.uk);
    expect(two.eu).toBe(one.eu);
    // On its own the second chart would draw EU in the first hue, which the deck gave to China.
    const alone = await prepare(lines('Europe is flat', ['eu', 'uk']));
    expect(lineColours(alone.scene).eu).toBe(one.china);
  });

  it('inverts the title page and colours a divider with its own accent', async () => {
    const { pages, errors } = await prepareDeck({
      version: '1.0',
      title: 'Platform review',
      theme: 'boardroom',
      pages: [
        { kind: 'title', inverted: true },
        { kind: 'section', title: 'Part one', themeOverrides: { color: { accent: '#C2185B' } } },
        { kind: 'title' },
      ],
    });
    expect(errors).toEqual([]);
    const [inverted, divider, plain] = pages.map((p) => p.prepared);
    expect(inverted.scene.background).toBe(inverted.theme.color.accent);
    expect(divider.scene.background).toBe('#C2185B');
    expect(plain.scene.background).toBe(plain.theme.color.background);
    for (const p of pages) expect(p.result.errors).toEqual([]);
  });

  it('rejects a malformed deck', async () => {
    const r = await prepareDeck({ version: '1.0', title: 'x', pages: [{ kind: 'cover' }] });
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
