import fs from 'node:fs';
import path from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import { dirs } from '../util.js';

type AjvInstance = {
  addSchema(schema: AnySchema): AjvInstance;
  getSchema(ref: string): ValidateFunction | undefined;
  compile(schema: AnySchema): ValidateFunction;
};

// Ajv ships CommonJS; normalise the default export across loaders.
const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as new (
  opts: Record<string, unknown>,
) => AjvInstance;

export const SCHEMA_BASE = 'https://schemas.diagram-studio.local/';

let ajv: AjvInstance | undefined;

function readSchema(file: string): AnySchema {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as AnySchema;
}

export function getAjv(): AjvInstance {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: false, verbose: true });
  const typesDir = path.join(dirs.schema, 'types');
  for (const f of fs.readdirSync(typesDir).filter((f) => f.endsWith('.schema.json')).sort()) {
    ajv.addSchema(readSchema(path.join(typesDir, f)));
  }
  ajv.addSchema(readSchema(path.join(dirs.schema, 'diagram.schema.json')));
  ajv.addSchema(readSchema(path.join(dirs.schema, 'theme.schema.json')));
  ajv.addSchema(readSchema(path.join(dirs.schema, 'deck.schema.json')));
  return ajv;
}

export function validator(id: 'diagram' | 'theme' | 'deck'): ValidateFunction {
  const fn = getAjv().getSchema(`${SCHEMA_BASE}${id}.schema.json`);
  if (!fn) throw new Error(`Schema ${id} not found`);
  return fn;
}

/** Resolve a `$ref` (relative to a base id) to its schema object. */
export function resolveRef(ref: string, baseId: string): Record<string, unknown> | undefined {
  const url = new URL(ref, baseId).toString();
  const fn = getAjv().getSchema(url);
  return fn?.schema as Record<string, unknown> | undefined;
}

export type { ErrorObject };
