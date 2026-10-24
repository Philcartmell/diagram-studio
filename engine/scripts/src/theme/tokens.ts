import { contrast, isHex, mix, normalizeHex } from './color.js';
import type { Theme } from './types.js';

/**
 * Colour token grammar used by layout code (layouts never carry hex values):
 *
 *   accent | surface | ink ...      a named colour token
 *   status.new | status.at-risk     status colours
 *   notation.step | notation.network  notation colours (with fallbacks; stageHead has none)
 *   cat.3                           categorical palette entry (wraps)
 *   accent@12                       12% accent over `background`
 *   accent@12:surface               12% accent over `surface`
 *   text(accent,accent@8)           `accent` if it reaches 4.5:1 on the
 *                                   background token, else the best ink
 *   none | #RRGGBB
 */
export type Token = string;

const STATUS_KEYS: Record<string, keyof Theme['color']['status']> = {
  new: 'new',
  changed: 'changed',
  retired: 'retired',
  atRisk: 'atRisk',
  'at-risk': 'atRisk',
};

const NAMED = [
  'background',
  'surface',
  'surfaceAlt',
  'ink',
  'inkMuted',
  'line',
  'lineStrong',
  'accent',
  'accentInk',
  'highlight',
] as const;

export class TokenResolver {
  private cache = new Map<string, string>();
  constructor(readonly theme: Theme) {}

  resolve(token: Token | undefined): string {
    if (token === undefined || token === 'none' || token === '') return 'none';
    const hit = this.cache.get(token);
    if (hit) return hit;
    const v = this.compute(token.trim());
    this.cache.set(token, v);
    return v;
  }

  private compute(token: string): string {
    if (isHex(token)) return normalizeHex(token);
    const c = this.theme.color;
    if (token.startsWith('text(') && token.endsWith(')')) {
      const [pref, bg] = splitArgs(token.slice(5, -1));
      const bgHex = this.resolve(bg);
      const prefHex = this.resolve(pref);
      return bestText(prefHex, bgHex, [c.ink, c.accentInk, c.background, c.inkMuted, '#000000', '#FFFFFF']);
    }
    if (token.includes('@')) {
      // base@pct[:over] where `over` may itself be a tint token.
      const at = token.indexOf('@');
      const base = token.slice(0, at);
      const rest = token.slice(at + 1);
      const colon = rest.indexOf(':');
      const pctStr = colon < 0 ? rest : rest.slice(0, colon);
      const over = colon < 0 ? undefined : rest.slice(colon + 1);
      const pct = Number(pctStr) / 100;
      if (!Number.isFinite(pct)) throw new Error(`Bad tint token "${token}"`);
      const baseHex = this.resolve(base);
      const overHex = this.resolve(over ?? 'background');
      if (baseHex === 'none') return 'none';
      return mix(baseHex, overHex === 'none' ? c.background : overHex, pct);
    }
    if (token.startsWith('status.')) {
      const key = STATUS_KEYS[token.slice(7)];
      if (!key) throw new Error(`Unknown status colour token "${token}"`);
      return normalizeHex(c.status[key]);
    }
    if (token.startsWith('notation.')) {
      const key = token.slice(9);
      const n = c.notation ?? {};
      const network = n.network ?? c.accent;
      const fallback: Record<string, string> = {
        step: c.accent,
        stepInk: c.accentInk,
        flow2: c.accent,
        network,
        zone: c.status.changed,
        account: c.lineStrong,
        cloud: network,
        plane: c.line,
        platform: c.surfaceAlt,
        governance: c.accent,
        stageHead: c.surfaceAlt,
        bronze: '#B0753A',
        silver: '#8C8C8C',
        gold: '#B8960C',
      };
      if (!(key in fallback)) throw new Error(`Unknown notation colour token "${token}"`);
      return normalizeHex(n[key as keyof typeof n] ?? fallback[key]);
    }
    if (token.startsWith('cat.')) {
      const i = Number(token.slice(4));
      const pal = c.categorical;
      return normalizeHex(pal[((i % pal.length) + pal.length) % pal.length]);
    }
    if ((NAMED as readonly string[]).includes(token)) {
      return normalizeHex(c[token as (typeof NAMED)[number]]);
    }
    throw new Error(`Unknown colour token "${token}"`);
  }
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Use `preferred` if it is readable on `bg`, else the most readable candidate. */
export function bestText(preferred: string, bg: string, candidates: string[]): string {
  if (preferred !== 'none' && contrast(preferred, bg) >= 4.5) return preferred;
  let best = candidates[0];
  let bestC = 0;
  for (const cand of candidates) {
    const k = contrast(cand, bg);
    if (k >= 4.5) return normalizeHex(cand);
    if (k > bestC) {
      bestC = k;
      best = cand;
    }
  }
  return normalizeHex(best);
}
