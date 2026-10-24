/** Rewrites Ajv errors into plain sentences with a JSON path Claude can act on. */
import { closest } from '../util.js';
import { SCHEMA_BASE, resolveRef, type ErrorObject } from './ajv.js';

export interface Issue {
  /** Dotted JSON path, e.g. body.steps[3].lane */
  path: string;
  /** Full sentence including the path. */
  message: string;
  code: string;
  /** Element id the issue concerns, when known. */
  id?: string;
  hint?: string;
}

export function formatPath(pointer: string): string {
  if (!pointer) return 'spec';
  return pointer
    .split('/')
    .slice(1)
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((acc, seg) => (/^\d+$/.test(seg) ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg), '');
}

function kebab(s: string): string {
  const k = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(k) ? k : `x-${k}`;
}

function describeType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'object') return 'an object';
  if (typeof v === 'string') return `the text ${JSON.stringify(v.length > 30 ? v.slice(0, 30) + '…' : v)}`;
  return `${typeof v} ${JSON.stringify(v)}`;
}

const TYPE_NAMES: Record<string, string> = {
  string: 'text in quotes',
  number: 'a number',
  integer: 'a whole number',
  object: 'an object { … }',
  array: 'a list [ … ]',
  boolean: 'true or false',
  null: 'null',
};

/** Property names a schema allows, following $ref (for "did you mean" help). */
function allowedProps(schema: unknown, depth = 0): string[] {
  if (!schema || typeof schema !== 'object' || depth > 4) return [];
  const s = schema as Record<string, unknown>;
  const props = s.properties && typeof s.properties === 'object' ? Object.keys(s.properties as object) : [];
  if (typeof s.$ref === 'string') {
    const ref = s.$ref;
    const bases = ref.startsWith('#')
      ? [`${SCHEMA_BASE}diagram.schema.json`]
      : [`${SCHEMA_BASE}types/x.schema.json`, `${SCHEMA_BASE}diagram.schema.json`];
    for (const base of bases) {
      try {
        const target = resolveRef(ref, base);
        if (target) {
          props.push(...allowedProps(target, depth + 1));
          break;
        }
      } catch {
        // try next base
      }
    }
  }
  return [...new Set(props)];
}

function patternMessage(path: string, value: unknown, pattern: string): string {
  const v = String(value);
  if (pattern.startsWith('^[a-z]') || pattern.startsWith('^[a-z0-9]')) {
    if (pattern.includes('(-[a-z0-9]+)*$') && !pattern.startsWith('^[a-z0-9]+')) {
      return `${path}: ${JSON.stringify(v)} must be kebab-case (lowercase letters, digits and single hyphens, starting with a letter), e.g. ${JSON.stringify(kebab(v))}.`;
    }
    return `${path}: ${JSON.stringify(v)} must use lowercase letters, digits and hyphens only, e.g. ${JSON.stringify(kebab(v))}.`;
  }
  if (pattern.includes('[0-9a-fA-F]')) return `${path}: ${JSON.stringify(v)} must be a 6-digit hex colour like "#0B3D91".`;
  if (pattern.includes('\\d{4}')) return `${path}: ${JSON.stringify(v)} must be a date like "2027-03" or "2027-03-31".`;
  return `${path}: ${JSON.stringify(v)} does not match the expected format.`;
}

function one(e: ErrorObject): Issue {
  const path = formatPath(e.instancePath);
  const p = e.params as Record<string, unknown>;
  const data = (e as ErrorObject & { data?: unknown }).data;
  const mk = (message: string, hint?: string): Issue => ({ path, message, code: `schema.${e.keyword}`, hint });
  switch (e.keyword) {
    case 'required': {
      const missing = String(p.missingProperty);
      const where = path === 'spec' ? 'The spec' : path;
      return { ...mk(`${where}: missing required field "${missing}".`), path: path === 'spec' ? missing : `${path}.${missing}` };
    }
    case 'additionalProperties':
    case 'unevaluatedProperties': {
      const prop = String(p.additionalProperty ?? p.unevaluatedProperty);
      const allowed = allowedProps((e as ErrorObject & { parentSchema?: unknown }).parentSchema);
      const guess = closest(prop, allowed);
      const where = path === 'spec' ? 'The spec' : path;
      return {
        ...mk(
          `${where}: unknown field "${prop}".${guess ? ` Did you mean "${guess}"?` : ''}${allowed.length ? ` Allowed fields: ${allowed.join(', ')}.` : ''}`,
        ),
        path: path === 'spec' ? prop : `${path}.${prop}`,
      };
    }
    case 'enum': {
      const allowed = (p.allowedValues as unknown[]).map(String);
      const guess = typeof data === 'string' ? closest(data, allowed) : undefined;
      return mk(
        `${path}: ${JSON.stringify(data)} is not allowed.${guess ? ` Did you mean "${guess}"?` : ''} Use one of: ${allowed.join(', ')}.`,
      );
    }
    case 'const':
      return mk(`${path}: must be ${JSON.stringify(p.allowedValue)} (got ${JSON.stringify(data)}).`);
    case 'type': {
      const t = String(p.type)
        .split(',')
        .map((x) => TYPE_NAMES[x] ?? x)
        .join(' or ');
      return mk(`${path}: must be ${t}, not ${describeType(data)}.`);
    }
    case 'minLength':
      return mk(`${path}: must not be empty.`);
    case 'maxLength': {
      const len = typeof data === 'string' ? [...data].length : 0;
      return mk(`${path}: is ${len} characters; the maximum is ${p.limit}. Shorten it.`);
    }
    case 'minItems':
      return mk(`${path}: needs at least ${p.limit} item${p.limit === 1 ? '' : 's'} (has ${Array.isArray(data) ? data.length : 0}).`);
    case 'maxItems':
      return mk(
        `${path}: has ${Array.isArray(data) ? data.length : '?'} items; the maximum is ${p.limit}. Group or summarise related items.`,
      );
    case 'pattern':
      return mk(patternMessage(path, data, String(p.pattern)));
    case 'minimum':
    case 'maximum':
    case 'exclusiveMinimum':
    case 'exclusiveMaximum':
      return mk(`${path}: ${JSON.stringify(data)} is out of range (${p.comparison} ${p.limit}).`);
    case 'uniqueItems':
      return mk(`${path}: items ${p.j} and ${p.i} are duplicates; each entry must be unique.`);
    case 'multipleOf':
      return mk(`${path}: must be a multiple of ${p.multipleOf}.`);
    case 'minProperties':
      return mk(`${path}: needs at least ${p.limit} entr${p.limit === 1 ? 'y' : 'ies'}.`);
    case 'discriminator':
      return mk(`${path}: "type" must name a diagram type.`);
    case 'anyOf':
    case 'oneOf':
      if (path === 'legend') return mk(`legend: must be "auto", "none" or a list of entries like { "label": "New capability", "status": "new" }.`);
      return mk(`${path}: does not match any allowed form.`);
    default:
      return mk(`${path}: ${e.message ?? 'is invalid'}.`);
  }
}

/** Convert raw Ajv errors into de-duplicated plain-sentence issues. */
export function rewriteErrors(errors: ErrorObject[]): Issue[] {
  const typeEnumFailed = errors.some((e) => e.instancePath === '/type' && e.keyword === 'enum');
  // For anyOf/oneOf failures keep the more specific nested errors when present.
  const unionPaths = errors.filter((e) => e.keyword === 'anyOf' || e.keyword === 'oneOf').map((e) => e.instancePath);
  const filtered = errors.filter((e) => {
    if (e.keyword === 'discriminator' && typeEnumFailed) return false;
    if (e.keyword === 'if') return false;
    for (const up of unionPaths) {
      const deeper = errors.some((x) => x.instancePath.startsWith(up + '/') && x.instancePath !== up);
      if (e.instancePath === up && (e.keyword === 'anyOf' || e.keyword === 'oneOf') && deeper) return false;
      if (e.instancePath === up && e.keyword !== 'anyOf' && e.keyword !== 'oneOf') return false;
    }
    return true;
  });
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const e of filtered) {
    const issue = one(e);
    if (seen.has(issue.message)) continue;
    seen.add(issue.message);
    out.push(issue);
  }
  return out;
}
