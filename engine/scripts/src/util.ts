import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the skill folder (diagram-studio/). Works from both src/ and dist/. */
export const SKILL_ROOT = process.env.DIAGRAM_STUDIO_ROOT
  ? path.resolve(process.env.DIAGRAM_STUDIO_ROOT)
  : path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * The user's own themes, defaults and extra Azure icons. They live outside the
 * install folder, which npm may replace on update or make read-only.
 */
export const USER_ROOT = process.env.DIAGRAM_STUDIO_HOME
  ? path.resolve(process.env.DIAGRAM_STUDIO_HOME)
  : process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'diagram-studio')
    : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'diagram-studio');

export const dirs = {
  root: SKILL_ROOT,
  user: USER_ROOT,
  themes: path.join(SKILL_ROOT, 'themes'),
  customThemes: path.join(USER_ROOT, 'themes'),
  customIcons: path.join(USER_ROOT, 'azure-icons'),
  defaults: path.join(USER_ROOT, 'defaults.json'),
  schema: path.join(SKILL_ROOT, 'schema'),
  assets: path.join(SKILL_ROOT, 'assets'),
  fonts: path.join(SKILL_ROOT, 'assets', 'fonts'),
  icons: path.join(SKILL_ROOT, 'assets', 'icons'),
  examples: path.join(SKILL_ROOT, 'examples'),
};

export const GRID = 8;

/** Snap to the 8-unit layout grid. */
export function snap(v: number, unit = GRID): number {
  return Math.round(v / unit) * unit;
}
export function snapDown(v: number, unit = GRID): number {
  return Math.floor(v / unit + 1e-9) * unit;
}
export function snapUp(v: number, unit = GRID): number {
  return Math.ceil(v / unit - 1e-9) * unit;
}

/** Round to 0.5 so output never carries floating-point drift. */
export function half(v: number): number {
  const r = Math.round(v * 2) / 2;
  return Object.is(r, -0) ? 0 : r;
}

/** Format a number for SVG/XML output: rounded to 0.5, no trailing zeros. */
export function fmt(v: number): string {
  const r = half(v);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Stable 32-bit FNV-1a hash, used for deterministic sketch seeds. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function slugify(title: string, max = 60): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/%/g, ' pct ')
    .replace(/£/g, ' gbp ')
    .replace(/\$/g, ' usd ')
    .replace(/€/g, ' eur ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base || 'diagram';
  const cut = base.slice(0, max);
  const at = cut.lastIndexOf('-');
  return (at > 20 ? cut.slice(0, at) : cut).replace(/-+$/g, '') || 'diagram';
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge for token objects: arrays and scalars replace, objects merge. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlainObject(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = isPlainObject(base) ? { ...(base as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out as T;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      // Adjacent transpositions ("lable" → "label") count as one edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

export function closest(word: string, options: string[]): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(word.toLowerCase(), o.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best !== undefined && bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

/**
 * Search score of `fields` (most important first) for the query `words`: every word
 * must match some field; exact beats prefix beats substring, earlier fields beat later.
 */
export function scoreFields(words: string[], fields: string[]): number {
  let s = 0;
  for (const w of words) {
    let best = 0;
    for (const [i, f] of fields.entries()) {
      const fl = f.toLowerCase();
      if (fl === w) best = Math.max(best, 10 - i);
      else if (fl.startsWith(w)) best = Math.max(best, 6 - i * 0.5);
      else if (fl.includes(w)) best = Math.max(best, 3 - i * 0.25);
    }
    if (!best) return 0;
    s += best;
  }
  return s;
}

export function humanize(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function listJoin(items: string[]): string {
  return items.join(', ');
}

export class DiagramError extends Error {
  constructor(
    message: string,
    readonly code: 'validation' | 'layout' | 'qa' | 'usage' | 'io',
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}
