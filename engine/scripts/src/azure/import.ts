/**
 * Draft an azure-architecture spec from what is deployed: an ARM template (from
 * `az group export` or authored by hand) or a resource list (`az resource list`,
 * Azure Resource Graph). The draft carries topology, not meaning: regions, virtual
 * networks, subnets and the services placed in them, plus the few flows ARM states
 * outright (private endpoints, gateway backends, peerings, connections, DNS links).
 * Claude then adds the story: an action title, the data flows and numbered steps.
 */
import type { AzureArchitectureBody, AzureContainer, AzureFlow, AzureItem, AzureNode } from '../spec.js';
import { iconForArmType, resolveService } from './icons.js';

export interface ImportOptions {
  title?: string;
  /** Source file name, for the default title and the report. */
  source?: string;
}

export interface ImportReport {
  format: 'arm-template' | 'resource-list';
  resources: number;
  nodes: number;
  boundaries: number;
  flows: number;
  regions: string[];
  skipped: { type: string; count: number; reason: string }[];
  unmapped: { type: string; count: number }[];
  notes: string[];
}

export interface ImportResult {
  spec: Record<string, unknown>;
  report: ImportReport;
}

interface Res {
  /** Full lower-case type, e.g. microsoft.network/virtualnetworks/subnets */
  type: string;
  /** Display type with original casing. */
  typeRaw: string;
  /** Full name (parent/child for child resources). */
  name: string;
  /** Leaf name. */
  leaf: string;
  /** Lower-case pseudo resource id: type|name, used to match references. */
  key: string;
  location?: string;
  kind?: string;
  sku?: string;
  properties: Record<string, unknown>;
}

// ---- ARM expression evaluation (enough for exported templates) ----------------

type Scope = { params: Record<string, unknown>; vars: Record<string, unknown> };

function splitTopArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && s[i + 1] === "'" && quote) {
      cur += "''";
      i++;
      continue;
    }
    if (ch === "'") quote = !quote;
    if (!quote && (ch === '(' || ch === '[')) depth++;
    if (!quote && (ch === ')' || ch === ']')) depth--;
    if (!quote && depth === 0 && ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function evalExpr(expr: string, scope: Scope, depth = 0): unknown {
  const e = expr.trim();
  if (depth > 12) return e;
  if (/^'.*'$/s.test(e)) return e.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+$/.test(e)) return Number(e);
  const m = /^([A-Za-z][\w.]*)\((.*)\)((?:\.[\w]+|\[[^\]]*\])*)$/s.exec(e);
  if (!m) return e;
  const fn = m[1].toLowerCase();
  const args = splitTopArgs(m[2]).map((a) => evalExpr(a, scope, depth + 1));
  let v: unknown;
  switch (fn) {
    case 'parameters': {
      const p = scope.params[String(args[0])] as { defaultValue?: unknown; value?: unknown } | undefined;
      v = p?.value ?? p?.defaultValue;
      if (typeof v === 'string' && v.startsWith('[') && v.endsWith(']')) v = evalExpr(v.slice(1, -1), scope, depth + 1);
      break;
    }
    case 'variables': {
      v = scope.vars[String(args[0])];
      if (typeof v === 'string' && v.startsWith('[') && v.endsWith(']')) v = evalExpr(v.slice(1, -1), scope, depth + 1);
      break;
    }
    case 'concat':
      v = args.every((a) => Array.isArray(a)) ? (args as unknown[][]).flat() : args.map((a) => (a === undefined ? '' : String(a))).join('');
      break;
    case 'format':
      v = String(args[0] ?? '').replace(/\{(\d+)\}/g, (_x, i: string) => String(args[Number(i) + 1] ?? ''));
      break;
    case 'tolower':
      v = String(args[0] ?? '').toLowerCase();
      break;
    case 'toupper':
      v = String(args[0] ?? '').toUpperCase();
      break;
    case 'resourceid':
    case 'subscriptionresourceid':
    case 'extensionresourceid': {
      // Build a real ARM id: /providers/Ns/type1/name1/type2/name2 (any subscription or group arguments are dropped).
      const typed = args.filter((a) => typeof a === 'string') as string[];
      const ti = typed.findIndex((a) => /^[A-Za-z]+\.[A-Za-z]+\/.+/.test(a));
      if (ti < 0) return `[${e}]`;
      const [ns, ...types] = typed[ti].split('/');
      const names = typed.slice(ti + 1);
      v = `/providers/${ns}/${types.map((t, i) => `${t}/${names[i] ?? ''}`).join('/')}`;
      break;
    }
    case 'resourcegroup':
      v = { location: 'resourcegroup', name: 'resourcegroup' };
      break;
    case 'uniquestring':
      v = 'unique';
      break;
    default:
      return `[${e}]`;
  }
  // Property access: .location, ['name'] …
  for (const acc of m[3].matchAll(/\.(\w+)|\['([^']*)'\]/g)) {
    const k = acc[1] ?? acc[2];
    v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  }
  return v;
}

function evalValue(v: unknown, scope: Scope): unknown {
  if (typeof v === 'string' && v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) return evalExpr(v.slice(1, -1), scope);
  if (Array.isArray(v)) return v.map((x) => evalValue(x, scope));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, evalValue(x, scope)]));
  return v;
}

// ---- Reading the input -----------------------------------------------------------

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function parseIdString(id: string): { type: string; name: string } | undefined {
  // /subscriptions/../providers/Microsoft.Network/virtualNetworks/vnet1/subnets/snet1
  const m = /\/providers\/([^/]+)\/(.+)$/i.exec(id);
  if (!m) return undefined;
  const parts = m[2].split('/');
  const types = [m[1]];
  const names: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    types.push(parts[i]);
    if (parts[i + 1] !== undefined) names.push(parts[i + 1]);
  }
  return { type: types.join('/').replace(/^([^/]+)\//, '$1/'), name: names.join('/') };
}

function keyOf(type: string, name: string): string {
  return `${type.toLowerCase()}|${name.toLowerCase()}`;
}

function readTemplate(tpl: Record<string, unknown>): Res[] {
  const scope: Scope = {
    params: (tpl.parameters as Record<string, unknown>) ?? {},
    vars: {},
  };
  const rawVars = (tpl.variables as Record<string, unknown>) ?? {};
  scope.vars = rawVars;
  const out: Res[] = [];
  const walk = (list: unknown, parentType?: string, parentName?: string) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      let type = String(evalValue(o.type, scope) ?? '');
      let name = String(evalValue(o.name, scope) ?? '');
      // Nested child resources use short types and names ("subnets", "snet-app").
      if (parentType && !type.includes('/')) type = `${parentType}/${type}`;
      if (parentName && !name.includes('/')) name = `${parentName}/${name}`;
      if (!type) continue;
      const props = (evalValue(o.properties, scope) as Record<string, unknown>) ?? {};
      const sku = evalValue(o.sku, scope) as Record<string, unknown> | undefined;
      out.push({
        type: type.toLowerCase(),
        typeRaw: type,
        name,
        leaf: name.split('/').pop() ?? name,
        key: keyOf(type, name),
        location: str(evalValue(o.location, scope)),
        kind: str(evalValue(o.kind, scope)),
        sku: str(sku?.name) ?? str(sku?.tier),
        properties: props,
      });
      if (o.resources) walk(o.resources, type, name);
    }
  };
  walk(tpl.resources);
  return out;
}

function readList(list: unknown[]): Res[] {
  const out: Res[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const type = str(o.type);
    let name = str(o.name);
    if (!type || !name) continue;
    const id = str(o.id);
    if (id) {
      const p = parseIdString(id);
      if (p) name = p.name;
    }
    const sku = o.sku as Record<string, unknown> | undefined;
    out.push({
      type: type.toLowerCase(),
      typeRaw: type,
      name,
      leaf: name.split('/').pop() ?? name,
      key: keyOf(type, name),
      location: str(o.location),
      kind: str(o.kind),
      sku: str(sku?.name) ?? str(sku?.tier),
      properties: (o.properties as Record<string, unknown>) ?? {},
    });
  }
  return out;
}

/** Every string inside a value, with its JSON path. */
function strings(v: unknown, path = ''): { path: string; value: string }[] {
  if (typeof v === 'string') return [{ path, value: v }];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

/** Resolve a reference string (resource id or resourceId() result) to a resource key. */
function refKey(value: string): string | undefined {
  const p = parseIdString(value);
  return p ? keyOf(p.type, p.name) : undefined;
}

// ---- Classification -------------------------------------------------------------

/** Types never drawn as their own node, with the reason given in the report. */
const SKIP: [RegExp, string][] = [
  [/^microsoft\.network\/networkinterfaces$/, 'folded into the virtual machine that uses it'],
  [/^microsoft\.network\/networksecuritygroups(\/.*)?$/, 'shown as the shield on the subnet it protects'],
  [/^microsoft\.network\/routetables(\/.*)?$/, 'routing detail; mention forced tunnelling in a step'],
  [/^microsoft\.network\/publicipaddresses$/, 'implied by the gateway or firewall that owns it'],
  [/^microsoft\.network\/networkwatchers(\/.*)?$/, 'platform default'],
  [/^microsoft\.network\/privatednszones\/.+$/, 'records and links of the private DNS zones'],
  [/^microsoft\.network\/privateendpoints\/privatednszonegroups$/, 'DNS registration detail'],
  [/^microsoft\.network\/virtualnetworks\/virtualnetworkpeerings$/, 'drawn as a peering flow'],
  [/^microsoft\.compute\/disks$/, 'part of the virtual machine'],
  [/^microsoft\.compute\/virtualmachines\/extensions$/, 'VM extension'],
  [/^microsoft\.compute\/virtualmachinescalesets\/extensions$/, 'VM extension'],
  [/^microsoft\.web\/serverfarms$/, 'shown through the apps it hosts'],
  [/^microsoft\.web\/sites\/.+$/, 'app configuration'],
  [/^microsoft\.storage\/storageaccounts\/.+$/, 'storage sub-resource'],
  [/^microsoft\.keyvault\/vaults\/.+$/, 'Key Vault content'],
  [/^microsoft\.sql\/servers\/(?!databases$).+$/, 'SQL server setting'],
  [/^microsoft\.dbfor(postgresql|mysql)\/flexibleservers\/.+$/, 'database server setting'],
  [/^microsoft\.documentdb\/databaseaccounts\/.+$/, 'Cosmos DB sub-resource'],
  [/^microsoft\.servicebus\/namespaces\/.+$/, 'queues and topics of the namespace'],
  [/^microsoft\.eventhub\/namespaces\/.+$/, 'event hubs of the namespace'],
  [/^microsoft\.insights\/(diagnosticsettings|actiongroups|metricalerts|activitylogalerts|scheduledqueryrules|autoscalesettings|datacollectionrules|datacollectionruleassociations|workbooks)$/, 'monitoring configuration'],
  [/^microsoft\.alertsmanagement\//, 'monitoring configuration'],
  [/^microsoft\.operationsmanagement\//, 'monitoring solution'],
  [/^microsoft\.operationalinsights\/workspaces\/.+$/, 'workspace configuration'],
  [/^microsoft\.authorization\//, 'access control'],
  [/^microsoft\.resources\//, 'deployment artefact'],
  [/^microsoft\.managedidentity\/userassignedidentities(\/.*)?$/, 'identity detail; mention managed identities in a step'],
  [/^microsoft\.containerservice\/managedclusters\/.+$/, 'AKS node pools and settings'],
  [/^microsoft\.apimanagement\/service\/.+$/, 'API Management configuration'],
  [/^microsoft\.cdn\/profiles\/.+$/, 'Front Door endpoints, routes and origins'],
  [/^microsoft\.network\/frontdoorwebapplicationfirewallpolicies$/, 'WAF policy of Front Door'],
  [/^microsoft\.network\/applicationgatewaywebapplicationfirewallpolicies$/, 'WAF policy of Application Gateway'],
  [/^microsoft\.security\//, 'Defender for Cloud setting'],
  [/^microsoft\.cognitiveservices\/accounts\/.+$/, 'model deployments of the account'],
];

const REGION_NAMES: Record<string, string> = {
  eastus: 'East US', eastus2: 'East US 2', centralus: 'Central US', northcentralus: 'North Central US', southcentralus: 'South Central US',
  westcentralus: 'West Central US', westus: 'West US', westus2: 'West US 2', westus3: 'West US 3', canadacentral: 'Canada Central',
  canadaeast: 'Canada East', brazilsouth: 'Brazil South', northeurope: 'North Europe', westeurope: 'West Europe', uksouth: 'UK South',
  ukwest: 'UK West', francecentral: 'France Central', germanywestcentral: 'Germany West Central', switzerlandnorth: 'Switzerland North',
  norwayeast: 'Norway East', swedencentral: 'Sweden Central', polandcentral: 'Poland Central', italynorth: 'Italy North', spaincentral: 'Spain Central',
  eastasia: 'East Asia', southeastasia: 'Southeast Asia', japaneast: 'Japan East', japanwest: 'Japan West', koreacentral: 'Korea Central',
  australiaeast: 'Australia East', australiasoutheast: 'Australia Southeast', centralindia: 'Central India', southindia: 'South India',
  uaenorth: 'UAE North', southafricanorth: 'South Africa North', qatarcentral: 'Qatar Central', israelcentral: 'Israel Central', mexicocentral: 'Mexico Central',
};

function regionName(loc: string): string {
  const k = loc.toLowerCase().replace(/\s+/g, '');
  return REGION_NAMES[k] ?? loc;
}

const GLOBAL = new Set(['global', '']);

function kebab(s: string): string {
  const k = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return /^[a-z]/.test(k) ? k.slice(0, 44) : `r-${k}`.slice(0, 44);
}

function humanType(t: string): string {
  const last = t.split('/').pop() ?? t;
  const words = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/s$/, '');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---- Import ---------------------------------------------------------------------

export function importAzure(input: unknown, opts: ImportOptions = {}): ImportResult {
  let resources: Res[];
  let format: ImportReport['format'];
  if (Array.isArray(input)) {
    resources = readList(input);
    format = 'resource-list';
  } else if (input && typeof input === 'object' && Array.isArray((input as { resources?: unknown }).resources)) {
    resources = readTemplate(input as Record<string, unknown>);
    format = 'arm-template';
  } else if (input && typeof input === 'object' && Array.isArray((input as { data?: unknown }).data)) {
    resources = readList((input as { data: unknown[] }).data);
    format = 'resource-list';
  } else if (input && typeof input === 'object' && Array.isArray((input as { value?: unknown }).value)) {
    resources = readList((input as { value: unknown[] }).value);
    format = 'resource-list';
  } else {
    throw new Error('Not an ARM template (no "resources" array) or a resource list (a JSON array, or { "data": [...] } / { "value": [...] }).');
  }

  const byKey = new Map(resources.map((r) => [r.key, r]));
  const skipped = new Map<string, { type: string; count: number; reason: string }>();
  const unmapped = new Map<string, { type: string; count: number }>();
  const notes: string[] = [];

  // Subnets: from VNet properties and from child resources.
  interface SubnetInfo {
    key: string;
    vnet: string;
    name: string;
    prefix?: string;
    nsg: boolean;
  }
  const subnets = new Map<string, SubnetInfo>();
  for (const r of resources) {
    if (r.type === 'microsoft.network/virtualnetworks') {
      const list = (r.properties.subnets as { name?: unknown; properties?: Record<string, unknown> }[] | undefined) ?? [];
      for (const s of list) {
        const name = str(s.name);
        if (!name) continue;
        const key = keyOf('Microsoft.Network/virtualNetworks/subnets', `${r.name}/${name}`);
        subnets.set(key, { key, vnet: r.key, name, prefix: str(s.properties?.addressPrefix), nsg: !!s.properties?.networkSecurityGroup });
      }
    }
  }
  for (const r of resources) {
    if (r.type === 'microsoft.network/virtualnetworks/subnets') {
      const vnetName = r.name.split('/')[0];
      const vnet = keyOf('Microsoft.Network/virtualNetworks', vnetName);
      const prev = subnets.get(r.key);
      subnets.set(r.key, {
        key: r.key,
        vnet,
        name: r.leaf,
        prefix: str(r.properties.addressPrefix) ?? prev?.prefix,
        nsg: !!r.properties.networkSecurityGroup || !!prev?.nsg,
      });
    }
  }

  /** The subnet a resource sits in: a direct subnet reference, or via a NIC it uses. */
  const subnetOf = (r: Res, seen = new Set<string>()): string | undefined => {
    if (seen.has(r.key)) return undefined;
    seen.add(r.key);
    for (const s of strings(r.properties)) {
      if (!/\/subnets\//i.test(s.value)) continue;
      const k = refKey(s.value);
      if (k && subnets.has(k)) return k;
    }
    for (const s of strings(r.properties)) {
      if (!/networkinterfaces/i.test(s.value)) continue;
      const k = refKey(s.value);
      const nic = k ? byKey.get(k) : undefined;
      if (nic) return subnetOf(nic, seen);
    }
    return undefined;
  };

  // Nodes.
  interface Placed {
    res: Res;
    node: AzureNode;
    subnet?: string;
    region?: string;
  }
  const placed: Placed[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (base: string) => {
    let id = kebab(base) || 'resource';
    let n = 2;
    while (usedIds.has(id)) id = `${kebab(base).slice(0, 40)}-${n++}`;
    usedIds.add(id);
    return id;
  };
  const nodeByKey = new Map<string, Placed>();
  let dnsZones = 0;
  const dnsLinks = new Set<string>();
  for (const r of resources) {
    if (r.type === 'microsoft.network/virtualnetworks' || r.type === 'microsoft.network/virtualnetworks/subnets') continue;
    if (r.type === 'microsoft.network/privatednszones') {
      dnsZones++;
      continue;
    }
    if (r.type === 'microsoft.network/privatednszones/virtualnetworklinks') {
      const v = strings(r.properties).map((s) => refKey(s.value)).find((k) => k && byKey.has(k));
      if (v) dnsLinks.add(v);
    }
    const skip = SKIP.find(([re]) => re.test(r.type));
    if (skip || (r.type === 'microsoft.sql/servers/databases' && r.leaf.toLowerCase() === 'master')) {
      const reason = skip?.[1] ?? 'system database';
      const s = skipped.get(r.typeRaw) ?? { type: r.typeRaw, count: 0, reason };
      s.count++;
      skipped.set(r.typeRaw, s);
      continue;
    }
    let kind = r.kind;
    if (r.type === 'microsoft.cdn/profiles' && /azurefrontdoor/i.test(r.sku ?? '')) kind = 'frontdoor';
    const icon = iconForArmType(r.type, kind);
    const resolved = icon ? resolveService(icon) : undefined;
    const node: AzureNode = { id: uniqueId(r.leaf), description: r.leaf };
    if (resolved && resolved.kind === 'azure') node.service = icon;
    else {
      node.label = humanType(r.typeRaw);
      const u = unmapped.get(r.typeRaw) ?? { type: r.typeRaw, count: 0 };
      u.count++;
      unmapped.set(r.typeRaw, u);
    }
    const p: Placed = { res: r, node, subnet: subnetOf(r), region: r.location && !GLOBAL.has(r.location.toLowerCase()) ? regionName(r.location) : undefined };
    placed.push(p);
    nodeByKey.set(r.key, p);
  }

  // A SQL logical server is drawn through its databases: redirect references to the first one.
  const redirect = new Map<string, Placed>();
  for (const p of [...placed]) {
    if (p.res.type !== 'microsoft.sql/servers') continue;
    const dbs = placed.filter((q) => q.res.type === 'microsoft.sql/servers/databases' && q.res.name.toLowerCase().startsWith(`${p.res.leaf.toLowerCase()}/`));
    if (!dbs.length) continue;
    redirect.set(p.res.key, dbs[0]);
    placed.splice(placed.indexOf(p), 1);
    const s = skipped.get(p.res.typeRaw) ?? { type: p.res.typeRaw, count: 0, reason: 'shown through its databases' };
    s.count++;
    skipped.set(p.res.typeRaw, s);
  }
  for (const [k, db] of redirect) nodeByKey.set(k, db);

  // Flows ARM states outright.
  const flows: AzureFlow[] = [];
  const flowKeys = new Set<string>();
  const addFlow = (f: AzureFlow) => {
    const k = `${f.from}>${f.to}`;
    if (f.from === f.to || flowKeys.has(k)) return;
    flowKeys.add(k);
    flows.push(f);
  };
  for (const p of placed) {
    const r = p.res;
    if (r.type === 'microsoft.network/privateendpoints') {
      for (const s of strings(r.properties)) {
        if (!/privatelinkserviceid/i.test(s.path)) continue;
        const target = nodeByKey.get(refKey(s.value) ?? '');
        if (target) addFlow({ from: p.node.id, to: target.node.id });
      }
    }
    if (r.type === 'microsoft.network/applicationgateways' || r.type === 'microsoft.network/loadbalancers') {
      for (const s of strings(r.properties)) {
        if (/backendaddresses.*fqdn/i.test(s.path)) {
          const host = s.value.toLowerCase();
          const t = placed.find((q) => q !== p && host.startsWith(`${q.res.leaf.toLowerCase()}.`));
          if (t) addFlow({ from: p.node.id, to: t.node.id });
        }
        if (/backendipconfigurations|loadbalancerbackendaddresspools/i.test(s.path)) {
          const nic = byKey.get(refKey(s.value) ?? '');
          const vm = nic ? placed.find((q) => strings(q.res.properties).some((x) => refKey(x.value) === nic.key)) : undefined;
          if (vm) addFlow({ from: p.node.id, to: vm.node.id });
        }
      }
    }
    if (r.type === 'microsoft.network/connections') {
      const ends = ['virtualNetworkGateway1', 'virtualNetworkGateway2', 'localNetworkGateway2', 'peer']
        .map((k) => (r.properties[k] as { id?: string } | undefined)?.id)
        .map((id) => (id ? nodeByKey.get(refKey(id) ?? '') : undefined))
        .filter((x): x is Placed => !!x);
      if (ends.length >= 2) addFlow({ from: ends[0].node.id, to: ends[1].node.id, arrows: 'both', label: 'Connection' });
    }
  }

  // Collapse runs of one service in one place (e.g. six VMs in a subnet).
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    const k = `${p.subnet ?? ''}|${p.region ?? ''}|${p.node.service ?? p.node.label}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const hidden = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 4 || flows.some((f) => list.some((p) => p.node.id === f.from || p.node.id === f.to))) continue;
    const first = list[0];
    const label = first.node.label ?? (first.node.service ? resolveService(first.node.service)?.label : undefined) ?? 'Resources';
    first.node.label = `${label} (${list.length})`;
    first.node.description = `${list[0].res.leaf} … ${list[list.length - 1].res.leaf}`;
    for (const p of list.slice(1)) hidden.add(p.node.id);
    notes.push(`${list.length} × ${label} collapsed into one node "${first.node.id}".`);
  }
  const visible = placed.filter((p) => !hidden.has(p.node.id));

  // Build the tree: regions → virtual networks → subnets; services outside networks
  // sit beside the networks of their region; global services stand outside regions.
  const vnets = resources.filter((r) => r.type === 'microsoft.network/virtualnetworks');
  const regionOrder: string[] = [];
  const regionOf = (loc?: string) => (loc && !GLOBAL.has(loc.toLowerCase()) ? regionName(loc) : undefined);
  for (const r of [...vnets, ...visible.map((p) => p.res)]) {
    const g = regionOf(r.location);
    if (g && !regionOrder.includes(g)) regionOrder.push(g);
  }
  const vnetIds = new Map<string, string>();
  const vnetItem = (v: Res): AzureContainer => {
    const id = uniqueId(v.leaf);
    vnetIds.set(v.key, id);
    const prefix = ((v.properties.addressSpace as { addressPrefixes?: string[] } | undefined)?.addressPrefixes ?? [])[0];
    // Entry points first, private endpoints last (next to the services they reach), as in Microsoft's diagrams.
    const ENTRY = /applicationgateways|azurefirewalls|bastionhosts|virtualnetworkgateways|loadbalancers/;
    const rank = (s: SubnetInfo) => {
      const types = visible.filter((p) => p.subnet === s.key).map((p) => p.res.type);
      if (types.some((t) => ENTRY.test(t))) return 0;
      if (types.length && types.every((t) => t === 'microsoft.network/privateendpoints')) return 2;
      return 1;
    };
    const snets = [...subnets.values()].filter((s) => s.vnet === v.key).sort((a, b) => rank(a) - rank(b));
    const kids: AzureItem[] = [];
    for (const s of snets) {
      const members = visible.filter((p) => p.subnet === s.key).map((p) => p.node);
      if (!members.length) continue;
      kids.push({
        id: uniqueId(`${v.leaf}-${s.name}`),
        boundary: 'subnet',
        label: s.name,
        description: s.prefix,
        nsg: s.nsg || undefined,
        layout: 'column',
        children: members,
      });
    }
    const empty = snets.length - kids.length;
    if (empty > 0) notes.push(`${v.leaf}: ${empty} subnet(s) with nothing drawn in them were left out.`);
    if (!kids.length) kids.push({ id: uniqueId(`${v.leaf}-empty`), label: 'No resources placed in subnets' });
    return {
      id,
      boundary: 'virtual-network',
      label: v.leaf,
      description: prefix,
      layout: kids.length > 4 ? 'grid' : 'row',
      columns: kids.length > 4 ? 3 : undefined,
      children: kids,
    };
  };
  const outside = (p: Placed) => !p.subnet;
  const rootKids: AzureItem[] = [];
  const globals = visible.filter((p) => outside(p) && !p.region).map((p) => p.node);
  if (globals.length) rootKids.push(globals.length === 1 ? globals[0] : { id: uniqueId('global-services'), layout: 'column', children: globals });
  const regionItems: AzureItem[] = [];
  for (const g of regionOrder) {
    const nets = vnets.filter((v) => regionOf(v.location) === g).map(vnetItem);
    const loose = visible.filter((p) => outside(p) && p.region === g).map((p) => p.node);
    const kids: AzureItem[] = [];
    if (nets.length) kids.push(nets.length === 1 ? nets[0] : { id: uniqueId(`${g}-networks`), layout: 'column', children: nets });
    // Services reached through private endpoints get their own column, so they line up with their endpoints.
    const peTargets = new Set(flows.filter((f) => visible.some((p) => p.node.id === f.from && p.res.type === 'microsoft.network/privateendpoints')).map((f) => f.to));
    const reached = loose.filter((n) => peTargets.has(n.id));
    const rest = loose.filter((n) => !peTargets.has(n.id));
    if (reached.length) kids.push({ id: uniqueId(`${g}-private-services`), layout: 'column', children: reached });
    if (rest.length) {
      const cols = Math.ceil(rest.length / 5);
      kids.push(cols > 1 ? { id: uniqueId(`${g}-services`), layout: 'grid', columns: cols, children: rest } : { id: uniqueId(`${g}-services`), layout: 'column', children: rest });
    }
    if (!kids.length) continue;
    regionItems.push({ id: uniqueId(`region-${g}`), boundary: 'region', label: g, layout: 'row', children: kids });
  }
  if (regionItems.length) rootKids.push(regionItems.length === 1 ? regionItems[0] : { id: uniqueId('regions'), layout: 'column', children: regionItems });
  let dnsId: string | undefined;
  if (dnsZones) {
    const dns: AzureNode = { id: uniqueId('private-dns-zones'), service: 'dns-zones', label: 'Private DNS zones', description: `${dnsZones} zone${dnsZones > 1 ? 's' : ''}` };
    rootKids.push(dns);
    dnsId = dns.id;
    for (const k of dnsLinks) {
      const v = vnetIds.get(k);
      if (v) addFlow({ from: dns.id, to: v, style: 'dotted', arrows: 'none', label: 'Linked' });
    }
  }
  // VNet peerings.
  for (const r of resources) {
    if (r.type !== 'microsoft.network/virtualnetworks/virtualnetworkpeerings' && r.type !== 'microsoft.network/virtualnetworks') continue;
    const peerings =
      r.type === 'microsoft.network/virtualnetworks'
        ? ((r.properties.virtualNetworkPeerings as { properties?: Record<string, unknown> }[] | undefined) ?? []).map((x) => ({ from: r.key, props: x.properties ?? {} }))
        : [{ from: keyOf('Microsoft.Network/virtualNetworks', r.name.split('/')[0]), props: r.properties }];
    for (const pr of peerings) {
      const remote = (pr.props.remoteVirtualNetwork as { id?: string } | undefined)?.id;
      const a = vnetIds.get(pr.from);
      const b = remote ? vnetIds.get(refKey(remote) ?? '') : undefined;
      if (a && b && !flowKeys.has(`${b}>${a}`)) addFlow({ from: a, to: b, arrows: 'both', style: 'dashed', label: 'Peering' });
    }
  }

  const drawn = new Set([...visible.map((p) => p.node.id), ...vnetIds.values(), ...(dnsId ? [dnsId] : [])]);
  const keptFlows = flows.filter((f) => drawn.has(f.from) && drawn.has(f.to));
  const nodeCount = visible.length + (dnsZones ? 1 : 0);
  const altitude = nodeCount <= 9 ? 'executive' : nodeCount <= 20 ? 'management' : 'detailed';
  if (nodeCount > 60) notes.push(`${nodeCount} nodes exceed the detailed limit of 60: split the estate into several diagrams (one per landing zone or workload).`);
  if (!rootKids.length) throw new Error('No drawable Azure resources were found in the input.');

  const body: AzureArchitectureBody = { layout: 'row', children: rootKids, flows: keptFlows.length ? keptFlows : undefined };
  const boundaries = JSON.stringify(body).match(/"boundary":/g)?.length ?? 0;
  notes.push('Flows come only from what ARM states (private endpoints, gateway backends, connections, peerings, DNS links). Add the data flows, numbered steps and an action title that states the finding.');
  const spec = {
    version: '1.0',
    type: 'azure-architecture',
    altitude,
    title: opts.title ?? `Draft architecture imported from ${opts.source ?? 'Azure'}`.slice(0, 90),
    subtitle: `Imported from ${format === 'arm-template' ? 'an ARM template' : 'a resource list'}: ${resources.length} resources, ${nodeCount} drawn`.slice(0, 140),
    canvas: { aspect: nodeCount > 24 ? 'auto' : '16:9' },
    body,
  };
  return {
    spec,
    report: {
      format,
      resources: resources.length,
      nodes: nodeCount,
      boundaries,
      flows: keptFlows.length,
      regions: regionOrder,
      skipped: [...skipped.values()].sort((a, b) => b.count - a.count),
      unmapped: [...unmapped.values()].sort((a, b) => b.count - a.count),
      notes,
    },
  };
}
