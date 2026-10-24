/** Cross-reference checks for azure-architecture specs. */
import { resolveService, suggestService } from '../azure/icons.js';
import { type AzureArchitectureBody, type AzureContainer, type AzureItem, type AzureNode, isAzureContainer } from '../spec.js';

export interface WalkedItem {
  item: AzureItem;
  path: string;
  /** Ancestor container ids, outermost first. */
  ancestors: string[];
}

export function walkAzure(body: AzureArchitectureBody): WalkedItem[] {
  const out: WalkedItem[] = [];
  const visit = (items: AzureItem[], path: string, ancestors: string[]) => {
    items.forEach((item, i) => {
      const p = `${path}[${i}]`;
      out.push({ item, path: p, ancestors });
      if (isAzureContainer(item)) visit(item.children, `${p}.children`, [...ancestors, item.id]);
    });
  };
  visit(body.children ?? [], 'body.children', []);
  return out;
}

export function azureNodes(body: AzureArchitectureBody): { node: AzureNode; path: string }[] {
  return walkAzure(body)
    .filter((w) => !isAzureContainer(w.item))
    .map((w) => ({ node: w.item as AzureNode, path: w.path }));
}

/** The label a node shows: its own, else the official service name. */
export function azureLabel(item: AzureNode | AzureContainer): string | undefined {
  if (item.label) return item.label;
  if (item.service) {
    const r = resolveService(item.service);
    if (r) return r.label;
  }
  return undefined;
}

export const stepKey = (s: string | number | undefined): string | undefined => (s === undefined ? undefined : String(s));

const DEFAULT_LABEL: Partial<Record<NonNullable<AzureContainer['boundary']>, string>> = {
  azure: 'Azure',
  'on-premises': 'On-premises',
  subscription: 'Subscription',
  'resource-group': 'Resource group',
  'virtual-network': 'Virtual network',
  subnet: 'Subnet',
};

export function boundaryLabel(c: AzureContainer): string | undefined {
  if (c.label) return c.label;
  if (c.boundary === 'service') return azureLabel(c);
  return c.boundary ? DEFAULT_LABEL[c.boundary] : undefined;
}

type Report = (path: string, message: string, code: string) => void;

export function checkAzure(body: AzureArchitectureBody, err: Report, warn: Report): void {
  const walked = walkAzure(body);
  const byId = new Map(walked.map((w) => [w.item.id, w]));

  const checkService = (path: string, name: string) => {
    const r = resolveService(name);
    if (!r) {
      const g = suggestService(name);
      err(
        path,
        `"${name}" is not an Azure icon id or alias.${g ? ` Did you mean "${g}"?` : ''} Run \`diagram-studio azure icons <words>\` to search the catalog.`,
        'ref.service',
      );
    } else if (r.kind === 'missing') {
      err(path, `"${name}" (${r.label}) has no icon here. ${r.note}`, 'ref.service-missing');
    }
  };

  for (const { item, path } of walked) {
    if (isAzureContainer(item)) {
      const c = item;
      if (c.service) checkService(`${path}.service`, c.service);
      if (c.boundary === 'service' && !c.service)
        err(`${path}.service`, `is missing: a "service" boundary shows the icon of the resource that contains the others (e.g. "kubernetes-services" for an AKS cluster).`, 'ref.boundary-service');
      if (c.service && c.boundary !== 'service')
        warn(`${path}.service`, `only "service" boundaries show an icon; set "boundary": "service" or remove "service".`, 'ref.boundary-service');
      if (!c.boundary && (c.label || c.nsg || c.step !== undefined || c.emphasis))
        warn(path, `has no "boundary", so it is an invisible layout group and its label, nsg, step and emphasis are not drawn. Add "boundary" (for example "group") to draw it.`, 'ref.invisible-group');
      if ((c.boundary === 'region' || c.boundary === 'zone') && !c.label)
        err(`${path}.label`, `is missing: name the ${c.boundary} (for example "${c.boundary === 'region' ? 'East US 2' : 'Zone 1'}").`, 'ref.boundary-label');
      if (c.nsg && c.boundary !== 'subnet') warn(`${path}.nsg`, `network security groups attach to subnets; this is a ${c.boundary ?? 'layout group'}.`, 'ref.nsg');
      if (c.columns && c.layout && c.layout !== 'grid') warn(`${path}.columns`, `only applies to "layout": "grid".`, 'ref.columns');
    } else {
      const n = item;
      if (n.service) checkService(`${path}.service`, n.service);
      if (n.service && n.icon) err(path, `has both "service" and "icon"; use "service" for Azure services and "icon" only for non-Azure things.`, 'ref.icon');
      if (!n.label && !n.service) err(`${path}.label`, `is missing: a node without a "service" needs a label.`, 'ref.label');
    }
  }

  // Flows.
  const types = new Set((body.flowTypes ?? []).map((t) => t.id));
  const seen = new Set<string>();
  const usedSteps = new Set<string>();
  for (const w of walked) {
    const s = stepKey(w.item.step);
    if (s) usedSteps.add(s);
  }
  (body.flows ?? []).forEach((f, i) => {
    const path = `body.flows[${i}]`;
    for (const end of ['from', 'to'] as const) {
      const w = byId.get(f[end]);
      if (!w) {
        const g = [...byId.keys()].find((k) => k.includes(f[end])) ?? undefined;
        err(`${path}.${end}`, `"${f[end]}" is not a node or boundary id.${g ? ` Did you mean "${g}"?` : ''}`, 'ref.flow');
      } else if (isAzureContainer(w.item) && !w.item.boundary) {
        err(`${path}.${end}`, `"${f[end]}" is an invisible layout group; connect a node or a drawn boundary instead.`, 'ref.flow');
      }
    }
    if (f.from === f.to) err(path, `connects "${f.from}" to itself. Remove it or describe the loop in a label.`, 'ref.self-loop');
    const a = byId.get(f.from);
    const b = byId.get(f.to);
    if (a && b && (a.ancestors.includes(f.to) || b.ancestors.includes(f.from)))
      err(path, `connects "${f.from}" and "${f.to}", but one contains the other. Connect the node to a sibling, or to a node outside the boundary.`, 'ref.flow-nesting');
    if (f.type && !types.has(f.type)) {
      err(`${path}.type`, `"${f.type}" is not in "flowTypes"${types.size ? ` (${[...types].join(', ')})` : '; add a flowTypes list'}.`, 'ref.flow-type');
    }
    const key = `${f.from}>${f.to}>${f.type ?? ''}`;
    if (seen.has(key)) warn(path, `duplicates an earlier flow from "${f.from}" to "${f.to}".`, 'ref.duplicate-edge');
    seen.add(key);
    const s = stepKey(f.step);
    if (s) usedSteps.add(s);
  });
  if (types.size && (body.flows ?? []).length && !(body.flows ?? []).some((f) => f.type))
    warn('body.flowTypes', 'is set but no flow uses a "type"; give each flow its type, or remove flowTypes.', 'ref.flow-type');

  // Steps narrative.
  const textFor = new Set<string>();
  (body.steps ?? []).forEach((s, i) => {
    const k = String(s.step);
    if (textFor.has(k)) err(`body.steps[${i}].step`, `step ${k} is described twice.`, 'ref.step');
    textFor.add(k);
    if (!usedSteps.has(k)) warn(`body.steps[${i}].step`, `step ${k} is described but no flow, node or boundary carries "step": "${k}".`, 'ref.step');
  });
  if (textFor.size) {
    const missing = [...usedSteps].filter((s) => !textFor.has(s));
    if (missing.length) warn('body.steps', `steps ${missing.join(', ')} appear on the diagram but have no text in "steps".`, 'ref.step');
  }
}
