/**
 * Series colours that hold across charts: a series keeps its hue on every
 * chart of a page (an exhibit's panels) and of a deck, matched by its label.
 */
import type { ChartSeries } from '../spec.js';
import { isPlainObject } from '../util.js';

/** Series match across charts by their label, ignoring case and spacing. */
export const seriesKey = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The series labels one spec draws in palette hues (lines, and bars on the
 * categorical palette), searching exhibit panels too. Muted series are grey and
 * take no hue; a single-series chart uses the accent, not the palette.
 */
export function paletteLabels(type: unknown, body: unknown): string[] {
  if (!isPlainObject(body)) return [];
  if (type === 'exhibit' && Array.isArray(body.panels)) return body.panels.flatMap((p) => (isPlainObject(p) ? paletteLabels(p.type, p.body) : []));
  const hued = type === 'line-chart' || (type === 'bar-chart' && body.palette === 'categorical');
  const series = Array.isArray(body.series) ? (body.series as ChartSeries[]) : [];
  if (!hued || series.length < 2) return [];
  return series.filter((s) => isPlainObject(s) && typeof s.label === 'string' && s.emphasis !== 'muted').map((s) => seriesKey(s.label));
}

/**
 * Series label → categorical palette index. Each page is the list of labels
 * shown together. Labels that share a page always get different hues; labels
 * that never meet may share one, so a long deck does not run through the
 * palette. Labels are taken in first-use order, each given the lowest index its
 * page-mates have not taken, so a single chart keeps the plain 0, 1, 2 … order.
 */
export function seriesPalette(pages: string[][]): Map<string, number> {
  const mates = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const a of page) {
      if (!mates.has(a)) mates.set(a, new Set());
      for (const b of page) if (b !== a) mates.get(a)!.add(b);
    }
  }
  const index = new Map<string, number>();
  for (const [label, near] of mates) {
    const taken = new Set([...near].map((m) => index.get(m)));
    let i = 0;
    while (taken.has(i)) i++;
    index.set(label, i);
  }
  return index;
}
