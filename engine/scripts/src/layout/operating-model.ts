/**
 * operating-model: customers on top, capability layers as stacked bands,
 * foundations below and governance as a side bar spanning the layers.
 */
import type { OperatingModelBody } from '../spec.js';
import { nodeLook } from '../theme/paint.js';
import { clamp, snap } from '../util.js';
import { type Band, layoutBands, nodeItem } from './bands.js';
import type { LayoutContext } from './context.js';
import { beginFrame, endFrame } from './frame.js';
import { drawNode } from './node.js';

export function layoutOperatingModel(ctx: LayoutContext): void {
  const body = ctx.spec.body as unknown as OperatingModelBody;
  const gov = body.governance;
  const govSide = gov ? gov.position ?? 'right' : undefined;
  const frame = beginFrame(ctx, { calloutSide: govSide === 'right' ? 'left' : 'right' });
  const area = frame.content;

  const GW = gov ? clamp(snap(area.w * 0.15), 144, 192) : 0;
  const main = gov
    ? { ...area, x: govSide === 'left' ? area.x + GW + 16 : area.x, w: area.w - GW - 16 }
    : area;

  const bands: Band[] = [];
  if (body.customers) {
    bands.push({
      id: 'customers',
      label: body.customers.label,
      itemKind: 'pill',
      items: body.customers.items.map((label, i) => ({ id: `customers-${i + 1}`, content: { label } })),
    });
  }
  for (const layer of body.layers) {
    bands.push({
      id: layer.id,
      specId: layer.id,
      label: layer.label,
      description: layer.description,
      emphasis: layer.emphasis,
      status: layer.status,
      itemKind: 'node',
      items: layer.nodes.map(nodeItem),
    });
  }
  if (body.foundations) {
    bands.push({
      id: 'foundations',
      label: body.foundationsLabel ?? 'Foundations',
      itemKind: 'tile',
      items: body.foundations.map((label, i) => ({ id: `foundations-${i + 1}`, content: { label } })),
    });
  }

  const res = layoutBands(ctx, main, bands);

  if (gov) {
    const first = res.boxes.get(body.layers[0].id)!;
    const last = res.boxes.get(body.layers[body.layers.length - 1].id)!;
    const x = govSide === 'left' ? area.x : area.x + area.w - GW;
    drawNode(ctx, {
      id: 'governance',
      shape: 'rect',
      role: 'group',
      x,
      y: first.y,
      w: GW,
      h: last.y + last.h - first.y,
      look: nodeLook(ctx.theme, 'normal'),
      content: { label: gov.label, description: gov.description, items: gov.items },
      kind: 'governance',
    });
  }
  endFrame(ctx, frame, res.bottom);
}
