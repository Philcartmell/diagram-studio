// Sequence diagrams: references are checked, columns fit their labels, arrows
// meet lifelines and activation bars exactly, and Mermaid imports cleanly.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, load } from './helpers.mjs';

const { prepare, isFailure } = await load('pipeline.js');
const { validateSpec } = await load('validate/spec.js');
const { importMermaid } = await load('import/mermaid.js');
const { prepareDeck } = await load('deck.js');

const example = (n = 1) => {
  const dir = path.join(ROOT, 'examples', 'sequence');
  const file = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()[n - 1];
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
};
const codes = (r) => r.errors.map((e) => e.code);
const warnCodes = (r) => r.warnings.map((e) => e.code);
const byId = (scene, id) => scene.elements.find((e) => e.id === id);

/** A small valid spec to vary. */
const base = (steps, extra = {}) => ({
  version: '1.0',
  type: 'sequence',
  altitude: 'management',
  title: 'Orders reach the warehouse within a second of payment',
  body: {
    participants: [
      { id: 'web', label: 'Web shop' },
      { id: 'orders', label: 'Order service' },
      { id: 'stock', label: 'Stock service' },
      { id: 'store', label: 'Warehouse' },
    ],
    steps,
    ...extra,
  },
});
const call = (from, to, label, more = {}) => ({ from, to, label, ...more });

describe('sequence validation', () => {
  it('accepts every bundled example', () => {
    for (let n = 1; n <= 4; n++) expect(validateSpec(example(n)).errors).toEqual([]);
  });

  it('names unknown participants and suggests the closest', () => {
    const r = validateSpec(base([call('web', 'order', 'Place order'), call('orders', 'stock', 'x'), call('stock', 'store', 'y')]));
    expect(codes(r)).toContain('ref.participant');
    expect(r.errors[0].message).toMatch(/Did you mean "orders"/);
  });

  it('rejects groups whose members are not neighbours', () => {
    const r = validateSpec(
      base([call('web', 'orders', 'a'), call('orders', 'stock', 'b'), call('stock', 'store', 'c')], { groups: [{ id: 'ours', label: 'Ours', participants: ['web', 'stock'] }] }),
    );
    expect(codes(r)).toContain('ref.group');
  });

  it('keeps phases at the top level and all-or-nothing', () => {
    const nested = validateSpec(base([{ fragment: 'loop', steps: [{ phase: 'Inner', steps: [call('web', 'orders', 'a')] }] }, call('orders', 'stock', 'b'), call('stock', 'store', 'c')]));
    expect(codes(nested)).toContain('ref.phase');
    const partial = validateSpec(base([{ phase: 'One', steps: [call('web', 'orders', 'a')] }, call('orders', 'stock', 'b'), call('stock', 'store', 'c')]));
    expect(codes(partial)).toContain('ref.phase');
  });

  it('checks create and destroy order', () => {
    const early = validateSpec(base([call('web', 'store', 'too soon'), call('orders', 'store', 'make', { create: true }), call('web', 'orders', 'a'), call('orders', 'stock', 'b')]));
    expect(codes(early)).toContain('ref.created');
    const late = validateSpec(base([call('web', 'orders', 'a', { destroy: 'to' }), call('orders', 'stock', 'after'), call('stock', 'store', 'c')]));
    expect(codes(late)).toContain('ref.destroyed');
  });

  it('checks timing brackets point at messages in order', () => {
    const steps = [call('web', 'orders', 'a', { id: 'first' }), call('orders', 'stock', 'b', { id: 'second' }), call('stock', 'store', 'c')];
    expect(codes(validateSpec(base(steps, { timings: [{ from: 'second', to: 'first', label: '1 s' }] })))).toContain('ref.timing');
    const r = validateSpec(base(steps, { timings: [{ from: 'frist', to: 'second', label: '1 s' }] }));
    expect(r.errors[0].message).toMatch(/Did you mean "first"/);
  });

  it('limits participants by altitude and warns about silent ones', () => {
    const many = base([call('web', 'orders', 'a')]);
    many.altitude = 'executive';
    many.body.participants = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, label: `Party ${i + 1}` }));
    many.body.steps = [call('p1', 'p2', 'a')];
    const r = validateSpec(many);
    expect(codes(r)).toContain('altitude.participants');
    expect(warnCodes(r)).toContain('ref.unused-participant');
  });

  it('counts calls, not returns, against the node limit, and an accented path as one accent', () => {
    const s = base([]);
    s.altitude = 'executive';
    s.body.steps = Array.from({ length: 9 }, (_, i) => [call('web', 'orders', `Call ${i + 1}`), call('orders', 'web', `Reply ${i + 1}`, { kind: 'return' })]).flat();
    s.body.participants = s.body.participants.slice(0, 2);
    expect(codes(validateSpec(s))).not.toContain('altitude.nodes');
    s.body.steps.slice(0, 6).forEach((m) => (m.emphasis = 'accent'));
    expect(warnCodes(validateSpec(s))).not.toContain('altitude.accent');
  });

  it('warns about hex colours that vanish on the background', () => {
    const s = base([call('web', 'orders', 'a', { color: '#FAFAFA' }), call('orders', 'stock', 'b'), call('stock', 'store', 'c')]);
    expect(warnCodes(validateSpec(s))).toContain('ref.color');
  });
});

describe('sequence layout', () => {
  it('renders every example clean', async () => {
    for (let n = 1; n <= 4; n++) {
      const p = await prepare(example(n));
      expect(isFailure(p)).toBe(false);
      expect(p.errors).toEqual([]);
      expect(p.warnings).toEqual([]);
    }
  });

  it('puts arrow tips on the receiving lifeline or activation bar', async () => {
    const p = await prepare(base([call('web', 'orders', 'Place order', { id: 'place' }), call('orders', 'stock', 'Reserve', { id: 'reserve' }), call('stock', 'orders', 'Reserved', { kind: 'return', id: 'back' }), call('orders', 'store', 'Pick', { kind: 'async', id: 'pick' })]));
    expect(p.errors).toEqual([]);
    const life = (id) => byId(p.scene, `${id}--lifeline`).points[0].x;
    const bar = (id) => byId(p.scene, `${id}--activation-1`);
    // A call into "orders" ends at the left edge of the bar it opens.
    expect(byId(p.scene, 'place').points[1].x).toBe(bar('orders').x);
    // The reply leaves the left edge of stock's bar and lands on the right edge of orders' bar.
    const back = byId(p.scene, 'back').points;
    expect(back[0].x).toBe(bar('stock').x);
    expect(back[1].x).toBe(bar('orders').x + bar('orders').w);
    // An async message opens no bar: it ends on the lifeline itself.
    expect(byId(p.scene, 'pick').points[1].x).toBe(life('store'));
    expect(byId(p.scene, 'store--activation-1')).toBeUndefined();
    // Every message line is horizontal.
    for (const id of ['place', 'reserve', 'back', 'pick']) {
      const pts = byId(p.scene, id).points;
      expect(pts[0].y).toBe(pts[1].y);
    }
  });

  it('sizes the gap between lifelines to the label between them', async () => {
    const long = 'Reserve stock for every order line';
    const p = await prepare(base([call('web', 'orders', 'a'), call('orders', 'stock', long, { id: 'long' }), call('stock', 'store', 'c')]));
    const label = byId(p.scene, 'long--label');
    const width = p.fonts.blockWidth(label.lines, label.size, label.weight);
    const x0 = byId(p.scene, 'orders--lifeline').points[0].x;
    const x1 = byId(p.scene, 'stock--lifeline').points[0].x;
    expect(label.lines.length).toBe(1);
    expect(x1 - x0).toBeGreaterThanOrEqual(width + 16);
  });

  it('keeps a long arrow\'s label clear of the lifelines it crosses', async () => {
    const p = await prepare(base([call('web', 'orders', 'a'), call('web', 'store', 'Ship', { id: 'ship' }), call('orders', 'stock', 'c'), call('stock', 'store', 'd')]));
    const label = byId(p.scene, 'ship--label');
    const w = p.fonts.blockWidth(label.lines, label.size, label.weight);
    const [l, r] = [label.x - w / 2, label.x + w / 2];
    for (const id of ['orders', 'stock']) {
      const x = byId(p.scene, `${id}--lifeline`).points[0].x;
      expect(x < l - 4 || x > r + 4).toBe(true);
    }
  });

  it('draws a created participant at its creating message and ends a destroyed lifeline in a cross', async () => {
    const p = await prepare(base([call('web', 'orders', 'a'), call('orders', 'stock', 'Start', { id: 'make', create: true }), call('stock', 'orders', 'Done', { kind: 'return', destroy: 'from' }), call('orders', 'store', 'd')]));
    expect(p.errors).toEqual([]);
    const head = byId(p.scene, 'stock');
    const make = byId(p.scene, 'make');
    expect(head.y + head.h / 2).toBe(make.points[0].y);
    expect(make.points[1].x).toBe(head.x);
    expect(byId(p.scene, 'stock--destroy-1')).toBeDefined();
    const life = byId(p.scene, 'stock--lifeline');
    expect(life.points[1].y).toBeLessThan(byId(p.scene, 'orders--lifeline').points[1].y);
  });

  it('numbers messages as badges or inline', async () => {
    const steps = [call('web', 'orders', 'Place order'), call('orders', 'stock', 'Reserve'), call('stock', 'store', 'Pick')];
    const badge = await prepare(base(steps, { numbering: 'badge' }));
    expect(byId(badge.scene, 'message-3--number-text').lines).toEqual(['3']);
    const inline = await prepare(base(steps, { numbering: 'inline' }));
    expect(byId(inline.scene, 'message-2--label').lines).toEqual(['2. Reserve']);
  });

  it('mutes the rest of the flow when a path is accented', async () => {
    const p = await prepare(base([call('web', 'orders', 'a', { emphasis: 'accent' }), call('orders', 'stock', 'b', { emphasis: 'accent' }), call('stock', 'store', 'c')]));
    expect(byId(p.scene, 'message-1').paint.stroke.toUpperCase()).toBe(p.theme.color.accent.toUpperCase());
    expect(byId(p.scene, 'message-3').paint.stroke).toBe(byId(p.scene, 'stock--lifeline').paint.stroke);
  });

  it('reports a flow too long for 16:9 and grows an auto canvas instead', async () => {
    const steps = Array.from({ length: 16 }, (_, i) => call(i % 2 ? 'orders' : 'web', i % 2 ? 'web' : 'orders', `Step ${i + 1}`));
    const fixed = await prepare(base(steps));
    expect(fixed.errors.map((e) => e.check)).toContain('canvas-fit');
    expect(fixed.errors.find((e) => e.check === 'canvas-fit').message).toMatch(/Sequence diagrams run down the page/);
    const auto = await prepare({ ...base(steps), canvas: { aspect: 'auto' } });
    expect(auto.errors).toEqual([]);
    expect(auto.scene.height).toBeGreaterThan(720);
  });

  it('frames fragments around what they hold, nested frames inside their parents', async () => {
    const p = await prepare(
      base([
        call('web', 'orders', 'a'),
        { fragment: 'loop', id: 'retry', label: 'up to 3 times', steps: [{ fragment: 'opt', id: 'slow', label: 'stock slow', steps: [call('orders', 'stock', 'Ask again')] }] },
        call('stock', 'store', 'c'),
      ]),
    );
    expect(p.errors).toEqual([]);
    const outer = byId(p.scene, 'retry');
    const inner = byId(p.scene, 'slow');
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.x + inner.w).toBeLessThan(outer.x + outer.w);
    expect(inner.y).toBeGreaterThan(outer.y);
    expect(inner.y + inner.h).toBeLessThan(outer.y + outer.h);
  });

  it('renders in every built-in theme and header style without QA issues', async () => {
    const s = example(4);
    for (const participants of ['card', 'pill', 'underline', 'plain']) {
      for (const theme of ['boardroom', 'bold', 'sketch', 'minimal']) {
        const v = structuredClone(s);
        v.body.style = { ...v.body.style, participants };
        const p = await prepare(v, { theme });
        expect([...p.errors, ...p.warnings], `${participants} / ${theme}`).toEqual([]);
      }
    }
  });
});

describe('Mermaid import', () => {
  const src = `---
title: Password resets finish in one visit once the link is single-use
---
sequenceDiagram
    autonumber
    actor U as Account holder
    box Aqua Our platform
    participant W as Web app
    participant A as Auth service
    participant DB@{ "type": "database" } as User store
    end
    U->>+W: Forgot password
    W->>+A: Start reset
    A->>DB: Look up account
    DB-->>A: Account found
    alt account locked
        A-->>W: Refuse reset
    else account active
        create participant T as Reset token
        A->>T: Issue token
        A-)W: Send link
        Note over A,W: Token only, never the email
    end
    A-->>-W: Reset started
    W-->>-U: Check your inbox
    rect rgb(230, 240, 255)
    U->>W: Open link
    end
    destroy T
    A-xT: Expire token
    %% a comment
    links W: {"Docs": "https://example.invalid"}
`;

  it('maps participants, boxes, arrows, fragments, create and destroy', () => {
    const { spec, report } = importMermaid(src);
    const b = spec.body;
    expect(spec.title).toBe('Password resets finish in one visit once the link is single-use');
    expect(b.participants.map((p) => [p.id, p.label, p.kind])).toEqual([
      ['u', 'Account holder', 'person'],
      ['w', 'Web app', undefined],
      ['a', 'Auth service', undefined],
      ['db', 'User store', 'database'],
      ['t', 'Reset token', undefined],
    ]);
    expect(b.groups).toEqual([{ id: 'group-our-platform', label: 'Our platform', participants: ['w', 'a', 'db'] }]);
    expect(b.numbering).toBe('badge');
    expect(b.activations).toBe('manual');
    expect(b.steps[0]).toEqual({ from: 'u', to: 'w', label: 'Forgot password', activate: true });
    expect(b.steps[3]).toEqual({ from: 'db', to: 'a', label: 'Account found', kind: 'return' });
    const alt = b.steps[4];
    expect(alt.fragment).toBe('alt');
    expect(alt.branches[0].label).toBe('account active');
    expect(alt.branches[0].steps[0]).toMatchObject({ to: 't', create: true });
    expect(alt.branches[0].steps[1]).toMatchObject({ kind: 'async' });
    expect(alt.branches[0].steps[2]).toEqual({ note: 'Token only, never the email', over: ['a', 'w'] });
    expect(b.steps[5]).toMatchObject({ kind: 'return', deactivate: true });
    expect(b.steps[7]).toMatchObject({ highlight: true, color: '#E6F0FF' });
    expect(b.steps[8]).toMatchObject({ from: 'a', to: 't', kind: 'fail', destroy: 'to' });
    expect(report.notes.join(' ')).toMatch(/links/);
  });

  it('produces a spec that validates and renders', async () => {
    const { spec } = importMermaid(src);
    expect(validateSpec(spec).errors).toEqual([]);
    const p = await prepare({ ...spec, canvas: { aspect: 'auto' } });
    expect(p.errors).toEqual([]);
  });

  it('refuses other Mermaid diagrams with a clear message', () => {
    expect(() => importMermaid('flowchart LR\n  A --> B')).toThrow(/sequenceDiagram/);
  });
});

describe('sequence in exhibits and decks', () => {
  it('draws a page that just misses the deck canvas as a slightly smaller figure, and refuses one too small to read', async () => {
    const locker = example(4);
    const near = structuredClone(locker);
    near.altitude = 'management';
    delete near.subtitle;
    delete near.canvas;
    near.body.style.mirror = false;
    near.body.steps = near.body.steps.filter((s) => !s.divider && s.fragment !== 'break' && !s.note);
    const { pages } = await prepareDeck({ version: '1.0', title: 'Locker flows', pages: [{ diagram: near }, { diagram: example(2) }] });
    expect(pages[0].result.ok).toBe(true);
    expect(pages[0].result.notes.join(' ')).toMatch(/slightly smaller figure/);
    // Twelve messages in three phases would print below the minimum size: the page fails and says to split it.
    expect(pages[1].result.ok).toBe(false);
    expect(pages[1].result.errors.map((e) => e.message).join(' ')).toMatch(/split the flow/);
  });

  it('sits beside a narrative in an exhibit panel', async () => {
    const p = await prepare({
      version: '1.0',
      type: 'exhibit',
      altitude: 'management',
      title: 'Orders reach the warehouse within a second of payment',
      body: {
        panels: [
          { id: 'why', type: 'narrative', body: { heading: 'Why', paragraphs: ['Stock is reserved before the order is confirmed.'] } },
          { id: 'flow', type: 'sequence', span: 2, body: base([call('web', 'orders', 'Place order'), call('orders', 'stock', 'Reserve'), call('stock', 'store', 'Pick')]).body },
        ],
      },
    });
    expect(p.errors).toEqual([]);
    expect(p.scene.elements.some((e) => e.id === 'p2_orders--lifeline')).toBe(true);
  });
});
