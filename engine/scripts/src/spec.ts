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
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

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
