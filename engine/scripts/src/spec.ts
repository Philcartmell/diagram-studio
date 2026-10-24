/** TypeScript view of the diagram spec (see schema/diagram.schema.json). */

export type Altitude = 'executive' | 'management' | 'detailed';
export type Emphasis = 'normal' | 'accent' | 'muted' | 'highlight';
export type Status = 'current' | 'new' | 'changed' | 'retired' | 'at-risk';
export type Aspect = '16:9' | '4:3' | 'A4-landscape' | 'A4-portrait' | 'square' | 'auto';

export const DIAGRAM_TYPES = [
  'operating-model',
  'swimlane',
  'roadmap',
  'value-chain',
  'matrix-2x2',
  'layered-architecture',
  'azure-architecture',
  'databricks-architecture',
  'bar-chart',
  'waterfall',
  'line-chart',
  'kpi',
  'narrative',
  'exhibit',
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

/** Types drawn from numbers: the engine computes totals and deltas, Claude supplies the values. */
export const CHART_TYPES = ['bar-chart', 'waterfall', 'line-chart', 'kpi'] as const;
/** Every type an exhibit panel may hold (anything but another exhibit). */
export type PanelType = Exclude<DiagramType, 'exhibit'>;

export interface SpecNode {
  id: string;
  label: string;
  description?: string;
  owner?: string;
  emphasis?: Emphasis;
  status?: Status;
  tags?: string[];
  icon?: string;
  metric?: string;
}

export interface SpecEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  kind?: 'flow' | 'handoff' | 'feedback';
}

export interface LegendEntry {
  label: string;
  emphasis?: Emphasis;
  status?: Status;
  tag?: string;
}

export interface Spec {
  version: string;
  type: DiagramType;
  altitude?: Altitude;
  theme?: string;
  themeOverrides?: Record<string, unknown>;
  canvas?: { aspect?: Aspect };
  title: string;
  subtitle?: string;
  callout?: { text: string; anchor?: string };
  legend?: 'auto' | 'none' | LegendEntry[];
  footer?: { source?: string; note?: string; classification?: string };
  /** Numbered notes printed above the source line; mark them in text with ¹ ² ³. */
  footnotes?: string[];
  body: Record<string, unknown>;
}

// ---- Type bodies ----------------------------------------------------------

export interface Layer {
  id: string;
  label: string;
  description?: string;
  emphasis?: Emphasis;
  status?: Status;
  nodes: SpecNode[];
}

export interface OperatingModelBody {
  customers?: { label: string; items: string[] };
  layers: Layer[];
  foundations?: string[];
  foundationsLabel?: string;
  governance?: { label: string; description?: string; position?: 'left' | 'right'; items?: string[] };
}

export type StepShape = 'task' | 'decision' | 'start' | 'end' | 'document' | 'system' | 'wait';

export interface SwimlaneStep extends SpecNode {
  lane: string;
  phase?: string;
  shape?: StepShape;
}

export interface SwimlaneBody {
  orientation?: 'horizontal' | 'vertical';
  lanes: { id: string; label: string; description?: string; emphasis?: Emphasis }[];
  phases?: string[];
  steps: SwimlaneStep[];
  edges: SpecEdge[];
}

export interface RoadmapItem extends SpecNode {
  workstream: string;
  start: string;
  end?: string;
}

export interface RoadmapMilestone {
  id: string;
  label: string;
  horizon: string;
  at?: 'start' | 'middle' | 'end';
  kind?: 'milestone' | 'gate';
  workstream?: string;
  emphasis?: Emphasis;
  description?: string;
}

export interface RoadmapBody {
  scale?: 'equal' | 'time';
  horizons: { id: string; label: string; description?: string; start?: string; end?: string }[];
  workstreams: { id: string; label: string; description?: string; emphasis?: Emphasis; owner?: string }[];
  items: RoadmapItem[];
  milestones?: RoadmapMilestone[];
}

export interface ValueChainPrimary extends SpecNode {
  items?: string[];
}

export interface ValueChainBody {
  primary: ValueChainPrimary[];
  support?: { id: string; label: string; description?: string; items?: string[]; emphasis?: Emphasis; status?: Status }[];
  outcome?: { label: string; description?: string };
}

export type QuadrantPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MatrixItem {
  id: string;
  label: string;
  x?: number;
  y?: number;
  quadrant?: QuadrantPosition;
  emphasis?: Emphasis;
  status?: Status;
  metric?: string;
  tags?: string[];
}

export interface MatrixBody {
  xAxis: { label: string; low?: string; high?: string };
  yAxis: { label: string; low?: string; high?: string };
  quadrants: { id?: string; position: QuadrantPosition; label: string; description?: string; emphasis?: Emphasis }[];
  items: MatrixItem[];
}

export interface LayeredArchitectureBody {
  layers: Layer[];
  crossCutting?: { id: string; label: string; description?: string; emphasis?: Emphasis; status?: Status }[];
  external?: SpecNode[];
  externalLabel?: string;
}

// ---- azure-architecture ----------------------------------------------------

export type AzureBoundaryKind =
  | 'azure'
  | 'on-premises'
  | 'region'
  | 'subscription'
  | 'resource-group'
  | 'virtual-network'
  | 'subnet'
  | 'zone'
  | 'group'
  | 'service'
  // Databricks: who runs what, and where the data lives.
  | 'databricks-account'
  | 'cloud-account'
  | 'plane'
  | 'workspace'
  | 'unity-catalog'
  | 'platform'
  | 'panel'
  | 'stage'
  | 'bronze'
  | 'silver'
  | 'gold';

export type AzureLayout = 'row' | 'column' | 'grid';
export type AzureStep = string | number;

/** A service (Azure icon, generic glyph or Lucide icon) or a plain labelled box. */
export interface AzureNode {
  id: string;
  label?: string;
  service?: string;
  icon?: string;
  description?: string;
  emphasis?: Emphasis;
  status?: Status;
  step?: AzureStep;
}

/** A boundary (region, virtual network, subnet…) or, without `boundary`, an invisible layout group. */
export interface AzureContainer {
  id: string;
  boundary?: AzureBoundaryKind;
  label?: string;
  description?: string;
  service?: string;
  layout?: AzureLayout;
  columns?: number;
  nsg?: boolean;
  emphasis?: Emphasis;
  step?: AzureStep;
  children: AzureItem[];
}

export type AzureItem = AzureNode | AzureContainer;

export function isAzureContainer(i: AzureItem): i is AzureContainer {
  return Array.isArray((i as AzureContainer).children);
}

export interface AzureFlow {
  from: string;
  to: string;
  label?: string;
  step?: AzureStep;
  type?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  arrows?: 'forward' | 'both' | 'none';
}

export interface AzureFlowType {
  id: string;
  label: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface AzureArchitectureBody {
  layout?: AzureLayout;
  columns?: number;
  children: AzureItem[];
  flows?: AzureFlow[];
  flowTypes?: AzureFlowType[];
  steps?: { step: AzureStep; text: string }[];
  workflow?: 'auto' | 'right' | 'bottom' | 'none';
  frame?: 'slide' | 'figure';
}

// ---- Charts ------------------------------------------------------------------

/** How numbers print: "£1,050m" is { "prefix": "£", "suffix": "m" }. */
export interface NumberFormat {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Group thousands with commas (default true). */
  thousands?: boolean;
}

export interface ChartSeries {
  id: string;
  label: string;
  emphasis?: Emphasis;
}

export interface BarCategory {
  id?: string;
  label: string;
  /** One value per series, in series order; null for a missing value. */
  values: (number | null)[];
  /** Categories sharing a group sit together under one heading ("2030", "2050"). */
  group?: string;
  emphasis?: Emphasis;
  /** A second figure shown in a badge under the category ("of which opex"). */
  badge?: number;
}

export interface BarDelta {
  from: string;
  to: string;
  /** Overrides the computed difference text. */
  label?: string;
  show?: 'absolute' | 'percent' | 'both';
}

export interface BarChartBody {
  orientation?: 'vertical' | 'horizontal';
  mode?: 'stacked' | 'grouped' | 'percent';
  /** Unit line above the plot ("$ billions"). */
  unit?: string;
  format?: NumberFormat;
  series: ChartSeries[];
  categories: BarCategory[];
  /** Totals above stacked bars (default true when stacked with two or more series). */
  totals?: boolean;
  labels?: 'auto' | 'none';
  /** Series names beside the last bar ("direct") or in a legend; "auto" picks direct when it fits. */
  seriesLabels?: 'auto' | 'direct' | 'legend';
  sort?: 'none' | 'descending' | 'ascending';
  deltas?: BarDelta[];
  /** What the category badges mean, for the legend ("$ of which opex"). */
  badges?: { label: string; format?: NumberFormat };
  palette?: 'sequential' | 'categorical';
}

export interface WaterfallStep {
  id?: string;
  label: string;
  /** Start: the opening level. Delta: the change (negative for a fall). Subtotal and end: computed when left out. */
  value?: number;
  kind?: 'start' | 'delta' | 'subtotal' | 'end';
  emphasis?: Emphasis;
}

export interface WaterfallBody {
  unit?: string;
  format?: NumberFormat;
  steps: WaterfallStep[];
  /** "neutral" (default): totals solid, changes tinted. "direction": rises and falls in two colours. */
  colors?: 'neutral' | 'direction';
  /** With "direction": a fall is good news (costs), so falls take the positive colour. */
  invert?: boolean;
  /** "auto" (default) breaks the axis when every level sits far above zero; "zero" always starts at zero. */
  axis?: 'auto' | 'zero';
}

export interface LineSeries extends ChartSeries {
  values: (number | null)[];
  style?: 'solid' | 'dashed';
}

export interface LineChartBody {
  unit?: string;
  format?: NumberFormat;
  /** Category labels along the x axis (years, quarters, months). */
  x: string[];
  series: LineSeries[];
  yAxis?: { min?: number; max?: number };
  /** A horizontal reference line (an index base of 100, a target). */
  reference?: { value: number; label?: string };
  /** Series names and last values at the line ends (default), or a legend. */
  labels?: 'end' | 'legend';
  markers?: boolean;
  /** Vertical markers at an x label ("COVID-19", "Go-live"). */
  annotations?: { at: string; label: string }[];
}

export interface KpiItem {
  id: string;
  /** The figure as it should print: "27%", "$140 BN", "10–20%". */
  value: string;
  label: string;
  detail?: string;
  emphasis?: Emphasis;
}

export interface KpiBody {
  layout?: 'row' | 'column';
  items: KpiItem[];
}

export interface NarrativeBody {
  heading?: string;
  paragraphs?: string[];
  bullets?: { lead?: string; text: string }[];
}

// ---- exhibit -----------------------------------------------------------------

export interface ExhibitPanel {
  id: string;
  type: PanelType;
  title?: string;
  subtitle?: string;
  /** Relative width (columns) or height (rows); default 1. */
  span?: number;
  altitude?: Altitude;
  legend?: Spec['legend'];
  callout?: Spec['callout'];
  body: Record<string, unknown>;
}

export interface ExhibitBody {
  layout?: 'columns' | 'rows' | 'grid';
  /** Panels per row with "layout": "grid". */
  columns?: number;
  panels: ExhibitPanel[];
  /** Hairlines between panels. */
  dividers?: boolean;
}

/** The stand-alone spec an exhibit panel is laid out from: the panel's body under the exhibit's settings. */
export function panelSpec(parent: Spec, p: ExhibitPanel): Spec {
  return {
    version: parent.version,
    type: p.type,
    title: p.title ?? parent.title,
    altitude: p.altitude ?? parent.altitude,
    theme: parent.theme,
    legend: p.legend ?? 'auto',
    callout: p.callout,
    canvas: { aspect: '16:9' },
    body: p.body,
  };
}
