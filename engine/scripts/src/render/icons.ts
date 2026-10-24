import fs from 'node:fs';
import path from 'node:path';
import { dirs } from '../util.js';

interface IconFile {
  viewBox: number;
  icons: Record<string, string[]>;
  aliases: Record<string, string>;
}

let cache: IconFile | undefined;

function load(): IconFile {
  if (!cache) cache = JSON.parse(fs.readFileSync(path.join(dirs.icons, 'icons.json'), 'utf8')) as IconFile;
  return cache;
}

export function iconNames(): string[] {
  const f = load();
  return [...Object.keys(f.icons), ...Object.keys(f.aliases)].sort();
}

/** Path data for an icon in a 24-unit box, or undefined if unknown. */
export function iconPaths(name: string): string[] | undefined {
  const f = load();
  return f.icons[name] ?? (f.aliases[name] ? f.icons[f.aliases[name]] : undefined);
}

export const ICON_VIEWBOX = 24;
