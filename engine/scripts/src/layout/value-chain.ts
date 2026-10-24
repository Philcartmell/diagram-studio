/**
 * value-chain: support activities as bands on top, primary activities as
 * interlocking chevrons sharing width equally, optional detail panels under
 * each chevron and an outcome arrow at the end.
 */
import type { Box } from '../scene/types.js';
import type { ValueChainBody } from '../spec.js';
import { bandLook, nodeLook, panelLook } from '../theme/paint.js';
import { clamp, snap, snapDown, snapUp } from '../util.js';
import { headerWidth } from './bands.js';
import { type LayoutContext, addShape, addText, lh, styles, wrap } from './context.js';
import { beginFrame, endFrame } from './frame.js';
import { drawNode, nodeHeight } from './node.js';

const GAP = 16;

export function layoutValueChain(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as ValueChainBody;
  const { theme } = ctx;
  const st = styles(theme);
  const d = theme.shape.chevronDepth;
  const frame = beginFrame(ctx, { calloutSide: 'right' });
  const C = frame.content;
  const support = body.support ?? [];
  const n = body.primary.length;

  const OW = body.outcome ? clamp(snap(C.w * 0.13), 136, 176) : 0;
  const chainW = C.w - (OW ? OW + GAP : 0);
  // Chevrons interlock: each starts one chevron width minus the point depth plus a gap later.
  const cw = snapDown((chainW + (n - 1) * (d - GAP)) / n);
  const pitch = cw - d + GAP;
  const xs = body.primary.map((_, i) => C.x + i * pitch);
  const chainRight = xs[n - 1] + cw;

  // Heights.
  const supportHw = support.length ? headerWidth(ctx, C, support.map((s) => ({ id: s.id, label: s.label, items: [], itemKind: 'node' as const }))) : 0;
  const supportText = (s: (typeof support)[number]) => [s.description, (s.items ?? []).join('  ·  ')].filter(Boolean).join('\n');
  const supportH = support.map((s) => {
    const tw = chainRight - C.x - supportHw - 16;
    const lines = supportText(s) ? wrap(ctx, supportText(s), tw, st.body).length : 0;
    const head = wrap(ctx, s.label, supportHw - 24, st.group).length * lh(ctx, st.group.size);
    return snapUp(Math.max(40, lines * lh(ctx, st.body.size) + 20, head + 16));
  });
  const chevContent = (p: ValueChainBody['primary'][number]) => ({ label: p.label, metric: p.metric, owner: p.owner, status: p.status, tags: p.tags, icon: p.icon });
  const chevH = Math.max(
    72,
    ...body.primary.map((p, i) => nodeHeight(ctx, chevContent(p), i === 0 ? 'pentagon' : 'chevron', cw, undefined, 72)),
  );
  const panelW = cw - d;
  const hasPanels = body.primary.some((p) => p.description || p.items?.length);
  const panelNeed = hasPanels
    ? Math.max(
        ...body.primary.map((p) => {
          let h = 24;
          if (p.description) h += wrap(ctx, p.description, panelW - 24, st.body).length * lh(ctx, st.body.size);
          for (const it of p.items ?? []) h += 4 + wrap(ctx, it, panelW - 36, st.body).length * lh(ctx, st.body.size);
          return snapUp(h);
        }),
      )
    : 0;

  const supportTotal = supportH.reduce((a, b) => a + b, 0) + support.length * GAP;
  let chevronH = chevH;
  let panelH = panelNeed;
  const used = supportTotal + chevronH + (hasPanels ? GAP + panelH : 0);
  const extra = ctx.auto ? 0 : snapDown(C.h - used);
  // Share spare height modestly; oversized empty boxes read as unfinished.
  let gapAfterSupport = GAP;
  if (extra > 0) {
    let left = extra;
    const take = (cap: number) => {
      const t = Math.min(left, cap);
      left -= t;
      return t;
    };
    chevronH += take(40);
    if (hasPanels) panelH += take(64);
    for (let i = 0; i < supportH.length; i++) supportH[i] += take(8);
    if (support.length) gapAfterSupport += take(16);
  }

  // Support bands.
  let y = C.y;
  support.forEach((s, i) => {
    const look = bandLook(theme, s.emphasis ?? 'normal', s.status);
    const b: Box = { x: C.x, y, w: chainRight - C.x, h: supportH[i] };
    ctx.anchors.set(s.id, b);
    addShape(ctx, {
      id: s.id,
      role: 'band',
      shape: 'rect',
      ...b,
      radius: theme.shape.radius,
      paint: look.paint,
      inset: { l: 12, r: 12, t: 6, b: 6 },
      align: { group: 'support', axis: 'column' },
      meta: { specId: s.id, kind: 'support', label: s.label, emphasis: s.emphasis ?? 'normal', status: s.status },
    });
    const head = wrap(ctx, s.label, supportHw - 24, st.group);
    addText(ctx, { id: `${s.id}--label`, role: 'header', x: C.x + 16, y: y + (b.h - head.length * lh(ctx, st.group.size)) / 2, w: supportHw - 24, lines: head, ...st.group, anchor: 'start', color: look.ink, box: s.id, slot: 'heading' });
    const txt = supportText(s);
    if (txt) {
      const tw = b.w - supportHw - 16;
      const lines = wrap(ctx, txt, tw, st.body);
      addText(ctx, { id: `${s.id}--description`, role: 'label', x: C.x + supportHw, y: y + (b.h - lines.length * lh(ctx, st.body.size)) / 2, w: tw, lines, ...st.body, anchor: 'start', color: look.inkMuted, box: s.id, slot: 'description' });
    }
    y += b.h + (i === support.length - 1 ? gapAfterSupport : GAP);
  });

  // Primary chevrons.
  const chevTop = y;
  body.primary.forEach((p, i) => {
    const shape = i === 0 ? 'pentagon' : 'chevron';
    const x = xs[i];
    drawNode(ctx, {
      id: p.id,
      specId: p.id,
      shape,
      x,
      y: chevTop,
      w: cw,
      h: chevronH,
      look: nodeLook(theme, p.emphasis ?? 'normal', p.status),
      content: chevContent(p),
      emphasis: p.emphasis,
      alignGroup: { group: 'primary', axis: 'row' },
      hitbox: { x: x + (i === 0 ? 0 : d / 2), y: chevTop, w: cw - (i === 0 ? d / 2 : d), h: chevronH },
      kind: 'primary',
    });
  });

  // Detail panels under the chevrons.
  if (hasPanels) {
    const py = chevTop + chevronH + GAP;
    body.primary.forEach((p, i) => {
      const accent = p.emphasis === 'accent' || p.emphasis === 'highlight';
      const look = accent ? panelLook(theme, 'accent') : panelLook(theme);
      const pb: Box = { x: xs[i] + d / 2, y: py, w: panelW, h: panelH };
      const pid = `${p.id}--panel`;
      addShape(ctx, {
        id: pid,
        role: 'node',
        shape: 'rect',
        ...pb,
        radius: theme.shape.radius,
        paint: { ...look.paint, stroke: accent ? look.paint.stroke : 'none' },
        inset: { l: 12, r: 12, t: 12, b: 8 },
        align: { group: 'panels', axis: 'row' },
        group: `g-${p.id}`,
        meta: { kind: 'panel', label: p.label },
      });
      let ty = py + 12;
      if (p.description) {
        const lines = wrap(ctx, p.description, panelW - 24, st.body);
        addText(ctx, { id: `${p.id}--description`, role: 'label', x: pb.x + 12, y: ty, w: panelW - 24, lines, ...st.body, anchor: 'start', color: look.inkMuted, box: pid, group: `g-${p.id}`, slot: 'description' });
        ty += lines.length * lh(ctx, st.body.size) + 4;
      }
      (p.items ?? []).forEach((it, k) => {
        const lines = wrap(ctx, it, panelW - 36, st.body);
        addShape(ctx, {
          id: `${p.id}--bullet-${k + 1}`,
          role: 'marker',
          shape: 'ellipse',
          x: pb.x + 13,
          y: ty + lh(ctx, st.body.size) / 2 - 2.5,
          w: 5,
          h: 5,
          paint: { fill: accent ? 'accent' : 'lineStrong', stroke: 'none', strokeWidth: 0 },
          box: false,
          group: `g-${p.id}`,
        });
        addText(ctx, { id: `${p.id}--item-${k + 1}`, role: 'label', x: pb.x + 24, y: ty, w: panelW - 36, lines, ...st.body, anchor: 'start', color: look.ink, box: pid, group: `g-${p.id}`, slot: 'item' });
        ty += lines.length * lh(ctx, st.body.size) + 4;
      });
    });
  }

  // Outcome: an arrow spanning the support bands and the chevron row.
  if (body.outcome) {
    const ox = C.x + C.w - OW;
    const oy = C.y;
    const oh = chevTop + chevronH - oy;
    drawNode(ctx, {
      id: 'outcome',
      shape: 'pentagon',
      x: ox,
      y: oy,
      w: OW,
      h: oh,
      look: nodeLook(theme, 'normal'),
      content: { label: body.outcome.label, description: body.outcome.description },
      kind: 'outcome',
      options: { pad: 12 },
      depth: Math.min(40, Math.round(OW / 4)),
    });
  }

  const bottom = hasPanels ? chevTop + chevronH + GAP + panelH : chevTop + chevronH;
  endFrame(ctx, frame, bottom);
}
