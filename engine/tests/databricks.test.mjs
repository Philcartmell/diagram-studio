// Databricks: the icon catalog, resolution across the Azure and Databricks packs,
// Databricks icons inside Azure diagrams, and Databricks icons in every export format.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, cleanTmp, dep, load, tmpDir } from './helpers.mjs';

const { prepare, isFailure } = await load('pipeline.js');
const { renderSvg } = await load('render/svg.js');
const { validateSpec } = await load('validate/spec.js');
const icons = await load('azure/icons.js');
const { renderPptx } = await load('export/pptx.js');
const { renderDrawio } = await load('export/drawio.js');
const { renderPdf } = await load('export/pdf.js');
const JSZip = await dep('jszip');
const { XMLValidator } = await dep('fast-xml-parser');

const DIR = path.join(ROOT, 'assets', 'databricks-icons');
const catalog = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));

/** An Azure diagram with a Databricks workspace inside it. */
const mixed = (children) => ({
  version: '1.0',
  type: 'azure-architecture',
  altitude: 'management',
  title: 'Unity Catalog governs every table the lakehouse serves to Power BI',
  body: {
    layout: 'row',
    children: children ?? [
      { id: 'adls', service: 'storage-accounts', label: 'ADLS Gen2' },
      {
        id: 'ws',
        boundary: 'service',
        service: 'azure-databricks',
        label: 'Azure Databricks workspace',
        layout: 'row',
        children: [
          { id: 'pipelines', service: 'databricks:dlt' },
          { id: 'uc', service: 'databricks:unity-catalog' },
          { id: 'dbsql', service: 'databricks:sql-warehouse' },
        ],
      },
      { id: 'pbi', service: 'power-bi-embedded', label: 'Power BI' },
    ],
    flows: [
      { from: 'adls', to: 'pipelines', step: 1 },
      { from: 'pipelines', to: 'uc', step: 2 },
      { from: 'uc', to: 'dbsql' },
      { from: 'dbsql', to: 'pbi', step: 3 },
    ],
    steps: [
      { step: 1, text: 'Pipelines ingest raw files from ADLS Gen2.' },
      { step: 2, text: 'Unity Catalog registers the cleaned tables.' },
      { step: 3, text: 'Power BI queries them through a SQL warehouse.' },
    ],
  },
});

afterAll(() => cleanTmp('dbx-'));

describe('Databricks icon catalog', () => {
  it('has one normalised SVG per product, with a viewBox, namespaced ids and no scripting', () => {
    expect(catalog.count).toBe(71);
    for (const id of Object.keys(catalog.icons)) {
      const svg = fs.readFileSync(path.join(DIR, 'svg', `${id}.svg`), 'utf8');
      expect(svg, id).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48"><g fill="none">/);
      expect(svg, id).not.toMatch(/<title>|<script|\son\w+=|href="http/);
      for (const m of svg.matchAll(/\sid="([^"]+)"/g)) expect(m[1], id).toMatch(/^dbx[0-9a-f]{6}-\d+$/);
    }
  });

  it('every alias points at a real icon, and former names resolve', () => {
    for (const [alias, slug] of Object.entries(catalog.aliases)) expect(catalog.icons[slug], alias).toBeDefined();
    expect(catalog.aliases['delta-live-tables']).toBe('spark-declarative-pipelines');
    expect(catalog.aliases['databricks-workflows']).toBe('lakeflow-jobs');
    expect(catalog.aliases['vector-search']).toBe('ai-search');
    expect(catalog.aliases['ai-bi-genie-spaces']).toBe('genie-agents');
    expect(catalog.aliases.ai).toBeUndefined();
  });
});

describe('icon resolution across packs', () => {
  it('a prefix picks the pack; otherwise the home pack wins a shared name', () => {
    expect(icons.resolveService('databricks:UC')).toMatchObject({ kind: 'databricks', id: 'databricks:unity-catalog', label: 'Unity Catalog' });
    expect(icons.resolveService('ai-search')).toMatchObject({ kind: 'azure', id: 'cognitive-search' });
    expect(icons.resolveService('ai-search', 'databricks')).toMatchObject({ kind: 'databricks', id: 'databricks:ai-search' });
    expect(icons.resolveService('azure:ai-search', 'databricks')).toMatchObject({ kind: 'azure', id: 'cognitive-search' });
    expect(icons.resolveService('databricks', 'databricks')).toMatchObject({ kind: 'databricks', id: 'databricks:databricks' });
    expect(icons.resolveService('databricks')).toMatchObject({ kind: 'azure', id: 'azure-databricks' });
  });

  it('falls back to the other pack for names only it knows, and keeps generic participants', () => {
    expect(icons.resolveService('unity-catalog')).toMatchObject({ kind: 'databricks' });
    expect(icons.resolveService('key-vault', 'databricks')).toMatchObject({ kind: 'azure', id: 'key-vaults' });
    expect(icons.resolveService('users', 'databricks')).toMatchObject({ kind: 'azure' });
    expect(icons.resolveService('internet', 'databricks')).toMatchObject({ kind: 'generic' });
  });

  it('gives each pack its own SVG symbol ids', () => {
    expect(icons.iconSymbolId('key-vaults')).toBe('ds-az-key-vaults');
    expect(icons.iconSymbolId('databricks:unity-catalog')).toBe('ds-dbx-unity-catalog');
    expect(icons.iconSymbol('databricks:unity-catalog').body).toMatch(/^<g fill="none">/);
  });

  it('suggests Databricks names with their prefix in an Azure diagram', () => {
    const r = validateSpec(mixed([{ id: 'u', service: 'unity-catalogg' }]));
    expect(r.errors[0].code).toBe('ref.service');
    expect(r.errors[0].message).toMatch(/Did you mean "databricks:unity-catalog"\?/);
  });
});

describe('Databricks icons in Azure diagrams', () => {
  it('render clean, in the Azure look, with one Databricks symbol per product', async () => {
    const p = await prepare(mixed());
    expect(isFailure(p), JSON.stringify(p.errors ?? p.qa?.errors)).toBe(false);
    expect(p.theme.id).toBe('azure');
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    const symbols = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
    expect(symbols).toEqual(
      expect.arrayContaining(['ds-az-azure-databricks', 'ds-az-storage-accounts', 'ds-dbx-spark-declarative-pipelines', 'ds-dbx-unity-catalog', 'ds-dbx-sql-warehouse']),
    );
    expect(svg).toMatch(/>Unity Catalog</);
  });

  it('reach PPTX (SVG with PNG fallback, alt text), draw.io and PDF', async () => {
    const p = await prepare(mixed());
    const zip = await JSZip.loadAsync((await renderPptx(p.scene, p.theme, p.fonts)).buffer);
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(xml).toMatch(/descr="Unity Catalog"/);
    expect(Object.keys(zip.files).filter((f) => f.endsWith('.svg')).length).toBeGreaterThanOrEqual(6);
    const drawio = renderDrawio(p.scene, p.theme, p.fonts);
    expect(XMLValidator.validate(drawio)).toBe(true);
    expect((drawio.match(/image=data:image\/svg\+xml,/g) ?? []).length).toBeGreaterThanOrEqual(6);
    const pdf = (await renderPdf(p.scene, p.theme, p.fonts)).toString('latin1');
    expect((pdf.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('the CLI searches the Databricks catalog by product and former names', async () => {
    const { execFileSync } = await import('node:child_process');
    const cli = path.join(ROOT, 'scripts', 'dist', 'cli.js');
    const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    expect(run('databricks', 'icons', 'dlt').results[0].id).toBe('spark-declarative-pipelines');
    expect(run('databricks', 'icons', 'unity', 'catalog').results[0].id).toBe('unity-catalog');
    const dir = tmpDir('dbx-cli');
    fs.writeFileSync(path.join(dir, 'mixed.json'), JSON.stringify(mixed()));
    const r = run('render', path.join(dir, 'mixed.json'), '--out', dir);
    expect(r.ok).toBe(true);
  });
});

/** A Databricks diagram: unprefixed names are Databricks products. */
const dbx = (body, extra = {}) => ({ version: '1.0', type: 'databricks-architecture', altitude: 'management', title: 'Raw events become trusted dashboards', body, ...extra });

describe('databricks-architecture', () => {
  it('defaults to the databricks theme and resolves unprefixed names to Databricks products', async () => {
    const p = await prepare(dbx({ children: [{ id: 'search', service: 'ai-search' }, { id: 'kv', service: 'key-vault' }] }));
    expect(isFailure(p)).toBe(false);
    expect(p.theme.id).toBe('databricks');
    expect(p.theme.font.family).toBe('DM Sans');
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    expect(svg).toMatch(/<symbol id="ds-dbx-ai-search"/);
    expect(svg).toMatch(/<symbol id="ds-az-key-vaults"/);
    expect(svg).toMatch(/>Databricks AI Search</);
  });

  it('names planes, panels and stages, and labels the other boundaries by default', () => {
    const r = validateSpec(dbx({ children: [{ id: 'p', boundary: 'plane', children: [{ id: 'c', service: 'clusters' }] }] }));
    expect(r.errors.map((e) => e.code)).toContain('ref.boundary-label');
    expect(r.errors[0].message).toMatch(/name the plane \(for example "Control plane"\)/);
  });

  it('warns when the Databricks logo is used as a product', () => {
    const r = validateSpec(dbx({ children: [{ id: 'logo', service: 'databricks' }] }));
    expect(r.warnings.map((w) => w.code)).toContain('ref.logo');
  });

  it('draws each Databricks boundary in the brand look, and stages as Microsoft grey panels in the Azure theme', async () => {
    const body = {
      layout: 'row',
      children: [
        { id: 'acct', boundary: 'databricks-account', children: [{ id: 'cp', boundary: 'plane', label: 'Control plane', children: [{ id: 'uc', service: 'unity-catalog' }] }] },
        { id: 'ingest', boundary: 'stage', label: 'Ingest', children: [{ id: 'al', service: 'auto-loader' }] },
        { id: 'bronze', boundary: 'bronze', children: [{ id: 'raw', label: 'Raw events' }] },
      ],
    };
    const p = await prepare(dbx(body));
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    expect(svg).toMatch(/<symbol id="ds-dbx-databricks"/); // the logo on the account boundary
    expect(svg).toMatch(/>Databricks account</);
    expect(svg).toMatch(/>Bronze</);
    expect(p.scene.elements.some((e) => e.id === 'ingest--head')).toBe(true);
    const az = await prepare(dbx(body, { theme: 'azure' }));
    expect(az.scene.elements.some((e) => e.id === 'ingest--head')).toBe(false);
    const acct = az.scene.elements.find((e) => e.id === 'acct');
    expect(acct.paint.stroke).toBe('#7F7F7F'); // the Azure theme's managed-elsewhere grey
  });

  it('labels products on the navy platform block in a colour that reads on navy', async () => {
    const p = await prepare(dbx({ children: [{ id: 'platform', boundary: 'platform', children: [{ id: 'jobs', service: 'jobs' }] }] }));
    expect(isFailure(p)).toBe(false);
    const label = p.scene.elements.find((e) => e.id === 'jobs--label');
    expect(label.color).toBe('#FFFFFF'); // ink on navy fails contrast, so the label turns white
    const svg = await renderSvg(p.scene, { theme: p.theme, fonts: p.fonts });
    expect(svg).toMatch(/id="platform--label"[^>]*fill="#FFFFFF">.*Databricks Data.*Intelligence Platform/); // white, wrapped to the block
  });
});

describe('governance diagrams', () => {
  it('boxes side by side share one size, so a row of Databricks objects reads as a set', async () => {
    const p = await prepare({
      version: '1.0',
      type: 'azure-architecture',
      altitude: 'management',
      title: 'Each team reaches only the catalog its group is granted',
      body: {
        children: [
        {
          id: 'slice',
          boundary: 'group',
          label: 'Data engineering slice',
          layout: 'row',
          children: [
            { id: 'scope', label: 'Secret scope', description: 'eng-secrets' },
            { id: 'catalog', label: 'eng catalog', description: 'Managed location in the slice container' },
            { id: 'credential', label: 'Storage credential' },
          ],
        },
        ],
      },
    });
    expect(isFailure(p)).toBe(false);
    const boxes = ['scope', 'catalog', 'credential'].map((id) => p.scene.elements.find((e) => e.id === id && e.kind === 'shape'));
    expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
    expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
  });
});
