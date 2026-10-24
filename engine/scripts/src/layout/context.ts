/** Shared layout state, canvas sizes and text helpers. */
import type { Box, SceneElement, ShapeEl, TextEl } from '../scene/types.js';
import type { Altitude, Aspect, Spec } from '../spec.js';
import type { FontSet } from '../text/measure.js';
import type { Token } from '../theme/tokens.js';
import type { Theme } from '../theme/types.js';
import { emphasisCarriers } from '../validate/spec.js';
import { ALTITUDES, type AltitudeRules } from '../validate/altitude.js';
import type { Issue } from '../validate/messages.js';
import { snapUp } from '../util.js';

export const CANVAS: Record<Exclude<Aspect, 'auto'>, [number, number]> = {
  '16:9': [1280, 720],
  '4:3': [1152, 864],
  'A4-landscape': [1184, 840],
  'A4-portrait': [840, 1184],
  square: [960, 960],
};

export interface LayoutContext {
  spec: Spec;
  theme: Theme;
  fonts: FontSet;
  altitude: Altitude;
  rules: AltitudeRules;
  W: number;
  H: number;
  /** Canvas grows to fit content. */
  auto: boolean;
  margin: number;
  els: SceneElement[];
  /** Layout-time QA issues (e.g. content that cannot fit the canvas). */
  issues: Issue[];
  /** Tag → categorical palette index, in first-use order. */
  tagIndex: Map<string, number>;
  /** Boxes of spec ids, for callout anchoring. */
  anchors: Map<string, Box>;
  /** Plain-language notes for the render summary (e.g. the canvas grew to fit). */
  notes: string[];
}

export function createContext(spec: Spec, theme: Theme, fonts: FontSet): LayoutContext {
  const aspect = spec.canvas?.aspect ?? '16:9';
  const [W, H] = aspect === 'auto' ? CANVAS['16:9'] : CANVAS[aspect];
  const tagIndex = new Map<string, number>();
  for (const c of emphasisCarriers(spec)) for (const t of c.tags ?? []) if (!tagIndex.has(t)) tagIndex.set(t, tagIndex.size);
  const altitude = spec.altitude ?? 'executive';
  return {
    spec,
    theme,
    fonts,
    altitude,
    rules: ALTITUDES[altitude],
    W,
    H,
    auto: aspect === 'auto',
    margin: theme.space.margin,
    els: [],
    issues: [],
    tagIndex,
    anchors: new Map(),
    notes: [],
  };
}

export function fitIssue(ctx: LayoutContext, id: string, message: string): void {
  ctx.issues.push({ path: id, id, code: 'canvas-fit', message });
}

// ---- Text helpers ---------------------------------------------------------

export interface TextStyle {
  size: number;
  weight: number;
}

export function styles(theme: Theme) {
  const s = theme.font.size;
  const w = theme.font.weight;
  return {
    title: { size: s.title, weight: w.title },
    subtitle: { size: s.subtitle, weight: w.body },
    group: { size: s.group, weight: w.label },
    label: { size: s.label, weight: w.label },
    body: { size: s.body, weight: w.body },
    bodyStrong: { size: s.body, weight: w.label },
    caption: { size: s.caption, weight: w.body },
    captionStrong: { size: s.caption, weight: w.label },
  };
}

export function lh(ctx: LayoutContext, size: number): number {
  return ctx.fonts.lineHeight(size);
}

export function wrap(ctx: LayoutContext, text: string, width: number, st: TextStyle): string[] {
  return ctx.fonts.wrap(text, Math.max(8, width), st.size, st.weight);
}

export function textWidth(ctx: LayoutContext, text: string, st: TextStyle): number {
  return ctx.fonts.width(text, st.size, st.weight);
}

export function blockHeight(ctx: LayoutContext, lines: number, st: TextStyle): number {
  return lines * lh(ctx, st.size);
}

export function addText(
  ctx: LayoutContext,
  t: Omit<TextEl, 'kind' | 'lineHeight' | 'w'> & { w?: number; lineHeight?: number },
): TextEl {
  const el: TextEl = {
    kind: 'text',
    lineHeight: t.lineHeight ?? lh(ctx, t.size),
    w: t.w ?? ctx.fonts.blockWidth(t.lines, t.size, t.weight),
    ...t,
  } as TextEl;
  ctx.els.push(el);
  return el;
}

export function addShape(ctx: LayoutContext, s: Omit<ShapeEl, 'kind' | 'box' | 'obstacle' | 'container'> & Partial<Pick<ShapeEl, 'box' | 'obstacle' | 'container'>>): ShapeEl {
  const el: ShapeEl = { kind: 'shape', box: true, obstacle: false, container: false, ...s } as ShapeEl;
  ctx.els.push(el);
  return el;
}

export function applyCase(text: string, mode: Theme['font']['titleCase']): string {
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'title')
    return text.replace(/\b([a-z])([a-z]*)/g, (m, a: string, b: string) =>
      /^(a|an|and|as|at|but|by|for|in|of|on|or|the|to|vs|via|with)$/.test(m) ? m : a.toUpperCase() + b,
    );
  return text;
}

export function textOn(pref: string, fill: Token): Token {
  return `text(${pref},${fill})`;
}

export function snapH(v: number): number {
  return snapUp(v);
}
