/**
 * narrative: the words beside an exhibit. A heading, short paragraphs and
 * bulleted points, each with an optional bold lead-in on its own line.
 */
import type { NarrativeBody } from '../spec.js';
import { type LayoutContext, addShape, addText, lh, styles, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';

export function layoutNarrative(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as NarrativeBody;
  const st = styles(ctx.theme);
  const f = ctx.theme.font;
  const text = { size: f.size.label, weight: f.weight.body };
  const lead = { size: f.size.label, weight: f.weight.label };
  const tLh = lh(ctx, text.size);
  const frame = beginFrame(ctx);
  const C = frame.content;
  let y = C.y;

  if (body.heading) {
    const lines = wrap(ctx, body.heading, C.w, st.group);
    addText(ctx, { id: 'narrative-heading', role: 'header', x: C.x, y, w: C.w, lines, ...st.group, anchor: 'start', color: 'text(accent,background)', slot: 'heading' });
    y += lines.length * lh(ctx, st.group.size) + 10;
  }
  (body.paragraphs ?? []).forEach((p, i) => {
    const lines = wrap(ctx, p, C.w, text);
    addText(ctx, { id: `paragraph-${i + 1}`, role: 'label', x: C.x, y, w: C.w, lines, ...text, anchor: 'start', color: 'ink', slot: 'text' });
    y += lines.length * tLh + 12;
  });
  const indent = 16;
  (body.bullets ?? []).forEach((b, i) => {
    const id = `point-${i + 1}`;
    const group = `g-${id}`;
    addShape(ctx, { id: `${id}--bullet-1`, role: 'marker', shape: 'ellipse', x: C.x + 2, y: y + tLh / 2 - 2.5, w: 5, h: 5, paint: { fill: 'accent', stroke: 'none', strokeWidth: 0 }, box: false, group });
    if (b.lead) {
      const lines = wrap(ctx, b.lead, C.w - indent, lead);
      addText(ctx, { id: `${id}--lead`, role: 'label', x: C.x + indent, y, w: C.w - indent, lines, ...lead, anchor: 'start', color: 'ink', group, slot: 'item' });
      y += lines.length * tLh;
    }
    const lines = wrap(ctx, b.text, C.w - indent, text);
    addText(ctx, { id: `${id}--text`, role: 'label', x: C.x + indent, y, w: C.w - indent, lines, ...text, anchor: 'start', color: b.lead ? 'inkMuted' : 'ink', group, slot: b.lead ? 'text' : 'item' });
    y += lines.length * tLh + 12;
  });
  endFrame(ctx, frame, y - 12);
}
