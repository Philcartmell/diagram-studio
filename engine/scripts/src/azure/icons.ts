/**
 * The Azure icon catalog: official Azure architecture icons (assets/azure-icons),
 * neutral glyphs for non-Azure participants, and user-supplied icons dropped into
 * azure-icons/ in the user folder. Built by tools/build-azure-icons.mjs. Services
 * resolve here for both icon packs: Azure, and Databricks (../databricks/icons.ts).
 *
 * Microsoft's terms for these icons: use one only for the product it was designed
 * for, never crop, flip, rotate, distort or recolour it, and show the full service
 * name near it. The renderer draws them square, in their own colours, always labelled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { databricksIconFile, databricksIconInfo, databricksNames, databricksSlug } from '../databricks/icons.js';
import { closest, dirs, humanize, isPlainObject, scoreFields } from '../util.js';

export interface AzureIconInfo {
  label: string;
  category: string;
  categories?: string[];
  source?: string;
  curated?: boolean;
  aliases?: string[];
  arm?: string[];
}

interface Catalog {
  description: string;
  source: string;
  count: number;
  icons: Record<string, AzureIconInfo>;
  generic: Record<string, { label: string; glyph: string; aliases?: string[] }>;
  missing: Record<string, { label: string; aliases: string[]; note: string }>;
  aliases: Record<string, string>;
  arm: Record<string, string>;
}

/** The icon packs a service name can come from. A diagram type has a home pack, tried first. */
export type IconPack = 'azure' | 'databricks';

export type ResolvedService =
  | { kind: 'azure'; id: string; label: string; category: string; file: string }
  /** id is "databricks:<slug>", so canonical ids never clash with Azure ones. */
  | { kind: 'databricks'; id: string; label: string; category: string; file: string }
  | { kind: 'generic'; id: string; label: string; glyph: string }
  | { kind: 'missing'; id: string; label: string; note: string };

export type ProductIcon = Extract<ResolvedService, { file: string }>;

/** An official product icon (Azure, Databricks or custom), drawn in its own colours. */
export function isProductIcon(r: ResolvedService | undefined): r is ProductIcon {
  return r?.kind === 'azure' || r?.kind === 'databricks';
}

const PREFIX = /^(azure|databricks):(.+)$/;

/** The pack a diagram type tries first for unprefixed names. */
export function homePackOf(type: string): IconPack {
  return type === 'databricks-architecture' ? 'databricks' : 'azure';
}

const ICON_DIR = () => path.join(dirs.assets, 'azure-icons');

let catalog: Catalog | undefined;
let custom: Map<string, { label: string; file: string; aliases: string[] }> | undefined;

function load(): Catalog {
  if (!catalog) catalog = JSON.parse(fs.readFileSync(path.join(ICON_DIR(), 'catalog.json'), 'utf8')) as Catalog;
  return catalog;
}

/** Icons dropped into <user folder>/azure-icons/<id>.svg, with optional labels.json. */
function loadCustom() {
  if (custom) return custom;
  custom = new Map();
  const dir = dirs.customIcons;
  if (!fs.existsSync(dir)) return custom;
  let meta: Record<string, unknown> = {};
  const metaFile = path.join(dir, 'labels.json');
  if (fs.existsSync(metaFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (isPlainObject(raw)) meta = raw;
    } catch {
      // A malformed labels.json leaves labels derived from file names.
    }
  }
  const known = load().missing;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.toLowerCase().endsWith('.svg')) continue;
    const id = f
      .replace(/\.svg$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const m = isPlainObject(meta[id]) ? (meta[id] as { label?: unknown; aliases?: unknown }) : {};
    const label = typeof m.label === 'string' ? m.label : known[id]?.label ?? humanize(id);
    const aliases = Array.isArray(m.aliases) ? m.aliases.filter((a): a is string => typeof a === 'string') : known[id]?.aliases ?? [];
    custom.set(id, { label, file: path.join(dir, f), aliases });
  }
  return custom;
}

/** Forget cached catalogs (tests add custom icons at run time). */
export function resetAzureIcons(): void {
  catalog = undefined;
  custom = undefined;
  symbolCache.clear();
}

/**
 * Resolve an icon id or alias (case-insensitive) to an Azure or Databricks icon, a generic
 * glyph or a missing-icon note. "databricks:" or "azure:" picks the pack; otherwise the
 * home pack is tried first, so a name both packs know ("ai-search") follows the diagram type.
 */
export function resolveService(name: string, home: IconPack = 'azure'): ResolvedService | undefined {
  const key = name.trim().toLowerCase();
  const m = PREFIX.exec(key);
  if (m) return m[1] === 'databricks' ? resolveDatabricks(m[2]) : resolveAzure(m[2]);
  return home === 'databricks' ? (resolveDatabricks(key) ?? resolveAzure(key)) : (resolveAzure(key) ?? resolveDatabricks(key));
}

function resolveDatabricks(key: string): ResolvedService | undefined {
  const slug = databricksSlug(key);
  const info = slug ? databricksIconInfo(slug) : undefined;
  return slug && info ? { kind: 'databricks', id: `databricks:${slug}`, label: info.label, category: info.category, file: databricksIconFile(slug) } : undefined;
}

function resolveAzure(key: string): ResolvedService | undefined {
  const c = load();
  const cu = loadCustom();
  const direct = (id: string): ResolvedService | undefined => {
    const own = cu.get(id);
    if (own) return { kind: 'azure', id, label: own.label, category: 'custom', file: own.file };
    const ic = c.icons[id];
    if (ic) return { kind: 'azure', id, label: ic.label, category: ic.category, file: path.join(ICON_DIR(), 'svg', `${id}.svg`) };
    const g = c.generic[id];
    if (g) return { kind: 'generic', id, label: g.label, glyph: g.glyph };
    const m = c.missing[id];
    if (m) return { kind: 'missing', id, label: m.label, note: m.note };
    return undefined;
  };
  const hit = direct(key);
  if (hit) return hit;
  for (const [id, own] of cu) if (own.aliases.includes(key)) return direct(id);
  const alias = c.aliases[key];
  return alias ? direct(alias) : undefined;
}

/** Every id and alias, for "did you mean" suggestions; the other pack's names carry its prefix. */
export function serviceNames(home: IconPack = 'azure'): string[] {
  const c = load();
  const azure = [...Object.keys(c.icons), ...Object.keys(c.generic), ...Object.keys(c.aliases), ...loadCustom().keys()];
  const dbx = databricksNames();
  return home === 'databricks' ? [...dbx, ...azure] : [...azure, ...dbx.map((n) => `databricks:${n}`)];
}

export function suggestService(name: string, home: IconPack = 'azure'): string | undefined {
  const key = name.trim().toLowerCase().replace(PREFIX, '$2');
  const names = serviceNames(home);
  // Compare without pack prefixes, then suggest the name as it must be written (home pack first).
  const bare = names.map((n) => n.replace(PREFIX, '$2'));
  const written = (b: string | undefined) => (b === undefined ? undefined : names[bare.indexOf(b)]);
  // Prefer a containment match ("kubernetes" → "kubernetes-services") over edit distance.
  const contained = bare.filter((n) => n.includes(key) || key.includes(n)).sort((a, b) => a.length - b.length);
  return written(closest(key, bare) ?? contained[0]);
}

export interface IconSearchHit {
  id: string;
  label: string;
  category: string;
  kind: 'azure' | 'generic' | 'missing';
  aliases?: string[];
  arm?: string[];
  score: number;
}

/** Ranked search over ids, labels, aliases, categories and ARM types. */
export function searchServices(query: string, limit = 25): IconSearchHit[] {
  const c = load();
  const words = query.toLowerCase().split(/[\s/,]+/).filter(Boolean);
  const q = query.trim().toLowerCase();
  const joined = words.join('-');
  /** Exact hits on the whole query: an id or alias ("entra id"), or an ARM type ("Microsoft.Web/sites"). */
  const exact = (id: string, aliases: string[] = [], arm: string[] = []) =>
    (id === joined || aliases.includes(joined) ? 20 : 0) + (arm.includes(q) ? 20 : arm.some((t) => t.startsWith(`${q}#`)) ? 10 : 0);
  const hits: IconSearchHit[] = [];
  const score = (fields: string[]): number => scoreFields(words, fields);
  for (const [id, ic] of Object.entries(c.icons)) {
    const s = words.length ? score([id, ic.label, ...(ic.aliases ?? []), ic.category, ...(ic.arm ?? [])]) : 1;
    if (s > 0) hits.push({ id, label: ic.label, category: ic.category, kind: 'azure', aliases: ic.aliases, arm: ic.arm, score: s + (ic.curated ? 1 : 0) + exact(id, ic.aliases, ic.arm) });
  }
  for (const [id, g] of Object.entries(c.generic)) {
    const s = words.length ? score([id, g.label, ...(g.aliases ?? []), 'generic']) : 1;
    if (s > 0) hits.push({ id, label: g.label, category: 'generic (not an Azure icon)', kind: 'generic', aliases: g.aliases, score: s + exact(id, g.aliases) });
  }
  for (const [id, own] of loadCustom()) {
    const s = words.length ? score([id, own.label, ...own.aliases, 'custom']) : 1;
    if (s > 0) hits.push({ id, label: own.label, category: 'custom', kind: 'azure', aliases: own.aliases, score: s + 2 });
  }
  for (const [id, m] of Object.entries(c.missing)) {
    if (loadCustom().has(id)) continue;
    const s = words.length ? score([id, m.label, ...m.aliases]) : 0;
    if (s > 0) hits.push({ id, label: m.label, category: 'not in the icon pack', kind: 'missing', aliases: m.aliases, score: s + exact(id, m.aliases) });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}

/** Icon id for an ARM resource type, honouring `kind` qualifiers (e.g. functionapp). */
export function iconForArmType(type: string, kind?: string): string | undefined {
  const c = load();
  const t = type.toLowerCase();
  if (kind) {
    const tokens = kind.toLowerCase().split(/[\s,]+/);
    for (const [k, id] of Object.entries(c.arm)) {
      const hash = k.indexOf('#');
      if (hash < 0 || k.slice(0, hash) !== t) continue;
      const want = k.slice(hash + 1);
      if (tokens.some((tok) => tok === want || tok.includes(want))) return id;
    }
  }
  return c.arm[t];
}

export function catalogInfo(): { source: string; count: number; description: string } {
  const c = load();
  return { source: c.source, count: c.count, description: c.description };
}

export function azureIconInfo(id: string): AzureIconInfo | undefined {
  return load().icons[id];
}

// ---- Embedding ------------------------------------------------------------

export interface IconSymbol {
  id: string;
  viewBox: [number, number, number, number];
  /** Inner SVG markup (no root element), ids already namespaced. */
  body: string;
  /** The complete standalone SVG document. */
  svg: string;
}

const symbolCache = new Map<string, IconSymbol>();

/** The id of an icon's <symbol> in an SVG document ("ds-az-key-vaults", "ds-dbx-unity-catalog"). */
export function iconSymbolId(id: string): string {
  const m = PREFIX.exec(id);
  return m?.[1] === 'databricks' ? `ds-dbx-${m[2]}` : `ds-az-${m ? m[2] : id}`;
}

/** The normalised SVG of a resolved product icon (Azure, Databricks or custom), by canonical id. */
export function iconSymbol(id: string): IconSymbol | undefined {
  const hit = symbolCache.get(id);
  if (hit) return hit;
  const r = resolveService(id);
  if (!isProductIcon(r)) return undefined;
  let svg = fs.readFileSync(r.file, 'utf8').trim();
  const root = /<svg\b[^>]*>/.exec(svg);
  if (!root) return undefined;
  const vbm = /viewBox="([^"]+)"/.exec(root[0]);
  const nums = (vbm?.[1] ?? '0 0 18 18').trim().split(/[\s,]+/).map(Number);
  const viewBox: [number, number, number, number] = [nums[0] || 0, nums[1] || 0, nums[2] || 18, nums[3] || 18];
  if (r.category === 'custom') svg = namespaceIds(svg, `azc-${id}`);
  const body = svg.slice(svg.indexOf(root[0]) + root[0].length, svg.lastIndexOf('</svg>')).trim();
  const sym: IconSymbol = { id: r.id, viewBox, body, svg };
  symbolCache.set(id, sym);
  return sym;
}

/** Custom icons come straight from users: namespace their ids like the build tool does. */
function namespaceIds(svg: string, prefix: string): string {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const map = new Map(ids.map((x, i) => [x, `${prefix}-${i}`]));
  return svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/\sid="([^"]+)"/g, (_, x) => ` id="${map.get(x)}"`)
    .replace(/url\(#([^)]+)\)/g, (m, x) => (map.has(x) ? `url(#${map.get(x)})` : m))
    .replace(/(xlink:)?href="#([^"]+)"/g, (m, _xl, x) => (map.has(x) ? `href="#${map.get(x)}"` : m));
}

/** A standalone SVG of the icon sized to `px`, for rasterising (PDF, PPTX fallback, previews). */
export function iconSvgAt(id: string, px: number): string | undefined {
  const s = iconSymbol(id);
  if (!s) return undefined;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${s.viewBox.join(' ')}" preserveAspectRatio="xMidYMid meet">${s.body}</svg>`;
}
