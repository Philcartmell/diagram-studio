/**
 * `theme create --from-brand`: turns one to three brand colours and a font
 * name into a complete, contrast-safe theme saved in themes/ in the user folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateThemeObject } from '../validate/theme.js';
import type { Issue } from '../validate/messages.js';
import { contrast, ensureContrast, fromHsl, isHex, luminance, mix, normalizeHex, toHsl } from './color.js';
import { listThemes, loadTheme } from './load.js';
import type { Theme } from './types.js';
import { dirs } from '../util.js';

export interface BrandOptions {
  id?: string;
  name?: string;
  colors?: string;
  font?: string;
  fontFiles: { regular?: string; semibold?: string; bold?: string };
  background?: string;
  style?: 'clean' | 'sketch';
  description?: string;
}

export interface BrandResult {
  ok: boolean;
  id: string;
  file: string;
  theme?: Theme;
  errors: Issue[];
  notes: string[];
  contrast?: Record<string, number>;
}

/** Bundled families a brand font name can map to. */
const BUNDLED: Record<string, { regular: string; semibold?: string; bold?: string }> = {
  inter: { regular: 'fonts/Inter-Regular.ttf', semibold: 'fonts/Inter-SemiBold.ttf' },
  'ibm plex sans': { regular: 'fonts/IBMPlexSans-Regular.ttf', semibold: 'fonts/IBMPlexSans-SemiBold.ttf' },
  'source sans 3': { regular: 'fonts/SourceSans3-Regular.ttf', semibold: 'fonts/SourceSans3-Semibold.ttf' },
  'source sans pro': { regular: 'fonts/SourceSans3-Regular.ttf', semibold: 'fonts/SourceSans3-Semibold.ttf' },
  kalam: { regular: 'fonts/Kalam-Regular.ttf', bold: 'fonts/Kalam-Bold.ttf' },
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';
}

/** Rotate hue keeping saturation, then pull lightness toward a target luminance. */
function sibling(hex: string, rotate: number, minContrastOn: string): string {
  const h = toHsl(hex);
  const c = fromHsl({ h: h.h + rotate, s: Math.max(0.45, Math.min(0.8, h.s)), l: Math.max(0.35, Math.min(0.55, h.l)) });
  return ensureContrast(c, minContrastOn, 3);
}

export function createBrandTheme(o: BrandOptions): BrandResult {
  const notes: string[] = [];
  const errors: Issue[] = [];
  const colors = (o.colors ?? '')
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (c.startsWith('#') ? c : `#${c}`));
  const id = slug(o.id ?? o.name ?? 'brand');
  const file = path.join(dirs.customThemes, `${id}.theme.json`);
  const fail = (path: string, message: string): BrandResult => ({ ok: false, id, file, errors: [{ path, code: 'brand', message }], notes });
  if (!colors.length) return fail('colors', 'colors: give at least one brand colour, e.g. --colors "#D4001A,#1A1A1A".');
  const bad = colors.find((c) => !isHex(c));
  if (bad) return fail('colors', `colors: "${bad}" is not a hex colour like #D4001A.`);
  const builtIn = listThemes().find((t) => t.id === id && t.builtIn);
  if (builtIn) return fail('id', `id: "${id}" is a built-in theme; choose another id.`);

  const B = normalizeHex(o.background && isHex(o.background) ? o.background : '#FFFFFF');
  const dark = luminance(B) < 0.2;
  const P = normalizeHex(colors[0]);
  const S = colors[1] ? normalizeHex(colors[1]) : sibling(P, 150, B);

  // Surfaces: barely tinted with the brand colour.
  const surface = dark ? mix('#FFFFFF', B, 0.06) : mix(P, B, 0.035);
  const surfaceAlt = dark ? mix('#FFFFFF', B, 0.11) : mix(P, B, 0.08);
  // Ink: a near-black (or near-white) carrying a hint of the brand hue.
  let ink = dark ? mix(P, '#FFFFFF', 0.06) : mix(P, '#0B0F14', 0.12);
  ink = ensureContrast(ensureContrast(ink, surface, 7), B, 7);
  let inkMuted = mix(ink, B, 0.66);
  inkMuted = ensureContrast(ensureContrast(inkMuted, surface, 4.6), surfaceAlt, 4.5);
  const line = mix(ink, B, 0.4);
  const lineStrong = mix(ink, B, 0.78);

  // Accent: the brand colour, nudged only if no ink colour reads on it.
  let accent = P;
  let accentInk = contrast('#FFFFFF', P) >= contrast(ink, P) ? '#FFFFFF' : ink;
  if (contrast(accentInk, accent) < 4.5) {
    const lighter = luminance(P) > 0.35;
    accent = ensureContrast(P, lighter ? ink : '#FFFFFF', 4.5);
    accentInk = lighter ? ink : '#FFFFFF';
    notes.push(`Accent adjusted from ${P} to ${accent} so ${accentInk === '#FFFFFF' ? 'white' : 'dark'} text on it meets WCAG AA.`);
  }
  if (contrast(accent, B) < 3) notes.push(`The accent ${accent} is light against the background; accents are drawn as tinted fills with a strong border.`);
  const highlight = ensureContrast(S, B, 3);
  if (colors[1] && highlight !== S) notes.push(`Second colour ${S} is drawn as ${highlight} so lines and markers reach 3:1 contrast on the background.`);
  const categorical = [accent, highlight, ...[60, 200, 280, 330].map((r) => sibling(P, r, B))].map(normalizeHex);
  if (colors[2]) categorical.splice(2, 0, ensureContrast(normalizeHex(colors[2]), B, 3));

  // Fonts.
  if (!o.font?.trim()) notes.push('No brand font given, so the theme uses Inter. Re-run with --font "Name" (and --font-regular/--font-semibold files) to use the brand font.');
  const family = o.font?.trim() || 'Inter';
  const files: Record<string, string> = {};
  const fontDir = path.join(dirs.customThemes, 'fonts');
  for (const [k, f] of Object.entries(o.fontFiles)) {
    if (!f) continue;
    if (!fs.existsSync(f)) return fail(`font-${k}`, `font-${k}: file not found: ${f}`);
    fs.mkdirSync(fontDir, { recursive: true });
    const dest = path.join(fontDir, path.basename(f));
    fs.copyFileSync(f, dest);
    files[k] = `fonts/${path.basename(f)}`;
  }
  if (!Object.keys(files).length) {
    const bundled = BUNDLED[family.toLowerCase()];
    if (bundled) Object.assign(files, bundled);
    else {
      Object.assign(files, BUNDLED.inter);
      notes.push(
        `"${family}" is not bundled, so text is measured and embedded with Inter (SVG, PNG, PDF). PPTX keeps "${family}" by name. ` +
          `Pass --font-regular and --font-semibold with the brand's TTF files (OFL or licensed for embedding) to use it everywhere.`,
      );
    }
  }
  const semibold = files.semibold ? 600 : files.bold ? 700 : 400;

  const base = loadTheme('boardroom');
  const theme: Theme = {
    id,
    name: o.name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    description: o.description ?? `Brand theme generated from ${colors.join(', ')} and ${family}.`,
    extends: null,
    color: {
      background: B,
      surface,
      surfaceAlt,
      ink,
      inkMuted,
      line,
      lineStrong,
      accent,
      accentInk,
      highlight,
      categorical,
      status: {
        new: ensureContrast('#2E7D32', B, 3),
        changed: ensureContrast('#B7791F', B, 3),
        retired: line,
        atRisk: ensureContrast('#C62828', B, 3),
      },
    },
    font: {
      family,
      files,
      size: base.font.size,
      weight: { title: semibold, label: semibold, body: 400 },
      titleCase: 'sentence',
      lineHeight: 1.3,
    },
    shape: { ...base.shape },
    space: { ...base.space },
    connector: { ...base.connector },
    style: {
      renderer: o.style ?? 'clean',
      showIcons: false,
      accentFill: 'tint',
      headerRule: true,
      bandFill: 'surface',
      ...(o.style === 'sketch' ? { roughness: 1.1 } : {}),
    },
  };

  // Validate the resolved theme (font paths made absolute) before saving.
  const resolved = structuredClone(theme);
  for (const [k, f] of Object.entries(resolved.font.files)) {
    const local = path.join(dirs.customThemes, f!);
    resolved.font.files[k as keyof typeof resolved.font.files] = fs.existsSync(local) ? local : path.join(dirs.assets, f!);
  }
  const v = validateThemeObject(resolved);
  errors.push(...v.errors);
  if (errors.length) return { ok: false, id, file, errors, notes, contrast: v.contrast };
  fs.mkdirSync(dirs.customThemes, { recursive: true });
  if (fs.existsSync(file)) notes.push(`Replaced the existing custom theme ${path.basename(file)}.`);
  fs.writeFileSync(file, JSON.stringify(theme, null, 2) + '\n');
  notes.unshift(
    `Colour roles: accent ${accent} marks the one thing to look at; highlight ${highlight} marks secondary emphasis (set "emphasis": "highlight" on an element to show it); tags use the categorical palette.`,
  );
  return { ok: true, id, file, theme, errors, notes, contrast: v.contrast };
}
