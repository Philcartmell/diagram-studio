// azure-architecture: the icon catalog, validation, layout guarantees, the ARM
// importer and Azure icons in every export format.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, TESTS, cleanTmp, dep, examples, load, nodeBoxes, tmpDir } from './helpers.mjs';

const { prepare, isFailure } = await load('pipeline.js');
const { validateSpec } = await load('validate/spec.js');
const icons = await load('azure/icons.js');
const { dirs } = await load('util.js');
const { importAzure } = await load('azure/import.js');
const { renderPptx } = await load('export/pptx.js');
const { renderDrawio } = await load('export/drawio.js');
const { renderPdf } = await load('export/pdf.js');
const JSZip = await dep('jszip');
const { XMLValidator } = await dep('fast-xml-parser');
const { PNG } = await dep('pngjs');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'azure-icons', 'catalog.json'), 'utf8'));
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(TESTS, 'fixtures', 'azure', f), 'utf8'));
const ex = (name) => examples().find((e) => e.name === name);

const spec = (body, extra = {}) => ({
  version: '1.0',
  type: 'azure-architecture',
  altitude: 'management',
  title: 'The web tier reaches its database through a private endpoint',
  body,
  ...extra,
});

afterAll(() => cleanTmp('azure-'));

describe('Azure icon catalog', () => {
  it('has one normalised SVG per icon, each with a viewBox and namespaced ids', () => {
    const ids = Object.keys(catalog.icons);
    expect(ids.length).toBeGreaterThan(600);
    const seen = new Set();
    for (const id of ids) {
      const svg = fs.readFileSync(path.join(ROOT, 'assets', 'azure-icons', 'svg', `${id}.svg`), 'utf8');
      expect(svg, id).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+">/);
      expect(svg, id).not.toMatch(/<title>|<style|class="/);
      expect(XMLValidator.validate(svg), id).toBe(true);
      for (const m of svg.matchAll(/ id="([^"]+)"/g)) {
        expect(seen.has(m[1]), `${id}: id ${m[1]} also used by another icon`).toBe(false);
        seen.add(m[1]);
      }
    }
  });

  it('every alias and ARM type points at a real icon, generic glyph or missing-icon note', () => {
    const known = new Set([...Object.keys(catalog.icons), ...Object.keys(catalog.generic), ...Object.keys(catalog.missing)]);
    for (const [alias, id] of Object.entries(catalog.aliases)) expect(known.has(id), alias).toBe(true);
    for (const [type, id] of Object.entries(catalog.arm)) expect(catalog.icons[id], type).toBeTruthy();
    expect(catalog.icons['azure-a'], 'the Azure brand mark is not a service icon').toBeUndefined();
  });

  it('resolves ids, aliases (any case) and ARM types to official names', () => {
    expect(icons.resolveService('aks')).toMatchObject({ kind: 'azure', id: 'kubernetes-services', label: 'Azure Kubernetes Service' });
    expect(icons.resolveService('Key-Vault')).toMatchObject({ kind: 'azure', id: 'key-vaults', label: 'Azure Key Vault' });
    expect(icons.resolveService('internet')).toMatchObject({ kind: 'generic', glyph: 'cloud' });
    expect(icons.resolveService('entra-id')).toMatchObject({ kind: 'missing' });
    expect(icons.iconForArmType('Microsoft.Web/sites', 'functionapp,linux')).toBe('function-apps');
    expect(icons.iconForArmType('Microsoft.Web/sites', 'app,linux')).toBe('app-services');
    expect(icons.iconForArmType('Microsoft.CognitiveServices/accounts', 'OpenAI')).toBe('azure-openai');
    expect(icons.searchServices('Microsoft.Web/sites', 3)[0].id).toBe('app-services');
    expect(icons.searchServices('entra id', 3)[0]).toMatchObject({ id: 'entra-id', kind: 'missing' });
  });

  it('picks up icons dropped into the user folder, so missing icons can be supplied', () => {
    const dir = dirs.customIcons;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'entra-id.svg');
    fs.writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h18v18H0z"/></svg>');
    try {
      icons.resetAzureIcons();
      expect(icons.resolveService('azure-ad')).toMatchObject({ kind: 'azure', id: 'entra-id', label: 'Microsoft Entra ID' });
      expect(icons.iconSymbol('entra-id').body).toContain('url(#azc-entra-id-0)');
    } finally {
      fs.rmSync(file);
      icons.resetAzureIcons();
    }
  });
});

describe('azure-architecture validation', () => {
  it('suggests the nearest icon for an unknown service', () => {
    const r = validateSpec(spec({ children: [{ id: 'k', service: 'keyvalt' }] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/"keyvalt" is not an Azure icon id or alias\. Did you mean "keyvault"\?/);
  });

  it('explains how to add a missing icon (Microsoft Entra ID)', () => {
    const r = validateSpec(spec({ children: [{ id: 'idp', service: 'entra-id' }] }));
    expect(r.errors[0].code).toBe('ref.service-missing');
    expect(r.errors[0].message).toMatch(/entra-id\.svg in the azure-icons folder of your Diagram Studio user folder/);
  });

  it('rejects flows into a containing boundary or an invisible group, and unknown flow types', () => {
    const r = validateSpec(
      spec({
        children: [
          { id: 'vnet', boundary: 'virtual-network', children: [{ id: 'vm', service: 'vm' }] },
          { id: 'paas', children: [{ id: 'sql', service: 'sql-database' }] },
        ],
        flows: [
          { from: 'vm', to: 'vnet' },
          { from: 'vm', to: 'paas' },
          { from: 'vm', to: 'sql', type: 'nope' },
        ],
      }),
    );
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain('ref.flow-nesting');
    expect(codes).toContain('ref.flow');
    expect(codes).toContain('ref.flow-type');
  });

  it('warns about steps without text, text without a step, and an NSG on a non-subnet', () => {
    const r = validateSpec(
      spec({
        children: [{ id: 'vnet', boundary: 'virtual-network', nsg: true, children: [{ id: 'a', service: 'vm' }, { id: 'b', service: 'vm', label: 'Second VM' }] }],
        flows: [{ from: 'a', to: 'b', step: 1 }, { from: 'b', to: 'a', step: 2 }],
        steps: [{ step: 1, text: 'One.' }, { step: 3, text: 'Three.' }],
      }),
    );
    const msgs = r.warnings.map((w) => w.message).join('\n');
    expect(msgs).toMatch(/step 3 is described but no flow/);
    expect(msgs).toMatch(/steps 2 appear on the diagram but have no text/);
    expect(msgs).toMatch(/network security groups attach to subnets/);
  });

  it('defaults to the azure theme and counts services, not boundaries, toward the altitude', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `vm-${i}`, service: 'vm' }));
    const r = validateSpec(spec({ children: [{ id: 'vnet', boundary: 'virtual-network', children: many }] }, { altitude: 'executive' }));
    expect(r.errors.map((e) => e.code)).toContain('altitude.nodes');
    const ok = validateSpec(spec({ children: many.slice(0, 9) }, { altitude: 'executive' }));
    expect(ok.ok).toBe(true);
    expect(ok.spec.theme).toBe('azure');
  });
});

describe('azure-architecture layout', () => {
  it('keeps every service inside its boundaries and lines private endpoints up with their services', async () => {
    const p = await prepare(ex('02-zone-redundant-web-app').spec);
    expect(isFailure(p)).toBe(false);
    const boxes = nodeBoxes(p.scene);
    const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    expect(inside(boxes.get('agw'), boxes.get('snet-agw'))).toBe(true);
    expect(inside(boxes.get('snet-pe'), boxes.get('vnet'))).toBe(true);
    expect(inside(boxes.get('vnet'), boxes.get('region'))).toBe(true);
    const cy = (b) => b.y + b.h / 2;
    for (const [pe, svc] of [['pe-kv', 'kv'], ['pe-sql', 'sql'], ['pe-st', 'st']]) expect(cy(boxes.get(pe)), `${pe} level with ${svc}`).toBe(cy(boxes.get(svc)));
    // Every flow from a private endpoint to its service is one straight segment.
    for (const c of p.scene.elements.filter((e) => e.kind === 'connector' && e.from.startsWith('pe-'))) expect(c.points.length, c.id).toBe(2);
  });

  it('draws step badges beside their flows, never on an icon', async () => {
    const p = await prepare(ex('01-document-classification').spec);
    const badges = p.scene.elements.filter((e) => e.kind === 'shape' && e.role === 'badge' && !e.id.startsWith('ds-workflow'));
    expect(badges.length).toBe(8);
    const iconsDrawn = p.scene.elements.filter((e) => e.kind === 'icon');
    for (const b of badges)
      for (const i of iconsDrawn) {
        const overlap = b.x < i.x + i.size && b.x + b.w > i.x && b.y < i.y + i.size && b.y + b.h > i.y;
        expect(overlap, `${b.id} overlaps ${i.id}`).toBe(false);
      }
    expect(p.scene.meta.notes).toMatch(/Workflow:\n1a\. Users upload/);
  });

  it('gives each flow type its own colour and badge shape, with legend entries', async () => {
    const p = await prepare(ex('03-multi-region-aks').spec);
    const shapes = new Set(p.scene.elements.filter((e) => e.kind === 'shape' && e.role === 'badge').map((e) => e.shape));
    expect([...shapes].sort()).toEqual(['ellipse', 'rect', 'triangle']);
    const strokes = new Set(p.scene.elements.filter((e) => e.kind === 'connector').map((e) => e.paint.stroke));
    expect(strokes.size).toBe(3);
    const legend = p.scene.elements.filter((e) => e.kind === 'text' && e.role === 'legend').map((e) => e.lines[0]);
    expect(legend).toEqual(['Inbound request', 'Egress through the hub firewall', 'Image pull and diagnostics']);
  });

  it('keeps the structure when the theme changes', async () => {
    for (const theme of ['print', 'bold', 'sketch']) {
      const p = await prepare(ex('02-zone-redundant-web-app').spec, { theme });
      expect(isFailure(p)).toBe(false);
      expect(p.errors, theme).toEqual([]);
      const boxes = nodeBoxes(p.scene);
      const b = boxes.get('kv');
      const v = boxes.get('region');
      expect(b.x >= v.x && b.x + b.w <= v.x + v.w, theme).toBe(true);
    }
  });

  it('"frame": "figure" draws no title, as in the Architecture Center', async () => {
    const s = structuredClone(ex('01-document-classification').spec);
    s.body.frame = 'figure';
    const p = await prepare(s);
    expect(p.errors).toEqual([]);
    expect(p.scene.elements.some((e) => e.role === 'title' || e.role === 'subtitle')).toBe(false);
    expect(p.scene.meta.title).toBe(s.title);
  });
});

describe('ARM import', () => {
  it('places resources in the subnets they reference and folds the noise', () => {
    const { spec: s, report } = importAzure(fixture('arm-web-baseline.json'), { source: 'arm-web-baseline.json' });
    expect(report.format).toBe('arm-template');
    expect(report.regions).toEqual(['UK South']);
    const text = JSON.stringify(s);
    const subnet = (name) => {
      const find = (items) => {
        for (const it of items ?? []) {
          if (it.boundary === 'subnet' && it.label === name) return it;
          const hit = find(it.children);
          if (hit) return hit;
        }
      };
      return find(s.body.children);
    };
    expect(subnet('snet-agw').children.map((c) => c.id)).toEqual(['agw-contoso']);
    expect(subnet('snet-app').children.map((c) => c.id)).toEqual(['app-contoso']);
    expect(subnet('snet-app').nsg).toBe(true);
    expect(subnet('snet-mgmt').children.map((c) => c.id), 'VM placed through its NIC').toEqual(['vm-jumpbox']);
    expect(subnet('snet-pe').children.map((c) => c.id)).toEqual(['pe-kv', 'pe-sql']);
    expect(subnet('snet-unused')).toBeUndefined();
    expect(text).not.toMatch(/vm-jumpbox-nic|asp-contoso|osdisk|"master"|nsg-app|pip-agw/);
    expect(s.body.flows).toEqual(
      expect.arrayContaining([
        { from: 'agw-contoso', to: 'app-contoso' },
        { from: 'pe-kv', to: 'kv-contoso' },
        { from: 'pe-sql', to: 'sqldb-orders' },
        expect.objectContaining({ from: 'private-dns-zones', to: 'vnet-spoke', label: 'Linked' }),
      ]),
    );
    expect(report.unmapped).toEqual([{ type: 'Microsoft.Contoso/widgets', count: 1 }]);
    expect(report.skipped.find((k) => k.type === 'Microsoft.Network/networkInterfaces').reason).toMatch(/virtual machine/);
  });

  it('produces a draft that validates and renders clean', async () => {
    const { spec: s } = importAzure(fixture('arm-web-baseline.json'));
    const p = await prepare(s);
    expect(isFailure(p), JSON.stringify(p.validationErrors ?? [])).toBe(false);
    expect(p.errors).toEqual([]);
  });

  it('reads an az resource list and Resource Graph output', () => {
    const list = fixture('resource-list.json');
    const a = importAzure(list);
    expect(a.report.format).toBe('resource-list');
    expect(a.report.regions).toEqual(['East US 2', 'West Europe']);
    const b = importAzure({ data: list });
    expect(b.report.nodes).toBe(a.report.nodes);
    const services = JSON.stringify(a.spec.body);
    expect(services).toMatch(/"service":"kubernetes-services"/);
    expect(services).toMatch(/"service":"front-door-and-cdn-profiles"/);
  });

  it('rejects input that is neither', () => {
    expect(() => importAzure({ hello: 'world' })).toThrow(/Not an ARM template/);
  });
});

describe('Azure icons in exports', () => {
  it('PPTX embeds each icon as SVG with a real PNG fallback and groups each service', async () => {
    const p = await prepare(ex('02-zone-redundant-web-app').spec);
    const { buffer, notes } = await renderPptx(p.scene, p.theme, p.fonts);
    const zip = await JSZip.loadAsync(buffer);
    const svgs = Object.keys(zip.files).filter((f) => f.endsWith('.svg'));
    expect(svgs.length).toBeGreaterThan(10);
    for (const f of svgs.slice(0, 5)) {
      const png = PNG.sync.read(await zip.file(f.replace(/-(\d+)\.svg$/, (_m, k) => `-${Number(k) - 1}.png`)).async('nodebuffer'));
      expect(png.width, f).toBe(192);
    }
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(xml).toMatch(/<asvg:svgBlip/);
    expect(xml).toMatch(/descr="Azure Key Vault"/);
    expect(xml).toMatch(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="kv"\/>/);
    expect(xml).toMatch(/typeface="Segoe UI"/);
    expect(notes.join(' ')).toMatch(/same metrics/);
  });

  it('draw.io embeds icons as SVG images and PDF rasterises them', async () => {
    const p = await prepare(ex('01-document-classification').spec);
    const xml = renderDrawio(p.scene, p.theme, p.fonts);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect((xml.match(/image=data:image\/svg\+xml,/g) ?? []).length).toBeGreaterThan(8);
    const pdf = (await renderPdf(p.scene, p.theme, p.fonts)).toString('latin1');
    expect((pdf.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThan(5);
  });

  it('the CLI searches icons and imports ARM', async () => {
    const { execFileSync } = await import('node:child_process');
    const cli = path.join(ROOT, 'scripts', 'dist', 'cli.js');
    const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    expect(run('azure', 'icons', 'aks').results[0].id).toBe('kubernetes-services');
    const dir = tmpDir('azure-cli');
    const out = path.join(dir, 'draft.json');
    const r = run('azure', 'import', path.join(TESTS, 'fixtures', 'azure', 'arm-web-baseline.json'), '--out', out);
    expect(r.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).type).toBe('azure-architecture');
  });
});
