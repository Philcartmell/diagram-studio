/**
 * Text measurement with opentype.js using the theme's own font files, so
 * wrapping is computed from real glyph advances rather than guessed.
 */
import fs from 'node:fs';
import opentype from 'opentype.js';
import { FONT_KEY_WEIGHT, type FontFileKey, type Theme } from '../theme/types.js';
import { DiagramError } from '../util.js';

export interface Face {
  weight: number;
  file: string;
  /** Family name as stored in the font file (used for SVG/PNG matching). */
  family: string;
  font: opentype.Font;
  ascender: number;
  descender: number;
  unitsPerEm: number;
}

const fontCache = new Map<string, Face>();

function loadFace(file: string, weight: number): Face {
  const key = `${file}#${weight}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  if (!fs.existsSync(file)) throw new DiagramError(`Font file not found: ${file}`, 'io');
  const buf = fs.readFileSync(file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
  const family = names.preferredFamily?.en ?? names.fontFamily?.en ?? 'sans-serif';
  const face: Face = {
    weight,
    file,
    family,
    font,
    ascender: font.ascender / font.unitsPerEm,
    descender: -font.descender / font.unitsPerEm,
    unitsPerEm: font.unitsPerEm,
  };
  fontCache.set(key, face);
  return face;
}

const CJK = /[⺀-⿿　-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/u;

export function isWide(ch: string): boolean {
  return CJK.test(ch);
}

export class FontSet {
  readonly faces: Face[];
  readonly family: string;
  readonly lineHeightRatio: number;
  private widthCache = new Map<string, number>();
  private missing = new Set<string>();

  constructor(theme: Theme) {
    const files = theme.font.files;
    const faces: Face[] = [];
    for (const key of Object.keys(files) as FontFileKey[]) {
      const f = files[key];
      if (f) faces.push(loadFace(f, FONT_KEY_WEIGHT[key]));
    }
    if (!faces.length) throw new DiagramError(`Theme "${theme.id}" defines no font files.`, 'validation');
    faces.sort((a, b) => a.weight - b.weight);
    this.faces = faces;
    this.family = faces[0].family;
    this.lineHeightRatio = theme.font.lineHeight ?? 1.3;
  }

  /** Face closest to the requested weight (ties prefer the heavier face). */
  face(weight: number): Face {
    let best = this.faces[0];
    for (const f of this.faces) {
      if (Math.abs(f.weight - weight) <= Math.abs(best.weight - weight)) best = f;
    }
    return best;
  }

  /** The weight that will actually be rendered for a requested weight. */
  renderWeight(weight: number): number {
    return this.face(weight).weight;
  }

  private charAdvance(face: Face, ch: string): number {
    const key = `${face.weight}|${ch}`;
    const hit = this.widthCache.get(key);
    if (hit !== undefined) return hit;
    const glyph = face.font.charToGlyph(ch);
    let adv: number;
    if (!glyph || glyph.index === 0) {
      this.missing.add(ch);
      adv = isWide(ch) ? 1 : 0.6;
    } else {
      adv = (glyph.advanceWidth ?? face.unitsPerEm * 0.6) / face.unitsPerEm;
    }
    this.widthCache.set(key, adv);
    return adv;
  }

  width(text: string, size: number, weight: number, letterSpacing = 0): number {
    const face = this.face(weight);
    let w = 0;
    let n = 0;
    for (const ch of text) {
      w += this.charAdvance(face, ch);
      n++;
    }
    return w * size + Math.max(0, n - 1) * letterSpacing;
  }

  /** Characters the theme fonts cannot render (they fall back to system fonts). */
  missingGlyphs(): string[] {
    return [...this.missing];
  }

  hasGlyph(ch: string): boolean {
    const g = this.faces[0].font.charToGlyph(ch);
    return !!g && g.index !== 0;
  }

  lineHeight(size: number): number {
    return Math.round(size * this.lineHeightRatio * 2) / 2;
  }

  /** Baseline offset from the top of a line box (CSS half-leading model). */
  baseline(size: number, weight: number, lineHeight: number): number {
    const f = this.face(weight);
    const content = (f.ascender + f.descender) * size;
    return (lineHeight - content) / 2 + f.ascender * size;
  }

  /**
   * Greedy word wrap at `maxWidth`. Words longer than the line are broken at
   * hyphens or slashes first, then between characters. CJK breaks anywhere.
   */
  wrap(text: string, maxWidth: number, size: number, weight: number): string[] {
    const paragraphs = text.split(/\n/);
    const out: string[] = [];
    for (const para of paragraphs) out.push(...this.wrapParagraph(para.trim(), maxWidth, size, weight));
    return out.length ? out : [''];
  }

  private tokens(text: string): { t: string; space: boolean }[] {
    // Each token carries whether it is preceded by a space.
    const toks: { t: string; space: boolean }[] = [];
    for (const word of text.split(/\s+/).filter(Boolean)) {
      let buf = '';
      let first = true;
      for (const ch of word) {
        if (isWide(ch)) {
          if (buf) {
            toks.push({ t: buf, space: first && toks.length > 0 });
            first = false;
            buf = '';
          }
          toks.push({ t: ch, space: first && toks.length > 0 });
          first = false;
        } else buf += ch;
      }
      if (buf) toks.push({ t: buf, space: first && toks.length > 0 });
    }
    return toks;
  }

  private wrapParagraph(text: string, maxWidth: number, size: number, weight: number): string[] {
    if (!text) return [''];
    const lines: string[] = [];
    let cur = '';
    const fits = (s: string) => this.width(s, size, weight) <= maxWidth + 0.01;
    for (const tok of this.tokens(text)) {
      const candidate = cur ? cur + (tok.space ? ' ' : '') + tok.t : tok.t;
      if (fits(candidate)) {
        cur = candidate;
        continue;
      }
      if (cur) lines.push(cur);
      cur = '';
      if (fits(tok.t)) {
        cur = tok.t;
        continue;
      }
      // Break an over-long word.
      let rest = tok.t;
      while (rest && !fits(rest)) {
        let cut = this.breakPoint(rest, maxWidth, size, weight);
        if (cut <= 0) cut = 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      cur = rest;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  private breakPoint(word: string, maxWidth: number, size: number, weight: number): number {
    const chars = [...word];
    let lastSoft = -1;
    let i = 0;
    let acc = '';
    for (; i < chars.length; i++) {
      if (this.width(acc + chars[i], size, weight) > maxWidth) break;
      acc += chars[i];
      if (chars[i] === '-' || chars[i] === '/') lastSoft = acc.length;
    }
    return lastSoft > 0 ? lastSoft : acc.length;
  }

  /** Widest line after wrapping. */
  blockWidth(lines: string[], size: number, weight: number): number {
    return Math.max(0, ...lines.map((l) => this.width(l, size, weight)));
  }
}

const setCache = new Map<string, FontSet>();

export function fontSetFor(theme: Theme): FontSet {
  const key = JSON.stringify(theme.font.files) + (theme.font.lineHeight ?? '');
  let fs_ = setCache.get(key);
  if (!fs_) {
    fs_ = new FontSet(theme);
    setCache.set(key, fs_);
  }
  return fs_;
}
