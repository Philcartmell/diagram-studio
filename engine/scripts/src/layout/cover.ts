/**
 * Deck pages the engine writes itself: a title page and section dividers.
 * They take the deck theme like every other page, so a deck opens and breaks
 * in the same type and colours as its exhibits.
 */
import { type LayoutContext, addShape, addText, applyCase, lh, styles, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';

export interface CoverBody {
  kind: 'title' | 'section';
  /** Small line above the title: a date for the title page, "Section 2" for a divider. */
  tag?: string;
}

export function layoutCover(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as CoverBody;
  const st = styles(ctx.theme);
  const section = body.kind === 'section';
  // A divider is full-bleed accent; the title page stays on the background with an accent bar.
  if (section) ctx.background = 'accent';
  const on = section ? 'accent' : 'background';
  const ink = `text(${section ? 'accentInk' : 'ink'},${on})`;
  const muted = `text(${section ? 'accentInk' : 'inkMuted'},${on})`;
  const frame = beginFrame(ctx, { hideTitle: true });
  const m = ctx.margin;
  const w = Math.round(ctx.W * 0.72);
  const big = { size: Math.round(ctx.theme.font.size.title * (section ? 1.4 : 1.6)), weight: ctx.theme.font.weight.title };
  const tLines = wrap(ctx, applyCase(ctx.spec.title, ctx.theme.font.titleCase), w, big);
  const sLines = ctx.spec.subtitle ? wrap(ctx, ctx.spec.subtitle, w, st.subtitle) : [];
  const tagH = body.tag ? lh(ctx, st.caption.size) + 12 : 0;
  const blockH = 6 + 24 + tagH + tLines.length * lh(ctx, big.size) + (sLines.length ? 12 + sLines.length * lh(ctx, st.subtitle.size) : 0);
  let y = Math.round(ctx.H * 0.42 - blockH / 2);
  addShape(ctx, { id: 'cover-bar', role: 'decoration', shape: 'rect', x: m, y, w: 64, h: 6, paint: { fill: section ? 'accentInk' : 'accent', stroke: 'none', strokeWidth: 0 }, box: false });
  y += 6 + 24;
  if (body.tag) {
    addText(ctx, { id: 'cover-tag', role: 'label', x: m, y, w, lines: [body.tag.toUpperCase()], ...st.captionStrong, anchor: 'start', color: muted, letterSpacing: 0.6, slot: 'text' });
    y += tagH;
  }
  addText(ctx, { id: 'ds-title', role: 'title', x: m, y, w, lines: tLines, ...big, anchor: 'start', color: ink, slot: 'heading' });
  y += tLines.length * lh(ctx, big.size);
  if (sLines.length) {
    addText(ctx, { id: 'ds-subtitle', role: 'subtitle', x: m, y: y + 12, w, lines: sLines, ...st.subtitle, anchor: 'start', color: muted, slot: 'text' });
    y += 12 + sLines.length * lh(ctx, st.subtitle.size);
  }
  endFrame(ctx, frame, frame.content.y);
}
