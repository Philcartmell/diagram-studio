// Export formats: every format comes from the same scene graph.
import { describe, expect, it } from 'vitest';
import { dep, examples, load } from './helpers.mjs';

const { prepare } = await load('pipeline.js');
const { renderSvg } = await load('render/svg.js');
const { renderPdf } = await load('export/pdf.js');
const { renderPptx } = await load('export/pptx.js');
const { renderDrawio } = await load('export/drawio.js');
const JSZip = await dep('jszip');
const { XMLParser, XMLValidator } = await dep('fast-xml-parser');

const firsts = () => examples().filter((e) => e.name.startsWith('01'));

describe('SVG', () => {
  it('is self-contained, accessible and labels every element', async () => {
    const p = await prepare(firsts().find((e) => e.type === 'operating-model').spec);
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toMatch(/<title id="ds-svg-title">/);
    expect(svg).toMatch(/<desc id="ds-svg-desc">/);
    expect(svg).toMatch(/@font-face\{font-family:"Inter";font-weight:600;[^}]*data:font\/woff2;base64,/);
    expect(svg).not.toMatch(/(href|src)="(https?:|\/\/)/);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const role of ['node', 'title', 'label']) expect(svg).toContain(`data-role="${role}"`);
    // Coordinates are rounded to 0.5.
    expect(svg).not.toMatch(/ (x|y|width|height)="-?\d+\.(?!5")\d+"/);
  });
});

describe('SVG with Azure icons', () => {
  it('defines each icon once as a symbol, draws it with <use>, and keeps ids unique', async () => {
    const ex = examples().find((e) => e.name === '02-zone-redundant-web-app');
    const p = await prepare(ex.spec);
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    expect(XMLValidator.validate(svg)).toBe(true);
    const symbols = [...svg.matchAll(/<symbol id="ds-az-([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).toEqual(expect.arrayContaining(['application-gateways', 'private-endpoints', 'key-vaults', 'virtual-networks', 'network-security-groups']));
    const uses = [...svg.matchAll(/<use [^>]*href="#ds-az-([a-z0-9-]+)"/g)].map((m) => m[1]);
    // Three private endpoints share one symbol.
    expect(uses.filter((u) => u === 'private-endpoints').length).toBe(3);
    for (const u of uses) expect(symbols).toContain(u);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg).not.toMatch(/(href|src)="(https?:|\/\/)/);
    expect(svg).toMatch(/@font-face\{font-family:"Selawik"/);
  });
});

describe('PDF', () => {
  it('is a single vector page with embedded fonts', async () => {
    for (const ex of firsts()) {
      const p = await prepare(ex.spec, { theme: 'sketch' });
      const pdf = await renderPdf(p.scene, p.theme, p.fonts);
      const text = pdf.toString('latin1');
      expect(text.startsWith('%PDF-')).toBe(true);
      expect(text).toMatch(/\/FontFile2/);
      expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
    }
  });
});

describe('PPTX', () => {
  it('has the title in the title placeholder and the subtitle in the notes', async () => {
    const ex = firsts().find((e) => e.type === 'operating-model');
    const p = await prepare(ex.spec);
    const { buffer, notes } = await renderPptx(p.scene, p.theme, p.fonts);
    const zip = await JSZip.loadAsync(buffer);
    const slide = await zip.file('ppt/slides/slide1.xml').async('string');
    const notesXml = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');
    expect(slide).toMatch(/type="title"[\s\S]*?<a:t>A shared finance hub/);
    expect(notesXml).toContain('Target finance operating model, 2027');
    expect(notesXml).toContain('40% of transactional effort');
    expect(notes.join(' ')).toMatch(/Calibri/);
    expect(XMLValidator.validate(slide)).toBe(true);
  });

  it('writes well-formed slides for every type and theme', async () => {
    for (const ex of firsts()) {
      for (const theme of ['boardroom', 'bold']) {
        const p = await prepare(ex.spec, { theme });
        const { buffer } = await renderPptx(p.scene, p.theme, p.fonts);
        const slide = await (await JSZip.loadAsync(buffer)).file('ppt/slides/slide1.xml').async('string');
        expect(XMLValidator.validate(slide), `${ex.name} ${theme}`).toBe(true);
        const ids = [...slide.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, 'unique shape ids').toBe(ids.length);
      }
    }
  });
});

describe('draw.io', () => {
  const parse = (xml) => {
    const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
    const cells = doc.mxfile.diagram.mxGraphModel.root.mxCell;
    return Array.isArray(cells) ? cells : [cells];
  };

  it('is well-formed mxGraph XML whose references all resolve', async () => {
    for (const ex of examples()) {
      const p = await prepare(ex.spec);
      const xml = renderDrawio(p.scene, p.theme, p.fonts);
      expect(XMLValidator.validate(xml), ex.name).toBe(true);
      const cells = parse(xml);
      const ids = new Set(cells.map((c) => c.id));
      expect(ids.size, 'unique cell ids').toBe(cells.length);
      const byId = new Map(cells.map((c) => [c.id, c]));
      for (const c of cells) {
        if (c.parent) expect(ids.has(c.parent), `${ex.name}: parent ${c.parent}`).toBe(true);
        if (c.source) expect(ids.has(c.source), `${ex.name}: source ${c.source}`).toBe(true);
        if (c.target) expect(ids.has(c.target), `${ex.name}: target ${c.target}`).toBe(true);
        // Nested vertices must sit inside their parent (relative geometry).
        const parent = byId.get(c.parent);
        if (c.vertex === '1' && parent?.mxGeometry && c.mxGeometry) {
          const g = c.mxGeometry;
          const pg = parent.mxGeometry;
          expect(Number(g.x) >= -0.5 && Number(g.y) >= -0.5, `${ex.name}: ${c.id} inside ${c.parent}`).toBe(true);
          expect(Number(g.x) + Number(g.width) <= Number(pg.width) + 0.5, `${ex.name}: ${c.id} width inside ${c.parent}`).toBe(true);
          expect(Number(g.y) + Number(g.height) <= Number(pg.height) + 0.5, `${ex.name}: ${c.id} height inside ${c.parent}`).toBe(true);
        }
      }
    }
  });

  it('keeps swimlane lanes intact: lanes are swimlane containers holding their steps', async () => {
    for (const ex of examples().filter((e) => e.type === 'swimlane')) {
      const p = await prepare(ex.spec);
      const cells = parse(renderDrawio(p.scene, p.theme, p.fonts));
      const byId = new Map(cells.map((c) => [c.id, c]));
      for (const lane of ex.spec.body.lanes) {
        const cell = byId.get(`lane-${lane.id}`);
        expect(cell.style.startsWith('swimlane;')).toBe(true);
        expect(cell.value).toContain(lane.label.split(' ')[0]);
      }
      for (const step of ex.spec.body.steps) expect(byId.get(step.id).parent, step.id).toBe(`lane-${step.lane}`);
      const edges = cells.filter((c) => c.edge === '1' && c.source);
      expect(edges.length).toBe(ex.spec.body.edges.length);
    }
  });
});
