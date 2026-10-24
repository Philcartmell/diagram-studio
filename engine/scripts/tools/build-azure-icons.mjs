// Builds assets/azure-icons/: the official Azure architecture icons, normalised
// for embedding (one svg/<id>.svg per icon) plus catalog.json (labels, aliases,
// categories, ARM resource types).
//
// Usage: npm run azure-icons -- <path to the "Icons" folder of the Azure icon download>
//
// Download the pack from the Azure Architecture Center ("Azure icons"). Icons are
// copied, not redrawn: only the XML is tidied (titles dropped, ids namespaced so many
// icons can share one SVG document, the odd <style> block inlined). Shapes, colours
// and proportions are untouched, as the icon terms require.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED, EXCLUDE, GENERIC, MISSING } from './azure-icons.curated.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../assets/azure-icons');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('Usage: npm run azure-icons -- <path to the Azure icon pack "Icons" folder>');
  process.exit(1);
}

const kebab = (s) =>
  s
    .replace(/\+/g, ' plus ')
    .replace(/[()]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const titleOf = (name) => name.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

/** Inline `.cls{decl}` rules from <style> blocks into style attributes. */
function inlineStyles(svg) {
  const rules = new Map();
  svg = svg.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_, css) => {
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decl = m[2].trim().replace(/;$/, '');
      for (const sel of m[1].split(',')) {
        const cls = sel.trim().replace(/^\./, '');
        if (/^[\w-]+$/.test(cls)) rules.set(cls, [rules.get(cls), decl].filter(Boolean).join(';'));
      }
    }
    return '';
  });
  return svg.replace(/<(\w+)([^>]*?)\sclass="([^"]+)"([^>]*?)(\/?)>/g, (m, tag, a, cls, b, close) => {
    const decl = cls
      .split(/\s+/)
      .map((c) => rules.get(c))
      .filter(Boolean)
      .join(';');
    return `<${tag}${a}${b}${decl ? ` style="${decl}"` : ''}${close}>`;
  });
}

function normalise(raw, id) {
  let svg = raw
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<desc>[\s\S]*?<\/desc>/g, '')
    .replace(/\r?\n\s*/g, ' ');
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) throw new Error(`${id}: no <svg> root`);
  const vb = /viewBox="([^"]+)"/.exec(root[0]);
  let viewBox = vb?.[1];
  if (!viewBox) {
    const w = /\swidth="([\d.]+)/.exec(root[0]);
    const h = /\sheight="([\d.]+)/.exec(root[0]);
    if (!w || !h) throw new Error(`${id}: no viewBox or size`);
    viewBox = `0 0 ${w[1]} ${h[1]}`;
  }
  svg = svg.replace(root[0], `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`);
  svg = inlineStyles(svg);
  // Namespace ids: several icons (and repeats of one icon) share a document.
  const prefix = `az${crypto.createHash('sha1').update(id).digest('hex').slice(0, 6)}`;
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const map = new Map(ids.map((x, i) => [x, `${prefix}-${i}`]));
  svg = svg.replace(/\sid="([^"]+)"/g, (_, x) => ` id="${map.get(x)}"`);
  svg = svg.replace(/url\(#([^)]+)\)/g, (m, x) => (map.has(x) ? `url(#${map.get(x)})` : m));
  svg = svg.replace(/(xlink:)?href="#([^"]+)"/g, (m, xl, x) => (map.has(x) ? `href="#${map.get(x)}"` : m));
  svg = svg.replace(/\sdata-name="[^"]*"/g, '').replace(/\sxmlns:xlink="[^"]*"/g, '');
  svg = svg.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  return { svg: svg + '\n', viewBox };
}

// 1. Read the pack.
const found = new Map(); // id -> { name, file, categories, hash, raw }
for (const dir of fs.readdirSync(src).sort()) {
  const full = path.join(src, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full).sort()) {
    if (!f.toLowerCase().endsWith('.svg')) continue;
    const name = f.replace(/^\d+\s*-icon-service-/, '').replace(/\.svg$/i, '').trim();
    const raw = fs.readFileSync(path.join(full, f), 'utf8');
    const hash = crypto.createHash('sha1').update(raw).digest('hex');
    let id = kebab(name);
    if (EXCLUDE.includes(id)) continue;
    const prev = found.get(id);
    if (prev && prev.hash === hash) {
      if (!prev.categories.includes(dir)) prev.categories.push(dir);
      continue;
    }
    if (prev) {
      // Same name, different drawing: the higher-numbered file is the newer one.
      const num = (x) => Number(/^(\d+)/.exec(x)?.[1] ?? 0);
      if (num(f) > num(prev.file)) {
        found.set(`${id}-${num(prev.file)}`, { ...prev });
      } else {
        id = `${id}-${num(f)}`;
        if (found.has(id)) continue;
      }
    }
    found.set(id, { name, file: f, categories: [dir], hash, raw });
  }
}

// 2. Write normalised SVGs.
fs.rmSync(path.join(OUT, 'svg'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'svg'), { recursive: true });
const icons = {};
for (const id of [...found.keys()].sort()) {
  const it = found.get(id);
  const { svg } = normalise(it.raw, id);
  fs.writeFileSync(path.join(OUT, 'svg', `${id}.svg`), svg);
  icons[id] = { label: titleOf(it.name), category: it.categories[0], categories: it.categories.length > 1 ? it.categories : undefined, source: it.file };
}

// 3. Curated labels, aliases and ARM types.
const aliases = {};
const arm = {};
const problems = [];
const claim = (alias, id, where) => {
  if (icons[alias] && alias !== id) return problems.push(`${where}: alias "${alias}" is also an icon id`);
  if (aliases[alias] && aliases[alias] !== id) return problems.push(`${where}: alias "${alias}" is used for both ${aliases[alias]} and ${id}`);
  aliases[alias] = id;
};
for (const [id, label, al, types] of CURATED) {
  if (!icons[id]) {
    problems.push(`curated entry "${id}" is not an icon in the pack`);
    continue;
  }
  icons[id].label = label;
  icons[id].curated = true;
  if (al.length) icons[id].aliases = al;
  for (const a of al) claim(a, id, id);
  if (types.length) icons[id].arm = types;
  for (const t of types) {
    if (arm[t]) problems.push(`ARM type ${t} maps to both ${arm[t]} and ${id}`);
    arm[t] = id;
  }
}
const generic = {};
for (const [id, label, al, glyph] of GENERIC) {
  if (icons[id]) problems.push(`generic "${id}" clashes with an Azure icon id`);
  generic[id] = { label, glyph, aliases: al.length ? al : undefined };
  for (const a of al) claim(a, id, id);
}
const missing = {};
for (const [id, label, al, note] of MISSING) {
  if (icons[id]) continue; // the pack has it after all
  missing[id] = { label, aliases: al, note };
  for (const a of al) claim(a, id, id);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const catalog = {
  description: 'Official Azure architecture icons (Microsoft). Use only to depict the Microsoft product each was designed for; never crop, flip, rotate, distort or recolour; always show the full service name near the icon.',
  source: path.basename(path.dirname(path.resolve(src))),
  count: Object.keys(icons).length,
  icons,
  generic,
  missing,
  aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
  arm: Object.fromEntries(Object.entries(arm).sort(([a], [b]) => a.localeCompare(b))),
};
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
const bytes = fs.readdirSync(path.join(OUT, 'svg')).reduce((n, f) => n + fs.statSync(path.join(OUT, 'svg', f)).size, 0);
console.log(
  `Wrote ${catalog.count} icons (${(bytes / 1024).toFixed(0)} KB), ${CURATED.length} curated, ${Object.keys(aliases).length} aliases, ${Object.keys(arm).length} ARM types to ${path.relative(process.cwd(), OUT)}`,
);
