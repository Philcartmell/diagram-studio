/**
 * Spec validation: JSON Schema (Ajv), cross-reference checks and altitude
 * limits. Every problem is a plain sentence with a JSON path.
 */
import { iconNames, iconPaths } from '../render/icons.js';
import { homePackOf } from '../azure/icons.js';
import { azureLabel, azureNodes, checkAzure } from './azure.js';
import type {
  Altitude,
  AzureArchitectureBody,
  LayeredArchitectureBody,
  MatrixBody,
  OperatingModelBody,
  RoadmapBody,
  Spec,
  SpecNode,
  SwimlaneBody,
  ValueChainBody,
} from '../spec.js';
import { findTheme, listThemes, loadDefaults, loadTheme } from '../theme/load.js';
import { closest, isPlainObject } from '../util.js';
import { validator } from './ajv.js';
import { ALTITUDES, NEXT_ALTITUDE } from './altitude.js';
import { type Issue, formatPath, rewriteErrors } from './messages.js';
import { validateThemeObject } from './theme.js';

export type { Issue };

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  /** The spec with defaults applied (present when ok). */
  spec?: Spec;
}

export interface CountedNode {
  path: string;
  node: Pick<SpecNode, 'id' | 'label' | 'description' | 'emphasis' | 'status' | 'tags' | 'icon'>;
}

/** The nodes that count against the altitude limit, per type. */
export function countedNodes(spec: Spec): CountedNode[] {
  const out: CountedNode[] = [];
  const b = spec.body;
  const push = (path: string, node: CountedNode['node']) => out.push({ path, node });
  switch (spec.type) {
    case 'operating-model':
    case 'layered-architecture': {
      const body = b as unknown as OperatingModelBody & LayeredArchitectureBody;
      body.layers.forEach((l, i) => l.nodes.forEach((n, j) => push(`body.layers[${i}].nodes[${j}]`, n)));
      // Side elements (governance, customers, cross-cutting bars, external parties) frame the
      // layers and do not count against the altitude limit.
      break;
    }
    case 'swimlane':
      (b as unknown as SwimlaneBody).steps.forEach((s, i) => push(`body.steps[${i}]`, s));
      break;
    case 'roadmap':
      (b as unknown as RoadmapBody).items.forEach((s, i) => push(`body.items[${i}]`, s));
      break;
    case 'value-chain': {
      const body = b as unknown as ValueChainBody;
      body.primary.forEach((s, i) => push(`body.primary[${i}]`, s));
      body.support?.forEach((s, i) => push(`body.support[${i}]`, s));
      break;
    }
    case 'matrix-2x2':
      (b as unknown as MatrixBody).items.forEach((s, i) => push(`body.items[${i}]`, s));
      break;
    case 'azure-architecture':
    case 'databricks-architecture':
      // Services and boxes count; boundaries frame them and do not.
      for (const { node, path } of azureNodes(b as unknown as AzureArchitectureBody))
        push(path, { ...node, label: azureLabel(node, homePackOf(spec.type)) ?? node.id });
      break;
  }
  return out;
}

/** Every element that can carry emphasis, for accent counting and legends. */
export function emphasisCarriers(spec: Spec): { path: string; id?: string; emphasis?: string; status?: string; tags?: string[] }[] {
  const out: { path: string; id?: string; emphasis?: string; status?: string; tags?: string[] }[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (isPlainObject(v)) {
      if ('emphasis' in v || 'status' in v || 'tags' in v)
        out.push({
          path,
          id: typeof v.id === 'string' ? v.id : undefined,
          emphasis: v.emphasis as string | undefined,
          status: v.status as string | undefined,
          tags: v.tags as string[] | undefined,
        });
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(spec.body, 'body');
  return out;
}

function collectIds(v: unknown, path: string, out: { id: string; path: string }[]) {
  if (Array.isArray(v)) v.forEach((x, i) => collectIds(x, `${path}[${i}]`, out));
  else if (isPlainObject(v)) {
    if (typeof v.id === 'string') out.push({ id: v.id, path: `${path}.id` });
    for (const [k, x] of Object.entries(v)) if (k !== 'id') collectIds(x, `${path}.${k}`, out);
  }
}

function crossReferences(spec: Spec, errors: Issue[], warnings: Issue[]) {
  const err = (path: string, message: string, code: string) => errors.push({ path, message: `${path}: ${message}`, code });
  const warn = (path: string, message: string, code: string) => warnings.push({ path, message: `${path}: ${message}`, code });

  const ids: { id: string; path: string }[] = [];
  collectIds(spec.body, 'body', ids);
  const firstSeen = new Map<string, string>();
  for (const { id, path } of ids) {
    const prev = firstSeen.get(id);
    if (prev) err(path, `id "${id}" is already used at ${prev}. Ids must be unique across the diagram.`, 'ref.duplicate-id');
    else firstSeen.set(id, path);
  }
  const allIds = [...firstSeen.keys()];

  if (spec.callout?.anchor && !firstSeen.has(spec.callout.anchor)) {
    const g = closest(spec.callout.anchor, allIds);
    err('callout.anchor', `"${spec.callout.anchor}" does not match any id in the diagram.${g ? ` Did you mean "${g}"?` : ''}`, 'ref.anchor');
  }

  // Icons
  const icons = new Set(iconNames());
  const walkIcons = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walkIcons(x, `${path}[${i}]`));
    else if (isPlainObject(v)) {
      if (typeof v.icon === 'string' && !iconPaths(v.icon)) {
        const g = closest(v.icon, [...icons]);
        err(`${path}.icon`, `"${v.icon}" is not in the icon set.${g ? ` Did you mean "${g}"?` : ''} Run \`diagram-studio icons\` to list icons.`, 'ref.icon');
      }
      for (const [k, x] of Object.entries(v)) walkIcons(x, `${path}.${k}`);
    }
  };
  walkIcons(spec.body, 'body');

  switch (spec.type) {
    case 'swimlane': {
      const b = spec.body as unknown as SwimlaneBody;
      const lanes = b.lanes.map((l) => l.id);
      const steps = new Set(b.steps.map((s) => s.id));
      b.steps.forEach((s, i) => {
        if (!lanes.includes(s.lane)) {
          const g = closest(s.lane, lanes);
          err(`body.steps[${i}].lane`, `"${s.lane}" is not a lane.${g ? ` Did you mean "${g}"?` : ''} Lanes are: ${lanes.join(', ')}.`, 'ref.lane');
        }
        if (b.phases?.length) {
          if (!s.phase) err(`body.steps[${i}].phase`, `is missing. When "phases" is set every step needs one of: ${b.phases.join(', ')}.`, 'ref.phase');
          else if (!b.phases.includes(s.phase)) {
            const g = closest(s.phase, b.phases);
            err(`body.steps[${i}].phase`, `"${s.phase}" is not a phase.${g ? ` Did you mean "${g}"?` : ''} Phases are: ${b.phases.join(', ')}.`, 'ref.phase');
          }
        } else if (s.phase) {
          err(`body.steps[${i}].phase`, `"${s.phase}" is set but the swimlane has no "phases" list. Add "phases" or remove the field.`, 'ref.phase');
        }
      });
      const seenEdges = new Set<string>();
      b.edges.forEach((e, i) => {
        for (const end of ['from', 'to'] as const) {
          if (!steps.has(e[end])) {
            const g = closest(e[end], [...steps]);
            err(`body.edges[${i}].${end}`, `"${e[end]}" is not a step.${g ? ` Did you mean "${g}"?` : ''} Edges connect step ids.`, 'ref.edge');
          }
        }
        if (e.from === e.to) err(`body.edges[${i}]`, `connects "${e.from}" to itself. Remove it or describe the loop in a label.`, 'ref.self-loop');
        const key = `${e.from}>${e.to}`;
        if (seenEdges.has(key)) warn(`body.edges[${i}]`, `duplicates an earlier edge from "${e.from}" to "${e.to}".`, 'ref.duplicate-edge');
        seenEdges.add(key);
      });
      const usedLanes = new Set(b.steps.map((s) => s.lane));
      b.lanes.forEach((l, i) => {
        if (!usedLanes.has(l.id)) warn(`body.lanes[${i}]`, `lane "${l.id}" has no steps. Remove it or add its steps.`, 'ref.empty-lane');
      });
      break;
    }
    case 'roadmap': {
      const b = spec.body as unknown as RoadmapBody;
      const hz = b.horizons.map((h) => h.id);
      const ws = b.workstreams.map((w) => w.id);
      const checkRef = (path: string, v: string | undefined, list: string[], what: string) => {
        if (v === undefined || list.includes(v)) return;
        const g = closest(v, list);
        err(path, `"${v}" is not a ${what}.${g ? ` Did you mean "${g}"?` : ''} ${what[0].toUpperCase() + what.slice(1)}s are: ${list.join(', ')}.`, `ref.${what}`);
      };
      b.items.forEach((it, i) => {
        checkRef(`body.items[${i}].workstream`, it.workstream, ws, 'workstream');
        checkRef(`body.items[${i}].start`, it.start, hz, 'horizon');
        checkRef(`body.items[${i}].end`, it.end, hz, 'horizon');
        if (it.end && hz.indexOf(it.end) >= 0 && hz.indexOf(it.end) < hz.indexOf(it.start))
          err(`body.items[${i}].end`, `"${it.end}" comes before start "${it.start}". Swap them.`, 'ref.order');
      });
      b.milestones?.forEach((m, i) => {
        checkRef(`body.milestones[${i}].horizon`, m.horizon, hz, 'horizon');
        checkRef(`body.milestones[${i}].workstream`, m.workstream, ws, 'workstream');
      });
      if (b.scale === 'time') {
        b.horizons.forEach((h, i) => {
          if (!h.start || !h.end) err(`body.horizons[${i}]`, `needs "start" and "end" dates when "scale" is "time".`, 'ref.time-scale');
          else if (h.end <= h.start) err(`body.horizons[${i}].end`, `"${h.end}" must be after start "${h.start}".`, 'ref.time-scale');
        });
      }
      break;
    }
    case 'matrix-2x2': {
      const b = spec.body as unknown as MatrixBody;
      const pos = b.quadrants.map((q) => q.position);
      const missing = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].filter((p) => !pos.includes(p as never));
      if (missing.length) err('body.quadrants', `each position must appear once; missing: ${missing.join(', ')}.`, 'ref.quadrants');
      b.items.forEach((it, i) => {
        const hasXY = it.x !== undefined && it.y !== undefined;
        if (!hasXY && !it.quadrant)
          err(`body.items[${i}]`, `needs either "x" and "y" (0 to 1) or a "quadrant".`, 'ref.position');
        if ((it.x === undefined) !== (it.y === undefined))
          err(`body.items[${i}]`, `has only one of "x" and "y"; give both, or use "quadrant".`, 'ref.position');
        for (const axis of ['x', 'y'] as const) {
          if (it[axis] === 0.5)
            warn(`body.items[${i}].${axis}`, `0.5 is exactly on the midline, so the item's quadrant is ambiguous (it is drawn on the high side). Choose a side, e.g. 0.45 or 0.55.`, 'ref.midline');
        }
        if (hasXY && it.quadrant) {
          const q = `${it.y! >= 0.5 ? 'top' : 'bottom'}-${it.x! >= 0.5 ? 'right' : 'left'}`;
          if (q !== it.quadrant) warn(`body.items[${i}]`, `x/y place it in ${q} but "quadrant" says ${it.quadrant}; x/y wins.`, 'ref.position');
        }
      });
      break;
    }
    case 'azure-architecture':
    case 'databricks-architecture':
      checkAzure(spec.body as unknown as AzureArchitectureBody, err, warn, homePackOf(spec.type));
      break;
    default:
      break;
  }
}

function altitudeChecks(spec: Spec, altitude: Altitude, errors: Issue[], warnings: Issue[]) {
  const rules = ALTITUDES[altitude];
  const higher = NEXT_ALTITUDE[altitude];
  const nodes = countedNodes(spec);
  if (nodes.length > rules.maxNodes) {
    errors.push({
      path: 'body',
      code: 'altitude.nodes',
      message:
        `body: this ${altitude} diagram has ${nodes.length} nodes; the limit is ${rules.maxNodes}. ` +
        `Summarise: group related nodes, or move detail into descriptions or notes` +
        (higher ? `, or set "altitude": "${higher}".` : '.'),
    });
  }
  for (const { path, node } of nodes) {
    const len = [...node.label].length;
    if (len > rules.labelMax) {
      errors.push({
        path: `${path}.label`,
        id: node.id,
        code: 'altitude.label',
        message:
          `${path}.label: "${node.label}" is ${len} characters; ${altitude} diagrams allow ${rules.labelMax}. ` +
          `Use a shorter label (move detail to "description")` +
          (higher ? ` or set "altitude": "${higher}".` : '.'),
      });
    }
    if (node.description) {
      const dl = [...node.description].length;
      if (dl > rules.descriptionMax) {
        errors.push({
          path: `${path}.description`,
          id: node.id,
          code: 'altitude.description',
          message:
            `${path}.description: is ${dl} characters; ${altitude} diagrams allow ${rules.descriptionMax} (about ${rules.descriptionLines} line${rules.descriptionLines > 1 ? 's' : ''}). ` +
            `Cut it to the essential point` +
            (higher ? ` or set "altitude": "${higher}".` : '.'),
        });
      }
    }
  }
  const accented = emphasisCarriers(spec).filter((c) => c.emphasis === 'accent');
  if (accented.length > rules.accentMax) {
    warnings.push({
      path: 'body',
      code: 'altitude.accent',
      message: `body: ${accented.length} elements use "accent" (${accented.map((a) => a.id ?? a.path).join(', ')}); ${altitude} diagrams should accent at most ${rules.accentMax} so the eye knows where to go. Use "highlight" for secondary emphasis.`,
    });
  }
  if (altitude === 'detailed') {
    const carriers = emphasisCarriers(spec);
    const meaningful = carriers.some(
      (c) => (c.tags && c.tags.length) || (c.status && c.status !== 'current') || c.emphasis === 'highlight' || c.emphasis === 'muted',
    );
    if (meaningful && spec.legend === 'none') {
      errors.push({
        path: 'legend',
        code: 'altitude.legend',
        message: 'legend: detailed diagrams need a legend when colour carries meaning (tags, status, highlight or muted). Set "legend": "auto" or list entries.',
      });
    }
  }
}

const TOPIC_WORDS = /\b(overview|diagram|map|landscape|framework|structure|summary|architecture|roadmap|model|process|plan|view)$/i;

function titleChecks(spec: Spec, warnings: Issue[]) {
  const words = spec.title.trim().split(/\s+/);
  if (words.length < 4 || (words.length <= 5 && TOPIC_WORDS.test(spec.title.trim()))) {
    warnings.push({
      path: 'title',
      code: 'title.topic',
      message: `title: "${spec.title}" reads like a topic. State the finding instead, e.g. "Three platforms carry 80% of customer journeys".`,
    });
  }
}

const VENDOR_THEME: Partial<Record<Spec['type'], string>> = { 'azure-architecture': 'azure', 'databricks-architecture': 'databricks' };

/** Apply defaults from the spec, the user's defaults file and the PRD. */
export function withDefaults(spec: Spec, themeOverride?: string): Spec {
  const d = loadDefaults();
  return {
    ...spec,
    altitude: spec.altitude ?? d.altitude ?? 'executive',
    // Architecture diagrams default to their vendor's look rather than the saved default.
    theme: themeOverride ?? spec.theme ?? VENDOR_THEME[spec.type] ?? d.theme ?? 'boardroom',
    legend: spec.legend ?? 'auto',
    canvas: { aspect: spec.canvas?.aspect ?? '16:9' },
  };
}

export function validateSpec(input: unknown, opts: { theme?: string } = {}): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: 'spec', code: 'schema.type', message: 'spec: must be a JSON object { … }.' }], warnings };
  }
  const validate = validator('diagram');
  if (!validate(input)) {
    errors.push(...rewriteErrors(validate.errors ?? []));
    return { ok: false, errors, warnings };
  }
  const spec = withDefaults(input as unknown as Spec, opts.theme);
  crossReferences(spec, errors, warnings);
  altitudeChecks(spec, spec.altitude!, errors, warnings);
  titleChecks(spec, warnings);

  // Theme and overrides
  if (!findTheme(spec.theme!)) {
    const known = listThemes().map((t) => t.id);
    const g = closest(spec.theme!, known);
    errors.push({
      path: 'theme',
      code: 'ref.theme',
      message: `theme: "${spec.theme}" is not installed.${g ? ` Did you mean "${g}"?` : ''} Themes are: ${known.join(', ')}.`,
    });
  } else if (spec.themeOverrides && Object.keys(spec.themeOverrides).length) {
    const merged = loadTheme(spec.theme!, spec.themeOverrides);
    const r = validateThemeObject(merged);
    for (const e of r.errors) errors.push({ ...e, path: `themeOverrides.${e.path}`, message: `themeOverrides.${e.message}` });
  }
  return { ok: errors.length === 0, errors, warnings, spec: errors.length ? undefined : spec };
}

export { formatPath };
