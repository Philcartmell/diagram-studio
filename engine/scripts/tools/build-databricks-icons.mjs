// Builds assets/databricks-icons/: Databricks architecture icons, normalised for
// embedding (one svg/<slug>.svg per product) plus catalog.json (labels, aliases,
// categories, descriptions, source URLs).
//
// Usage: npm run databricks-icons -- <databricks-architecture-icons-all.zip, or the folder it unzips to>
//
// Download the zip with "Download all" on the pack's site. The pack
// (https://oieduardorabelo.github.io/databricks-architecture-icons/) is a
// community collection of official Databricks artwork. Icons are copied, not redrawn:
// only the XML is tidied (titles dropped, ids namespaced so many icons can share one
// SVG document, root presentation attributes kept on a wrapping group). Shapes and
// colours are untouched, as Databricks' brand guidelines require.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { ALIASES } from './databricks-icons.curated.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../assets/databricks-icons');
const src = process.argv[2];
const usage = () => {
  console.error('Usage: npm run databricks-icons -- <databricks-architecture-icons-all.zip, or the folder it unzips to (the one holding icons/catalog.json)>');
  process.exit(1);
};
if (!src || !fs.existsSync(src)) usage();

/** Read files from the pack as downloaded (a zip, read in memory) or from the folder it unzips to. */
async function openPack(from) {
  if (fs.statSync(from).isFile()) {
    const zip = await JSZip.loadAsync(fs.readFileSync(from));
    const catalog = Object.keys(zip.files).find((n) => /(^|\/)icons\/catalog\.json$/.test(n));
    if (!catalog) usage();
    const base = catalog.slice(0, -'icons/catalog.json'.length);
    return async (rel) => zip.file(base + rel)?.async('string');
  }
  return async (rel) => {
    const file = path.join(from, ...rel.split('/'));
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  };
}
const read = await openPack(src);
const catalogText = await read('icons/catalog.json');
if (!catalogText) usage();

// Presentation attributes on the source <svg> root that the artwork relies on (fill="none" above all).
const ROOT_PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule'];

function normalise(raw, id) {
  let svg = raw
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<desc>[\s\S]*?<\/desc>/g, '')
    .replace(/\r?\n\s*/g, ' ');
  if (/<script|<foreignObject|\son\w+=|javascript:|(?:xlink:)?href="(?!#)/i.test(svg)) throw new Error(`${id}: unexpected scripting or external reference`);
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) throw new Error(`${id}: no <svg> root`);
  const viewBox = /viewBox="([^"]+)"/.exec(root[0])?.[1];
  if (!viewBox) throw new Error(`${id}: no viewBox`);
  const paint = ROOT_PAINT.flatMap((a) => {
    const m = new RegExp(`\\s${a}="([^"]*)"`).exec(root[0]);
    return m ? [`${a}="${m[1]}"`] : [];
  });
  const end = svg.lastIndexOf('</svg>');
  let body = svg.slice(svg.indexOf(root[0]) + root[0].length, end);
  if (paint.length) body = `<g ${paint.join(' ')}>${body}</g>`;
  svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
  // Namespace ids: several icons (and repeats of one icon) share a document.
  const prefix = `dbx${crypto.createHash('sha1').update(id).digest('hex').slice(0, 6)}`;
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const map = new Map(ids.map((x, i) => [x, `${prefix}-${i}`]));
  svg = svg.replace(/\sid="([^"]+)"/g, (_, x) => ` id="${map.get(x)}"`);
  svg = svg.replace(/url\(#([^)]+)\)/g, (m, x) => (map.has(x) ? `url(#${map.get(x)})` : m));
  svg = svg.replace(/(xlink:)?href="#([^"]+)"/g, (m, _xl, x) => (map.has(x) ? `href="#${map.get(x)}"` : m));
  svg = svg.replace(/\s(role|aria-label|data-name)="[^"]*"/g, '').replace(/\sxmlns:xlink="[^"]*"/g, '');
  svg = svg.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  return svg + '\n';
}

const pack = JSON.parse(catalogText);
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// 1. Write normalised SVGs (the pack's svg/ variant: the published, full-colour artwork).
fs.rmSync(path.join(OUT, 'svg'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'svg'), { recursive: true });
const icons = {};
for (const p of [...pack.products].sort((a, b) => a.slug.localeCompare(b.slug))) {
  // Slugs become file names: accept plain kebab-case only.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) throw new Error(`"${p.slug}" is not a plain kebab-case slug`);
  const raw = await read(`icons/svg/${p.slug}.svg`);
  if (!raw) throw new Error(`${p.slug}: icons/svg/${p.slug}.svg is missing from the pack`);
  fs.writeFileSync(path.join(OUT, 'svg', `${p.slug}.svg`), normalise(raw, p.slug));
  icons[p.slug] = {
    label: p.name,
    category: p.category,
    kind: p.kind === 'logo' ? 'logo' : undefined,
    description: p.description,
    docs: p.docs ?? undefined,
    source: p.sourceUrl ?? undefined,
  };
}

// 2. Aliases: former names recorded in the pack ("Formerly Delta Live Tables (DLT)"), then the curated list.
const aliases = {};
const problems = [];
const claim = (alias, slug, where) => {
  if (icons[alias] && alias !== slug) return problems.push(`${where}: alias "${alias}" is also an icon id`);
  if (aliases[alias] && aliases[alias] !== slug) return problems.push(`${where}: alias "${alias}" is used for both ${aliases[alias]} and ${slug}`);
  if (alias !== slug) aliases[alias] = slug;
};
for (const p of pack.products) {
  // "Lakeflow Declarative Pipelines. Formerly Delta Live Tables (DLT)": each sentence a name,
  // a parenthesis a short form, " / " between alternatives ("AI/BI" stays one word).
  for (const part of (p.aka ?? '').split(/\.\s*/)) {
    const text = part.replace(/^formerly\s+/i, '').trim();
    const names = [text.replace(/\s*\([^)]*\)/g, ''), ...[...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])];
    for (const n of names.flatMap((x) => x.split(/\s+\/\s+/))) if (n.trim()) claim(kebab(n), p.slug, `${p.slug} (aka)`);
  }
}
for (const [slug, al] of ALIASES) {
  if (!icons[slug]) {
    problems.push(`curated aliases for "${slug}": no such icon in the pack`);
    continue;
  }
  for (const a of al) claim(a, slug, slug);
}
for (const [alias, slug] of Object.entries(aliases)) (icons[slug].aliases ??= []).push(alias);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const catalog = {
  description:
    'Official Databricks artwork, from a community pack (unofficial, not endorsed by Databricks). Use an icon only for the Databricks product it depicts and the logo mark only for the Databricks platform; never recolour, crop or distort; label every icon with the product name.',
  source: `${pack.name} (${pack.url})`,
  count: Object.keys(icons).length,
  categories: Object.fromEntries(Object.entries(pack.categories).map(([k, v]) => [k, { label: v.label, color: v.color }])),
  icons,
  aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
};
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
const bytes = fs.readdirSync(path.join(OUT, 'svg')).reduce((n, f) => n + fs.statSync(path.join(OUT, 'svg', f)).size, 0);
console.log(`Wrote ${catalog.count} icons (${(bytes / 1024).toFixed(0)} KB) and ${Object.keys(aliases).length} aliases to ${path.relative(process.cwd(), OUT)}`);
