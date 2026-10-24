import fs from 'node:fs';
import path from 'node:path';
import type { Altitude } from '../spec.js';
import { DiagramError, deepMerge, dirs, isPlainObject } from '../util.js';
import type { Theme } from './types.js';

export interface ThemeInfo {
  id: string;
  name: string;
  description?: string;
  file: string;
  builtIn: boolean;
}

export interface Defaults {
  theme?: string;
  altitude?: Altitude;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new DiagramError(`Could not read ${file}: ${(e as Error).message}`, 'io');
  }
}

function scan(dir: string, builtIn: boolean): ThemeInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.theme.json'))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const raw = readJson(file) as Partial<Theme>;
      return {
        id: String(raw.id ?? f.replace(/\.theme\.json$/, '')),
        name: String(raw.name ?? raw.id ?? f),
        description: raw.description,
        file,
        builtIn,
      };
    });
}

/** Built-in themes first, then custom themes; a custom theme with a built-in id overrides it. */
export function listThemes(): ThemeInfo[] {
  const byId = new Map<string, ThemeInfo>();
  for (const t of [...scan(dirs.themes, true), ...scan(dirs.customThemes, false)]) byId.set(t.id, t);
  return [...byId.values()];
}

export function findTheme(id: string): ThemeInfo | undefined {
  return listThemes().find((t) => t.id === id);
}

export function resolveFontPath(p: string, baseDir: string): string {
  const candidates = path.isAbsolute(p)
    ? [p]
    : [path.resolve(baseDir, p), path.resolve(dirs.assets, p), path.resolve(dirs.fonts, path.basename(p))];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

function absolutizeFonts(raw: Record<string, unknown>, baseDir: string): Record<string, unknown> {
  const font = raw.font;
  if (!isPlainObject(font) || !isPlainObject(font.files)) return raw;
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(font.files)) files[k] = resolveFontPath(String(v), baseDir);
  return { ...raw, font: { ...font, files } };
}

/** Load the raw (unmerged) JSON of a theme file. */
export function readThemeFile(file: string): Record<string, unknown> {
  const raw = readJson(file);
  if (!isPlainObject(raw)) throw new DiagramError(`${file} is not a JSON object`, 'validation');
  return raw;
}

/** Resolve a theme by id, following `extends`, then apply per-diagram overrides. */
export function loadTheme(id: string, overrides?: Record<string, unknown>): Theme {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let cur: string | null | undefined = id;
  while (cur) {
    if (seen.has(cur)) throw new DiagramError(`Theme "${id}" has a circular "extends" chain.`, 'validation');
    seen.add(cur);
    const info = findTheme(cur);
    if (!info) {
      const known = listThemes().map((t) => t.id);
      throw new DiagramError(
        `Theme "${cur}" was not found. Themes are: ${known.join(', ')}. Add custom themes to ${dirs.customThemes}.`,
        'validation',
      );
    }
    const raw = absolutizeFonts(readThemeFile(info.file), path.dirname(info.file));
    chain.unshift(raw);
    cur = raw.extends as string | null | undefined;
  }
  let merged: Record<string, unknown> = {};
  for (const level of chain) merged = deepMerge(merged, level);
  merged.id = id;
  if (overrides && Object.keys(overrides).length) {
    const { id: _ignored, ...rest } = overrides;
    merged = deepMerge(merged, rest);
  }
  return merged as unknown as Theme;
}

export function loadDefaults(): Defaults {
  const file = dirs.defaults;
  if (!fs.existsSync(file)) return {};
  const raw = readJson(file);
  return isPlainObject(raw) ? (raw as Defaults) : {};
}
