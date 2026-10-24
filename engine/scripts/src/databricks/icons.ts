/**
 * The Databricks icon catalog (assets/databricks-icons): official Databricks artwork
 * from a community pack, built by tools/build-databricks-icons.mjs.
 *
 * Databricks' brand guidelines: use an icon only for the product it depicts and the
 * logo mark only for the platform itself, and never recolour, crop or distort the
 * artwork. The renderer draws icons square, in their own colours, always labelled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dirs, scoreFields } from '../util.js';

export interface DatabricksIconInfo {
  label: string;
  category: string;
  /** "logo" for brand marks (Databricks, Apache Spark, Apache Iceberg) rather than product icons. */
  kind?: 'logo';
  description?: string;
  docs?: string;
  source?: string;
  aliases?: string[];
}

interface Catalog {
  description: string;
  source: string;
  count: number;
  categories: Record<string, { label: string; color: string }>;
  icons: Record<string, DatabricksIconInfo>;
  aliases: Record<string, string>;
}

const ICON_DIR = () => path.join(dirs.assets, 'databricks-icons');

let catalog: Catalog | undefined;

function load(): Catalog {
  if (!catalog) catalog = JSON.parse(fs.readFileSync(path.join(ICON_DIR(), 'catalog.json'), 'utf8')) as Catalog;
  return catalog;
}

/** The product slug for an id or alias (case-insensitive), or undefined. */
export function databricksSlug(name: string): string | undefined {
  const c = load();
  const key = name.trim().toLowerCase();
  return c.icons[key] ? key : c.aliases[key];
}

export function databricksIconInfo(slug: string): DatabricksIconInfo | undefined {
  return load().icons[slug];
}

export function databricksIconFile(slug: string): string {
  return path.join(ICON_DIR(), 'svg', `${slug}.svg`);
}

/** Every slug and alias, for "did you mean" suggestions. */
export function databricksNames(): string[] {
  const c = load();
  return [...Object.keys(c.icons), ...Object.keys(c.aliases)];
}

export function databricksCatalogInfo(): { source: string; count: number; description: string } {
  const c = load();
  return { source: c.source, count: c.count, description: c.description };
}

export interface DatabricksSearchHit {
  id: string;
  label: string;
  category: string;
  aliases?: string[];
  score: number;
}

/** Ranked search over slugs, labels, aliases, categories and descriptions. */
export function searchDatabricks(query: string, limit = 25): DatabricksSearchHit[] {
  const c = load();
  const words = query.toLowerCase().split(/[\s/,]+/).filter(Boolean);
  const joined = words.join('-');
  const hits: DatabricksSearchHit[] = [];
  for (const [id, ic] of Object.entries(c.icons)) {
    const fields = [id, ic.label, ...(ic.aliases ?? []), c.categories[ic.category]?.label ?? ic.category, ic.description ?? ''];
    const s = words.length ? scoreFields(words, fields) : 1;
    const exact = id === joined || (ic.aliases ?? []).includes(joined) ? 20 : 0;
    if (s > 0) hits.push({ id, label: ic.label, category: c.categories[ic.category]?.label ?? ic.category, aliases: ic.aliases, score: s + exact });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}
