/**
 * layered-architecture: system layers as stacked bands in plain words,
 * cross-cutting concerns as vertical bars on the right and external parties
 * in a column on the left.
 */
import type { LayeredArchitectureBody } from '../spec.js';
import { bandLook, nodeLook } from '../theme/paint.js';
import { clamp, snap, snapDown } from '../util.js';
import { type Band, layoutBands, nodeItem } from './bands.js';
import { type LayoutContext, addShape, addText, lh, styles, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';
import { drawNode, nodeHeight } from './node.js';

const GAP = 16;

export function layoutLayeredArchitecture(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as LayeredArchitectureBody;
  const { theme } = ctx;
  const st = styles(theme);
  const cross = body.crossCutting ?? [];
  const ext = body.external ?? [];
  const frame = beginFrame(ctx, { calloutSide: 'right' });
  const C = frame.content;

  const extW = ext.length ? clamp(snap(C.w * 0.15), 152, 200) : 0;
  const barW = cross.length ? clamp(snapDown((C.w * 0.24) / cross.length - GAP), 96, 136) : 0;
  const crossW = cross.length * (barW + GAP);
  const main = { x: C.x + (extW ? extW + GAP : 0), y: C.y, w: C.w - (extW ? extW + GAP : 0) - crossW, h: C.h };

  const bands: Band[] = body.layers.map((layer) => ({
    id: layer.id,
    specId: layer.id,
    label: layer.label,
    description: layer.description,
    emphasis: layer.emphasis,
    status: layer.status,
    itemKind: 'node',
    items: layer.nodes.map(nodeItem),
  }));
  const res = layoutBands(ctx, main, bands);
  const top = main.y;
  const bottom = res.bottom;

  // Cross-cutting bars span every layer.
  cross.forEach((c, i) => {
    const x = main.x + main.w + GAP + i * (barW + GAP);
    drawNode(ctx, {
      id: c.id,
      specId: c.id,
      shape: 'rect',
      role: 'group',
      x,
      y: top,
      w: barW,
      h: bottom - top,
      look: nodeLook(theme, c.emphasis ?? 'normal', c.status),
      content: { label: c.label, description: c.description, status: c.status },
      emphasis: c.emphasis,
      alignGroup: { group: 'cross-cutting', axis: 'row' },
      kind: 'cross-cutting',
    });
  });

  // External parties: a dashed column with stacked boxes.
  if (ext.length) {
    const look = bandLook(theme, 'muted');
    const colBox = { x: C.x, y: top, w: extW, h: bottom - top };
    addShape(ctx, {
      id: 'external',
      role: 'group',
      shape: 'rect',
      ...colBox,
      radius: theme.shape.radius,
      paint: { fill: 'background', stroke: 'line', strokeWidth: theme.shape.stroke, dash: 'dashed' },
      container: true,
      inset: { l: 12, r: 12, t: 8, b: 8 },
      meta: { kind: 'external', label: body.externalLabel ?? 'External parties' },
    });
    const head = wrap(ctx, body.externalLabel ?? 'External parties', extW - 24, st.group);
    const headH = head.length * lh(ctx, st.group.size);
    addText(ctx, { id: 'external--label', role: 'header', x: C.x + 12, y: top + 12, w: extW - 24, lines: head, ...st.group, anchor: 'start', color: look.ink, box: 'external', slot: 'heading' });
    const innerTop = snap(top + 12 + headH + 12);
    const innerH = bottom - 12 - innerTop;
    const w = extW - 24;
    const need = Math.max(...ext.map((n) => nodeHeight(ctx, { label: n.label, description: n.description, status: n.status }, 'rect', w, undefined, 48)));
    const h = Math.max(need, Math.min(96, snapDown((innerH - (ext.length - 1) * GAP) / ext.length)));
    const blockH = ext.length * h + (ext.length - 1) * GAP;
    const y0 = snap(innerTop + Math.max(0, (innerH - blockH) / 2));
    ext.forEach((n, i) => {
      drawNode(ctx, {
        id: n.id,
        specId: n.id,
        shape: 'rect',
        x: C.x + 12,
        y: y0 + i * (h + GAP),
        w,
        h,
        look: nodeLook(theme, n.emphasis ?? 'normal', n.status),
        content: { label: n.label, description: n.description, metric: n.metric, owner: n.owner, status: n.status, tags: n.tags, icon: n.icon },
        emphasis: n.emphasis,
        alignGroup: { group: 'external', axis: 'column' },
        parent: 'external',
        kind: 'external',
      });
    });
    if (y0 + blockH > bottom - 8) {
      ctx.issues.push({ path: 'body.external', id: 'external', code: 'canvas-fit', message: 'External parties do not fit beside the layers. List fewer external parties or add layers.' });
    }
  }
  endFrame(ctx, frame, bottom);
}
