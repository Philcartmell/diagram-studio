// CLI contract: JSON on stdout, messages on stderr, exit 0 / 1 / 2.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CLI, ROOT, cleanTmp, examples, tmpDir } from './helpers.mjs';

function run(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

const ex = (name) => examples().find((e) => e.name === name).file;

describe('CLI', () => {
  const dir = tmpDir('cli');

  it('render: exit 0, JSON summary, every format written', () => {
    const r = run('render', ex('01-invoice-approval'), '--all', '--out', dir);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.ok).toBe(true);
    const formats = r.json.files.map((f) => f.format).sort();
    expect(formats).toEqual(['drawio', 'pdf', 'png', 'pptx', 'preview', 'spec', 'svg']);
    expect(fs.existsSync(path.join(dir, 'preview.png'))).toBe(true);
    expect(r.json.files.find((f) => f.format === 'svg').path).toMatch(/invoices-over-gbp-10k-wait-two-days-for-a-second-approval\.svg$/);
    expect(r.stderr).toMatch(/self-review checklist/);
  });

  it('render (SVG only): every example exits 0, with no crash on exit', () => {
    // Fast SVG-only renders hit a libuv assertion on Windows when the CLI called
    // process.exit() with the HarfBuzz WASM from subset-font 2.9 still busy.
    for (const e of examples()) {
      const r = run('render', e.file, '--out', path.join(dir, 'svg-only', `${e.type}-${e.name}`), '--no-preview');
      expect(r.code, `${e.type}/${e.name}: ${r.stderr}`).toBe(0);
      expect(r.stderr).not.toMatch(/Assertion failed/);
      expect(r.json.files.map((f) => f.format).sort()).toEqual(['spec', 'svg']);
    }
  });

  it('validate: exit 1 with plain-sentence errors for a bad spec', () => {
    const bad = path.join(dir, 'bad.json');
    const spec = JSON.parse(fs.readFileSync(ex('01-invoice-approval'), 'utf8'));
    spec.body.steps[0].lane = 'nowhere';
    fs.writeFileSync(bad, JSON.stringify(spec));
    const r = run('validate', bad);
    expect(r.code).toBe(1);
    expect(r.json.errors[0].message).toMatch(/is not a lane/);
    expect(run('render', bad, '--out', dir).code).toBe(1);
  });

  it('reports invalid JSON with a line number', () => {
    const bad = path.join(dir, 'broken.json');
    fs.writeFileSync(bad, '{\n  "version": "1.0",\n  "type": "swimlane"\n  "title": "x"\n}');
    const r = run('validate', bad);
    expect(r.code).toBe(1);
    expect(r.json.errors[0].message).toMatch(/not valid JSON/);
  });

  it('check: exit 2 when the layout cannot fit, without writing outputs', () => {
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'stress', '03-detailed-60-nodes.json'), 'utf8'));
    spec.canvas = { aspect: '16:9' };
    const f = path.join(dir, 'too-big.json');
    fs.writeFileSync(f, JSON.stringify(spec));
    const r = run('check', f);
    expect(r.code).toBe(2);
    expect(r.json.errors.some((e) => e.check === 'canvas-fit')).toBe(true);
    const out = tmpDir('cli-no-out');
    const rr = run('render', f, '--out', out);
    expect(rr.code).toBe(2);
    // Only the diagnostic preview is written; no deliverables.
    expect(fs.readdirSync(out)).toEqual(['preview.png']);
    expect(rr.json.notes.join(' ')).toMatch(/diagnosis only/);
    expect(run('render', '--help').code).toBe(0);
  });

  it('types, example, icons and theme list print JSON', () => {
    expect(run('types').json.types.map((t) => t.type)).toEqual(['operating-model', 'swimlane', 'roadmap', 'value-chain', 'matrix-2x2', 'layered-architecture', 'azure-architecture', 'databricks-architecture']);
    const e = run('example', 'roadmap', '--n', '2');
    expect(e.code).toBe(0);
    expect(e.json.type).toBe('roadmap');
    expect(run('icons').json.icons.length).toBeGreaterThan(150);
    expect(run('theme', 'list').json.themes.map((t) => t.id)).toEqual(expect.arrayContaining(['boardroom', 'blueprint', 'sketch', 'bold', 'minimal', 'print']));
  });

  it('theme validate passes built-ins; theme preview writes a contact sheet', () => {
    expect(run('theme', 'validate', 'print').code).toBe(0);
    const r = run('theme', 'preview', 'blueprint', '--out', dir);
    expect(r.code, r.stderr).toBe(0);
    expect(fs.statSync(r.json.file).size).toBeGreaterThan(50000);
  });

  it('docs lists the guides and prints one; version names the install', () => {
    const list = run('docs');
    expect(list.code).toBe(0);
    expect(list.json.topics.map((t) => t.topic)).toEqual(expect.arrayContaining(['guide', 'spec-format', 'writing-for-leaders', 'swimlane', 'matrix-2x2']));
    const doc = run('docs', 'swimlane');
    expect(doc.code).toBe(0);
    expect(doc.stdout).toMatch(/^# swimlane/);
    const bad = run('docs', 'swimlan');
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/Did you mean "swimlane"/);
    const v = run('version');
    expect(v.json.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(path.resolve(v.json.root)).toBe(ROOT);
    expect(run('--version').json.version).toBe(v.json.version);
  });

  it('unknown commands fail clearly', () => {
    const r = run('draw');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Unknown command "draw"/);
  });
});

afterAll(() => cleanTmp('cli'));
