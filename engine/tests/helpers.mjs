// Shared helpers for the test suite. Tests import the compiled dist/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TESTS = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TESTS, '..');
export const DIST = path.join(ROOT, 'scripts', 'dist');
export const CLI = path.join(DIST, 'cli.js');
export const THEMES = ['boardroom', 'blueprint', 'sketch', 'bold', 'minimal', 'print', 'azure', 'databricks'];

export const load = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

/** Dependencies live in node_modules beside package.json; resolve them from there. */
const requireDep = createRequire(path.join(ROOT, 'package.json'));
export const dep = async (name) => {
  const m = await import(pathToFileURL(requireDep.resolve(name)).href);
  return m.default ?? m;
};

export function examples() {
  const dir = path.join(ROOT, 'examples');
  const out = [];
  for (const type of fs.readdirSync(dir).sort()) {
    for (const f of fs.readdirSync(path.join(dir, type)).filter((x) => x.endsWith('.json')).sort()) {
      out.push({ type, name: f.replace(/\.json$/, ''), file: path.join(dir, type, f), spec: JSON.parse(fs.readFileSync(path.join(dir, type, f), 'utf8')) });
    }
  }
  return out;
}

export function stressSpecs() {
  const dir = path.join(TESTS, 'stress');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), file: path.join(dir, f), spec: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

export function tmpDir(name) {
  const d = path.join(TESTS, '.tmp', name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Remove this file's temp folders (prefix-scoped so parallel test files do not collide). */
export function cleanTmp(prefix) {
  const root = path.join(TESTS, '.tmp');
  if (!fs.existsSync(root)) return;
  for (const d of fs.readdirSync(root)) if (d.startsWith(prefix)) fs.rmSync(path.join(root, d), { recursive: true, force: true });
}

/** Scene shapes keyed by spec id, for geometry assertions. */
export function nodeBoxes(scene) {
  const map = new Map();
  for (const e of scene.elements) if (e.kind === 'shape' && e.meta?.specId && !map.has(e.meta.specId)) map.set(e.meta.specId, e);
  return map;
}
