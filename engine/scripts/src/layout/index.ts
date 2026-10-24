/** Layout registry: one module per diagram type, each producing a scene graph. */
import type { Scene } from '../scene/types.js';
import type { DiagramType, Spec } from '../spec.js';
import type { FontSet } from '../text/measure.js';
import type { Theme } from '../theme/types.js';
import type { Issue } from '../validate/messages.js';
import { countedNodes } from '../validate/spec.js';
import { type LayoutContext, createContext } from './context.js';
import { layoutOperatingModel } from './operating-model.js';
import { layoutSwimlane } from './swimlane.js';
import { layoutRoadmap } from './roadmap.js';
import { layoutValueChain } from './value-chain.js';
import { layoutMatrix } from './matrix-2x2.js';
import { layoutLayeredArchitecture } from './layered-architecture.js';
import { layoutAzureArchitecture } from './azure-architecture.js';
import type { AzureArchitectureBody } from '../spec.js';

type LayoutFn = (ctx: LayoutContext) => void | Promise<void>;

const LAYOUTS: Record<DiagramType, LayoutFn> = {
  'operating-model': layoutOperatingModel,
  swimlane: layoutSwimlane,
  roadmap: layoutRoadmap,
  'value-chain': layoutValueChain,
  'matrix-2x2': layoutMatrix,
  'layered-architecture': layoutLayeredArchitecture,
  'azure-architecture': layoutAzureArchitecture,
};

export interface LayoutResult {
  scene: Scene;
  issues: Issue[];
  notes: string[];
}

export async function layout(spec: Spec, theme: Theme, fonts: FontSet): Promise<LayoutResult> {
  const ctx = createContext(spec, theme, fonts);
  if (theme.style.grid) {
    ctx.els.push({ kind: 'grid', id: 'ds-grid', role: 'decoration', x: 0, y: 0, w: ctx.W, h: ctx.H, spacing: 24, color: 'line@22' });
  }
  await LAYOUTS[spec.type](ctx);
  const grid = ctx.els.find((e) => e.kind === 'grid');
  if (grid && grid.kind === 'grid') grid.h = ctx.H;
  const workflow =
    spec.type === 'azure-architecture' ? ((spec.body as unknown as AzureArchitectureBody).steps ?? []).map((s) => `${s.step}. ${s.text}`) : [];
  const notes = [spec.subtitle, spec.callout?.text ? `So what: ${spec.callout.text}` : undefined, ...(workflow.length ? ['Workflow:', ...workflow] : [])]
    .filter(Boolean)
    .join('\n');
  const scene: Scene = {
    width: ctx.W,
    height: ctx.H,
    margin: ctx.margin,
    background: 'background',
    elements: ctx.els,
    meta: {
      type: spec.type,
      altitude: ctx.altitude,
      themeId: theme.id,
      title: spec.title,
      subtitle: spec.subtitle,
      notes: notes || undefined,
      nodeCount: countedNodes(spec).length,
    },
  };
  return { scene, issues: ctx.issues, notes: ctx.notes };
}
