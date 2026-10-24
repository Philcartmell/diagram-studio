// Preview board: serves the rendered diagrams in a folder and tells open pages when they change.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanTmp, examples, load, tmpDir } from './helpers.mjs';

const { startPreview, collectState, safeResolve } = await load('preview/server.js');
const { render, readSpecFile } = await load('pipeline.js');

const ex = (name) => examples().find((e) => e.name === name).file;

async function renderInto(dir, example, formats = ['svg']) {
  fs.mkdirSync(dir, { recursive: true });
  const spec = path.join(dir, 'diagram.json');
  fs.copyFileSync(ex(example), spec);
  const r = await render(readSpecFile(spec), { outDir: dir, formats, preview: true, specPath: spec });
  expect(r.exitCode).toBe(0);
}

/** Wait for the next server-sent event on /events. */
async function nextEvent(url, trigger) {
  const ctrl = new AbortController();
  const res = await fetch(url + 'events', { signal: ctrl.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  await reader.read(); // the retry: preamble
  trigger();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value);
    if (/^data: \d+/m.test(buf)) break;
  }
  ctrl.abort();
  return buf;
}

describe('preview board', () => {
  const root = tmpDir('preview');

  it('describes one card per folder with an SVG, featuring working/', async () => {
    await renderInto(path.join(root, 'concepts', 'a-layers'), '01-finance-hub', ['svg', 'png']);
    await renderInto(path.join(root, 'working'), '01-invoice-approval', ['svg', 'pptx']);
    fs.writeFileSync(path.join(root, 'brief.md'), '# Brief\n\n- Audience: ExCo\n');
    fs.mkdirSync(path.join(root, 'working', 'history'), { recursive: true });
    fs.copyFileSync(path.join(root, 'working', 'diagram.json'), path.join(root, 'working', 'history', 'v01.json'));

    const s = collectState(root);
    expect(s.brief).toMatch(/Audience: ExCo/);
    expect(s.cards.map((c) => c.folder)).toEqual(['working', 'concepts/a-layers']);
    const [working, concept] = s.cards;
    expect(working.featured).toBe(true);
    expect(working.type).toBe('swimlane');
    expect(working.title).toMatch(/second approval/);
    expect(working.files.map((f) => path.extname(f.name))).toEqual(['.pptx']);
    expect(concept.files.map((f) => path.extname(f.name))).toEqual(['.png']);
    expect(concept.stale).toBe(false);
  });

  it('orders cards by latest activity, so a re-rendered diagram moves to the front', async () => {
    await new Promise((r) => setTimeout(r, 20));
    await renderInto(path.join(root, 'concepts', 'a-layers'), '01-finance-hub', ['svg', 'png']);
    const cards = collectState(root).cards;
    expect(cards.map((c) => c.folder)).toEqual(['concepts/a-layers', 'working']);
    expect(cards[0].touched).toBeGreaterThanOrEqual(cards[0].updated);
    expect(cards[0].touched).toBeGreaterThan(cards[1].touched);
  });

  it('marks a card stale when a later render failed QA', () => {
    const dir = path.join(root, 'concepts', 'a-layers');
    const later = new Date(Date.now() + 60000);
    fs.utimesSync(path.join(dir, 'preview.png'), later, later);
    expect(collectState(root).cards.find((c) => c.folder === 'concepts/a-layers').stale).toBe(true);
  });

  it('never serves files outside the folder', () => {
    expect(safeResolve(root, '/files/working/diagram.json')).toBe(path.join(root, 'working', 'diagram.json'));
    expect(safeResolve(root, '/files/..%2F..%2Fhelpers.mjs')).toBeUndefined();
    expect(safeResolve(root, '/files/')).toBeUndefined();
    expect(safeResolve(root, '/files/%E0%A4%A')).toBeUndefined();
  });

  it('serves the page, the state and the SVGs, and pushes an event when a file changes', async () => {
    const server = await startPreview(root, { port: 0 });
    try {
      const page = await fetch(server.url);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toMatch(/<title>preview · Diagram Studio<\/title>/);
      // A detail view over a thumbnail strip, and a stacked list on phone-sized screens.
      expect(html).toMatch(/id="detail"[\s\S]*id="strip"/);
      expect(html).toMatch(/@media \(max-width: 700px\)/);

      const state = await (await fetch(server.url + 'api/state')).json();
      const svg = await fetch(new URL(state.cards[0].svg, server.url));
      expect(svg.headers.get('content-type')).toBe('image/svg+xml');
      // Versioned URLs never change content, so the page can reuse them without re-downloading.
      expect(svg.headers.get('cache-control')).toMatch(/immutable/);
      expect(await svg.text()).toMatch(/^<svg/);

      expect((await fetch(server.url + 'files/..%2F..%2Fhelpers.mjs')).status).toBe(404);

      const event = await nextEvent(server.url, () => fs.writeFileSync(path.join(root, 'brief.md'), '# Brief\n\n- Audience: board\n'));
      expect(event).toMatch(/^data: \d+/m);
    } finally {
      await server.close();
    }
  });

  it('creates a missing folder and moves to the next port when one is taken', async () => {
    const a = await startPreview(path.join(root, 'new-session'), { port: 0 });
    const b = await startPreview(path.join(root, 'new-session'), { port: a.port });
    try {
      expect(fs.existsSync(path.join(root, 'new-session'))).toBe(true);
      expect(b.port).not.toBe(a.port);
      expect((await (await fetch(b.url + 'api/state')).json()).cards).toEqual([]);
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });
});

afterAll(() => cleanTmp('preview'));
