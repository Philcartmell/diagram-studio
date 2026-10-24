/**
 * Shared helpers for the chart types: number formatting, value scales, series
 * colours and the text styles charts use. Charts are drawn from the same
 * shapes, text and lines as every other type, so every exporter handles them.
 */
import type { ChartSeries, Emphasis, NumberFormat } from '../spec.js';
import type { Token } from '../theme/tokens.js';
import { type LayoutContext, type TextStyle, styles } from './context.js';
import { seriesKey } from './series.js';

/** Decimal places the data itself uses (at most 2), so 12.5 never prints as 13. */
export function decimalsOf(values: (number | null | undefined)[]): number {
  let d = 0;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const s = String(v);
    const i = s.indexOf('.');
    if (i >= 0 && !s.includes('e')) d = Math.max(d, Math.min(2, s.length - i - 1));
  }
  return d;
}

export interface Formatter {
  (v: number, opts?: { sign?: boolean; decimals?: number }): string;
}

/** A number formatter for one chart: one rule for every figure, so "1,050" never sits beside "1050". */
export function formatter(ctx: LayoutContext, f: NumberFormat | undefined, values: (number | null | undefined)[]): Formatter {
  const decimals = f?.decimals ?? decimalsOf(values);
  // A true minus sign where the font has one, else an en dash (never a hyphen).
  const minus = ctx.fonts.hasGlyph('−') ? '−' : ctx.fonts.hasGlyph('–') ? '–' : '-';
  return (v, opts = {}) => {
    const d = opts.decimals ?? decimals;
    let s = Math.abs(v).toFixed(d);
    if (f?.thousands !== false) {
      const [int, frac] = s.split('.');
      s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
    }
    const zero = Number(s.replace(/,/g, '')) === 0;
    const sign = v < 0 && !zero ? minus : opts.sign && v > 0 && !zero ? '+' : '';
    return `${sign}${f?.prefix ?? ''}${s}${f?.suffix ?? ''}`;
  };
}

/** A tick step of 1, 2, 2.5 or 5 times a power of ten giving about `target` intervals. */
export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * mag;
}

export function niceDomain(min: number, max: number, target = 5): { min: number; max: number; step: number; ticks: number[] } {
  if (min === max) {
    if (min === 0) max = 1;
    else if (min > 0) min = 0;
    else max = 0;
  }
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, step, ticks };
}

const SEQUENTIAL = ['accent', 'accent@68', 'accent@44', 'accent@26', 'accent@14'];

/**
 * One fill per series. "sequential" (the default) shades the accent from full
 * strength down; "categorical" gives each series label its hue in the theme palette. An accented series takes
 * the full accent and the others step back; muted series are grey.
 */
export function seriesFills(series: ChartSeries[], palette: 'sequential' | 'categorical' = 'sequential', hues?: Map<string, number>): Token[] {
  const accentAt = series.findIndex((s) => s.emphasis === 'accent');
  // Plain series take the next shade in order; beside an accented series they fade with distance
  // from it, so an ordinal scale (rarely … often) reads as one ramp.
  const plain = series.map((s, i) => i).filter((i) => !series[i].emphasis || series[i].emphasis === 'normal');
  const rank = new Map<number, number>();
  if (accentAt >= 0) [...plain].sort((a, b) => Math.abs(a - accentAt) - Math.abs(b - accentAt) || a - b).forEach((i, k) => rank.set(i, k + 2));
  else plain.forEach((i, k) => rank.set(i, k));
  return series.map((s, i) => {
    if (s.emphasis === 'muted') return 'line';
    if (s.emphasis === 'highlight') return 'highlight';
    if (s.emphasis === 'accent') return 'accent';
    if (palette === 'categorical') return `cat.${hues?.get(seriesKey(s.label)) ?? i}`;
    return SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, rank.get(i) ?? 0)];
  });
}

/** Line colours: each series label's hue, unless one series is accented, when the rest go quiet. */
export function lineStrokes(series: ChartSeries[], hues?: Map<string, number>): Token[] {
  const accented = series.some((s) => s.emphasis === 'accent');
  return series.map((s, i) => {
    if (s.emphasis === 'accent') return 'accent';
    if (s.emphasis === 'highlight') return 'highlight';
    if (s.emphasis === 'muted' || accented) return 'line';
    return `cat.${hues?.get(seriesKey(s.label)) ?? i}`;
  });
}

/** Fill for a single-series bar: the accented category stands out, the rest step back. */
export function singleFill(base: Token, emphasis: Emphasis | undefined, anyAccent: boolean): Token {
  if (emphasis === 'accent') return 'accent';
  if (emphasis === 'highlight') return 'highlight';
  if (emphasis === 'muted') return 'line';
  return anyAccent ? 'accent@36' : base;
}

/** Text readable on a fill: the accent ink if it passes, else the best ink. */
export function inkOn(fill: Token): Token {
  return `text(accentInk,${fill})`;
}

export function chartStyles(ctx: LayoutContext) {
  const t = ctx.theme.font;
  const st = styles(ctx.theme);
  const s = (size: number, weight: number): TextStyle => ({ size, weight });
  return {
    ...st,
    /** Category labels under bars and along the x axis. */
    category: s(t.size.label, t.weight.body),
    /** Figures on and beside bars. */
    value: s(t.size.label, t.weight.body),
    /** Totals and deltas. */
    total: s(t.size.label, t.weight.label),
    /** Small figures (crowded grouped bars, axis ticks). */
    small: s(t.size.caption, t.weight.body),
  };
}

export function sum(values: (number | null)[]): number {
  let s = 0;
  for (const v of values) if (typeof v === 'number') s += v;
  return s;
}
