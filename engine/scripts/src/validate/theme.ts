/** Theme validation: schema, font files and WCAG AA contrast. */
import fs from 'node:fs';
import path from 'node:path';
import { contrast } from '../theme/color.js';
import { loadTheme, readThemeFile, resolveFontPath } from '../theme/load.js';
import type { Theme } from '../theme/types.js';
import { deepMerge, isPlainObject } from '../util.js';
import { validator } from './ajv.js';
import { type Issue, rewriteErrors } from './messages.js';

export interface ThemeValidation {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  contrast: Record<string, number>;
}

const PAIRS: [fg: keyof Theme['color'], bg: keyof Theme['color'], required: boolean][] = [
  ['ink', 'surface', true],
  ['accentInk', 'accent', true],
  ['ink', 'background', true],
  ['inkMuted', 'surface', true],
  ['inkMuted', 'background', true],
];

export function validateThemeObject(theme: unknown): ThemeValidation {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const ratios: Record<string, number> = {};
  const validate = validator('theme');
  if (!validate(theme)) {
    errors.push(...rewriteErrors(validate.errors ?? []));
    return { ok: false, errors, warnings, contrast: ratios };
  }
  const t = theme as Theme;
  for (const [fg, bg, required] of PAIRS) {
    const r = contrast(t.color[fg] as string, t.color[bg] as string);
    ratios[`${fg}/${bg}`] = r;
    if (r < 4.5) {
      const issue: Issue = {
        path: `color.${fg}`,
        code: 'theme.contrast',
        message: `color.${fg}: contrast with ${bg} is ${r}:1; WCAG AA needs 4.5:1. Darken or lighten ${fg} (or ${bg}).`,
      };
      (required ? errors : warnings).push(issue);
    }
  }
  if (t.color.notation?.step) {
    const ink = t.color.notation.stepInk ?? t.color.accentInk;
    const r = contrast(ink, t.color.notation.step);
    ratios['notation.stepInk/notation.step'] = r;
    if (r < 4.5)
      errors.push({ path: 'color.notation.stepInk', code: 'theme.contrast', message: `color.notation.stepInk: contrast with notation.step is ${r}:1; WCAG AA needs 4.5:1.` });
  }
  for (const [k, f] of Object.entries(t.font.files)) {
    if (f && !fs.existsSync(f)) {
      errors.push({ path: `font.files.${k}`, code: 'theme.font', message: `font.files.${k}: font file not found at ${f}.` });
    }
  }
  if (t.style.accentFill === 'tint') {
    // Tinted accents put ink on a light accent wash; make sure that stays readable.
    const r = contrast(t.color.ink, t.color.background);
    if (r < 4.5) warnings.push({ path: 'color.ink', code: 'theme.contrast', message: `color.ink: ${r}:1 on background.` });
  }
  return { ok: errors.length === 0, errors, warnings, contrast: ratios };
}

/** Validate a theme file on disk, resolving its `extends` chain first. */
export function validateThemeFile(file: string): ThemeValidation & { theme?: Theme } {
  const raw = readThemeFile(file);
  let merged: Record<string, unknown> = raw;
  const baseDir = path.dirname(file);
  if (isPlainObject(raw.font) && isPlainObject(raw.font.files)) {
    const files: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.font.files)) files[k] = resolveFontPath(String(v), baseDir);
    merged = { ...raw, font: { ...raw.font, files } };
  }
  if (typeof raw.extends === 'string' && raw.extends) {
    try {
      const parent = loadTheme(raw.extends) as unknown as Record<string, unknown>;
      merged = deepMerge(parent, merged);
    } catch (e) {
      return {
        ok: false,
        errors: [{ path: 'extends', code: 'theme.extends', message: `extends: ${(e as Error).message}` }],
        warnings: [],
        contrast: {},
      };
    }
  }
  const r = validateThemeObject(merged);
  return { ...r, theme: r.ok ? (merged as unknown as Theme) : undefined };
}
