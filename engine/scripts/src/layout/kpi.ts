/**
 * kpi: big figures with a line of explanation each. A row of tiles for a
 * headline slide, or a column down the side of an exhibit. The figure is
 * printed exactly as written: the engine never rounds or restates it.
 */
import type { KpiBody } from '../spec.js';
import { rulePaint } from '../theme/paint.js';
import { type LayoutContext, addText, fitIssue, lh, styles, textWidth, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';

const GAP = 32;

export function layoutKpi(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as KpiBody;
  const st = styles(ctx.theme);
  const frame = beginFrame(ctx);
  const C = frame.content;
  const n = body.items.length;
  const column = body.layout === 'column';
  const big = { size: Math.round(ctx.theme.font.size.title * (column ? 1.3 : 1.6)), weight: ctx.theme.font.weight.title };
  const label = { size: ctx.theme.font.size.label, weight: ctx.theme.font.weight.label };
  const bigLh = lh(ctx, big.size);
  const lLh = lh(ctx, label.size);
  const bLh = lh(ctx, st.body.size);
  const tileW = column ? C.w : (C.w - (n - 1) * GAP) / n;

  const blocks = body.items.map((it) => {
    const lLines = wrap(ctx, it.label, tileW, label);
    const dLines = it.detail ? wrap(ctx, it.detail, tileW, st.body) : [];
    if (textWidth(ctx, it.value, big) > tileW) fitIssue(ctx, it.id, `the figure "${it.value}" is wider than its tile. Shorten it ("$140 BN" rather than "$140,000,000,000") or use fewer tiles.`);
    return { it, lLines, dLines, h: 12 + bigLh + 4 + lLines.length * lLh + (dLines.length ? 4 + dLines.length * bLh : 0) };
  });

  let bottom = C.y;
  if (column) {
    // Stacked tiles, each under a hairline, filling the column from the top.
    let y = C.y;
    blocks.forEach((b) => {
      draw(ctx, b, C.x, y, tileW, big, label);
      y += b.h + 24;
    });
    bottom = y - 24;
  } else {
    // A row of tiles, centred in the height when the slide is about the numbers.
    const h = Math.max(...blocks.map((b) => b.h));
    const y = ctx.figure ? C.y : C.y + Math.max(0, (C.h - h) / 2);
    blocks.forEach((b, i) => draw(ctx, b, C.x + i * (tileW + GAP), y, tileW, big, label));
    bottom = y + h;
  }
  endFrame(ctx, frame, bottom);
}

function draw(
  ctx: LayoutContext,
  b: { it: KpiBody['items'][number]; lLines: string[]; dLines: string[] },
  x: number,
  y: number,
  w: number,
  big: { size: number; weight: number },
  label: { size: number; weight: number },
) {
  const st = styles(ctx.theme);
  const accent = b.it.emphasis === 'accent';
  const color = accent ? 'text(accent,background)' : b.it.emphasis === 'highlight' ? 'text(highlight,background)' : b.it.emphasis === 'muted' ? 'inkMuted' : 'ink';
  const group = `g-${b.it.id}`;
  ctx.els.push({ kind: 'line', id: `${b.it.id}--rule`, role: 'decoration', points: [{ x, y }, { x: x + w, y }], paint: accent ? { fill: 'none', stroke: 'accent', strokeWidth: 3 } : rulePaint(ctx.theme), group });
  let ty = y + 12;
  addText(ctx, { id: `${b.it.id}--value`, role: 'label', x, y: ty, lines: [b.it.value], ...big, anchor: 'start', color, group, slot: 'heading' });
  ty += lh(ctx, big.size) + 4;
  addText(ctx, { id: `${b.it.id}--label`, role: 'label', x, y: ty, w, lines: b.lLines, ...label, anchor: 'start', color: 'ink', group, slot: 'text' });
  ty += b.lLines.length * lh(ctx, label.size);
  if (b.dLines.length) {
    addText(ctx, { id: `${b.it.id}--detail`, role: 'label', x, y: ty + 4, w, lines: b.dLines, ...st.body, anchor: 'start', color: 'inkMuted', group, slot: 'text' });
  }
}
