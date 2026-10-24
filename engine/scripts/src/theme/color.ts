/** Colour maths: parsing, mixing, WCAG contrast and HSL helpers. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function isHex(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

export function parseHex(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function normalizeHex(hex: string): string {
  return toHex(parseHex(hex));
}

/** Mix `fg` over `bg` with weight `t` (0 = bg, 1 = fg). */
export function mix(fg: string, bg: string, t: number): string {
  const a = parseHex(fg);
  const b = parseHex(bg);
  return toHex({ r: b.r + (a.r - b.r) * t, g: b.g + (a.g - b.g) * t, b: b.b + (a.b - b.b) * t });
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function toHsl(hex: string): HSL {
  const { r, g, b } = parseHex(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function fromHsl({ h, s, l }: HSL): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/** Darken (negative) or lighten (positive) by moving lightness toward 0 or 1. */
export function shade(hex: string, amount: number): string {
  return amount < 0 ? mix('#000000', hex, -amount) : mix('#FFFFFF', hex, amount);
}

/** Adjust `fg` (darkening or lightening) until it reaches `target` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, target = 4.5): string {
  if (contrast(fg, bg) >= target) return normalizeHex(fg);
  const darker = luminance(bg) > 0.4;
  for (let i = 1; i <= 40; i++) {
    const c = shade(fg, (darker ? -1 : 1) * i * 0.025);
    if (contrast(c, bg) >= target) return c;
  }
  return darker ? '#000000' : '#FFFFFF';
}
