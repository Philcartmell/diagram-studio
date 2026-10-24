import fs from 'node:fs';
import path from 'node:path';
import { DIAGRAM_TYPES, type DiagramType } from './spec.js';
import { dirs } from './util.js';

export const TYPE_INFO: Record<DiagramType, { summary: string; useFor: string; essentials: string[] }> = {
  'operating-model': {
    summary: 'Layers of capability top-down: customers on top, foundations below, governance at the side.',
    useFor: '"How we are organised to deliver" — target operating models, service models.',
    essentials: ['customers', 'layers[]', 'foundations[]', 'governance'],
  },
  swimlane: {
    summary: 'Who does what across teams, with handoffs between lanes and phases as columns.',
    useFor: '"Who does what across teams" — processes, approvals, handoffs.',
    essentials: ['lanes[]', 'phases[]', 'steps[]', 'edges[]'],
  },
  roadmap: {
    summary: 'Horizons over time as columns, workstreams as rows, items as bars, milestones and gates.',
    useFor: '"What happens when" — transformation plans, programme timelines.',
    essentials: ['horizons[]', 'workstreams[]', 'items[]', 'milestones[]'],
  },
  'value-chain': {
    summary: 'Primary activities as chevrons, support activities as bands, an outcome at the end.',
    useFor: '"How we create value" — end-to-end activity chains with focus areas highlighted.',
    essentials: ['primary[]', 'support[]', 'outcome'],
  },
  'matrix-2x2': {
    summary: 'Items placed on two axes with four named quadrants.',
    useFor: '"Where to focus" — prioritisation, portfolio positioning, trade-offs.',
    essentials: ['xAxis', 'yAxis', 'quadrants[4]', 'items[]'],
  },
  'layered-architecture': {
    summary: 'System layers in plain words, with optional cross-cutting bars and external parties.',
    useFor: '"How the system fits together" — architecture for non-technical audiences.',
    essentials: ['layers[]', 'crossCutting[]', 'external[]'],
  },
  'azure-architecture': {
    summary: 'Azure services as official icons inside nested boundaries (region, virtual network, subnet, zone), with numbered flows and a workflow narrative, in Microsoft reference-architecture style.',
    useFor: '"How this runs on Azure" — solution workflows with numbered steps, and network or infrastructure topologies.',
    essentials: ['children[] (services and boundaries)', 'flows[]', 'steps[]', 'flowTypes[]'],
  },
  'databricks-architecture': {
    summary: 'Databricks products as official icons inside platform boundaries (control plane, compute plane, workspace, Unity Catalog, medallion layers), with numbered flows, in the Databricks brand look.',
    useFor: '"How this runs on Databricks" — lakehouse data flows, platform and workspace topology, governance and AI serving.',
    essentials: ['children[] (products and boundaries)', 'flows[]', 'steps[]', 'flowTypes[]'],
  },
  'bar-chart': {
    summary: 'Columns or bars from numbers: single, stacked, grouped or 100% stacked, with figures on the data, computed totals and difference arrows.',
    useFor: '"How big, and how it splits" — cost stacks, before and after, rankings, share of total.',
    essentials: ['series[]', 'categories[] (label, values[], group)', 'deltas[]', 'format'],
  },
  waterfall: {
    summary: 'A starting level, the rises and falls that move it, and the level they reach; subtotals and the end are computed.',
    useFor: '"What moved the number" — profit bridges, cost-saving walks, headcount changes.',
    essentials: ['steps[] (start, delta, subtotal, end)', 'format', 'colors'],
  },
  'line-chart': {
    summary: 'Values over time as lines, named at their ends, with an optional reference line and event markers.',
    useFor: '"How it moved over time" — trends, indices, forecasts against actuals.',
    essentials: ['x[]', 'series[] (values[])', 'reference', 'annotations[]'],
  },
  kpi: {
    summary: 'Big figures with a line of explanation each, in a row or a column.',
    useFor: '"The numbers that matter" — headline results, a KPI strip beside a chart.',
    essentials: ['items[] (value, label, detail)'],
  },
  narrative: {
    summary: 'A short block of text: a heading, paragraphs and bulleted points with bold lead-ins.',
    useFor: 'The argument beside an exhibit — benefits and risks, what it means, next steps.',
    essentials: ['heading', 'paragraphs[]', 'bullets[]'],
  },
  exhibit: {
    summary: 'One slide built from panels: any chart or diagram type side by side, in rows or in a grid, under one action title.',
    useFor: 'Consulting-style exhibits — narrative beside a chart, small multiples, an architecture with its cost case.',
    essentials: ['layout', 'panels[] (type, title, span, body)'],
  },
};

export function listTypes() {
  return DIAGRAM_TYPES.map((t) => ({ type: t, ...TYPE_INFO[t], reference: `references/${t}.md` }));
}

/** Example specs bundled for a type, sorted by file name. */
export function exampleFiles(type: DiagramType): string[] {
  const dir = path.join(dirs.examples, type);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}
