/**
 * Mermaid `sequenceDiagram` → sequence spec. Covers the language people
 * actually write: participants and actors (with aliases and types), boxes,
 * every arrow form, +/- and activate/deactivate, create and destroy, notes,
 * loop / alt / opt / par / critical / break / rect, autonumber and title.
 * Anything it cannot map is reported, never silently dropped.
 */
import type { Altitude, MessageKind, ParticipantKind, SequenceBody, SequenceGroup, SequenceMessage, SequenceParticipant, SequenceStep, Spec } from '../spec.js';
import { sequenceMessages } from '../spec.js';

export interface MermaidImportResult {
  spec: Spec;
  report: { participants: number; messages: number; notes: string[] };
}

interface Frame {
  steps: SequenceStep[];
  /** The fragment being filled, when this frame is one of its sections. */
  owner?: { kind: string; node: Record<string, unknown> };
}

// Longest operators first so "-->>" is not read as "-->" + ">".
const ARROWS: { op: string; kind: MessageKind; dashed: boolean; both?: boolean; plain?: boolean }[] = [
  { op: '<<-->>', kind: 'sync', dashed: true, both: true },
  { op: '<<->>', kind: 'sync', dashed: false, both: true },
  { op: '-->>', kind: 'return', dashed: true },
  { op: '->>', kind: 'sync', dashed: false },
  { op: '--x', kind: 'fail', dashed: true },
  { op: '-x', kind: 'fail', dashed: false },
  { op: '--)', kind: 'async', dashed: true },
  { op: '-)', kind: 'async', dashed: false },
  { op: '-->', kind: 'return', dashed: true, plain: true },
  { op: '->', kind: 'sync', dashed: false, plain: true },
];

const CSS_COLORS = new Set(
  'transparent aqua aquamarine azure beige bisque black blue brown coral crimson cyan fuchsia gold goldenrod gray grey green honeydew indigo ivory khaki lavender lightblue lightcoral lightcyan lightgray lightgrey lightgreen lightpink lightyellow lime linen magenta maroon mintcream navy olive orange orchid peachpuff pink plum purple red salmon silver skyblue snow tan teal thistle tomato turquoise violet wheat white whitesmoke yellow'.split(' '),
);

const TYPE_KIND: Record<string, ParticipantKind> = {
  actor: 'person',
  database: 'database',
  collections: 'database',
  queue: 'queue',
  boundary: 'external',
  control: 'service',
  entity: 'system',
  participant: 'system',
};

function slug(raw: string, taken: Set<string>): string {
  let s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s || !/^[a-z]/.test(s)) s = `p-${s || 'x'}`;
  s = s.slice(0, 40).replace(/-+$/, '');
  let out = s;
  for (let n = 2; taken.has(out); n++) out = `${s}-${n}`;
  taken.add(out);
  return out;
}

function clean(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text: string, max: number, notes: string[], what: string): string {
  if ([...text].length <= max) return text;
  notes.push(`${what} "${text}" was shortened to ${max} characters.`);
  return [...text].slice(0, max - 1).join('') + '…';
}

function rgbToHex(s: string): string | undefined {
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return /^#[0-9a-f]{6}$/i.test(s.trim()) ? s.trim().toUpperCase() : undefined;
  return '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function importMermaid(source: string, opts: { title?: string } = {}): MermaidImportResult {
  const notes: string[] = [];
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  const taken = new Set<string>();
  const byName = new Map<string, SequenceParticipant>();
  const participants: SequenceParticipant[] = [];
  const groups: SequenceGroup[] = [];
  let currentBox: SequenceGroup | undefined;
  let title = opts.title;
  let numbered = false;
  let manual = false;
  const pendingCreate = new Set<string>();
  const pendingDestroy = new Set<string>();
  const root: Frame = { steps: [] };
  const stack: Frame[] = [root];
  let lastMsg: SequenceMessage | undefined;
  let started = false;

  const declare = (name: string, label?: string, kind?: ParticipantKind): SequenceParticipant => {
    let p = byName.get(name);
    if (!p) {
      p = { id: slug(name, taken), label: clip(clean(label ?? name), 40, notes, 'Participant label') };
      if (kind && kind !== 'system') p.kind = kind;
      byName.set(name, p);
      participants.push(p);
      if (currentBox) currentBox.participants.push(p.id);
    } else {
      if (label) p.label = clip(clean(label), 40, notes, 'Participant label');
      if (kind && kind !== 'system') p.kind = kind;
    }
    return p;
  };
  const top = () => stack[stack.length - 1];

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const line = raw.replace(/%%.*$/, '').trim();
    if (!line) continue;
    const where = `line ${ln + 1}`;
    if (!started) {
      if (/^sequenceDiagram\b/.test(line)) {
        started = true;
        continue;
      }
      if (/^(---|title:|config:)/.test(line) || /^[a-zA-Z]+:/.test(line)) {
        const t = line.match(/^title:\s*(.+)$/);
        if (t && !title) title = clean(t[1]);
        continue;
      }
      throw new Error(`${where}: expected "sequenceDiagram". Only Mermaid sequence diagrams can be imported.`);
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^title\s*:?\s*(.+)$/i))) {
      if (!title) title = clean(m[1]);
      continue;
    }
    if (/^autonumber\b/i.test(line)) {
      numbered = true;
      continue;
    }
    if (/^(accTitle|accDescr|links?|properties|details)\b/i.test(line)) {
      notes.push(`${where}: "${line.split(/[\s:]/)[0]}" has no equivalent and was skipped.`);
      continue;
    }
    // Participants: [create] participant|actor Name[@{ "type": "…" }] [as Label]
    if ((m = line.match(/^(create\s+)?(participant|actor)\s+(.+?)(?:@\{(.*)\})?(?:\s+as\s+(.+))?$/i))) {
      const [, create, word, name, meta, alias] = m;
      let kind: ParticipantKind = word.toLowerCase() === 'actor' ? 'person' : 'system';
      const type = meta?.match(/"type"\s*:\s*"(\w+)"/)?.[1];
      if (type && TYPE_KIND[type]) kind = TYPE_KIND[type];
      const p = declare(name.trim(), alias, kind);
      if (create) pendingCreate.add(p.id);
      continue;
    }
    if ((m = line.match(/^destroy\s+(.+)$/i))) {
      const p = byName.get(m[1].trim());
      if (p) pendingDestroy.add(p.id);
      else notes.push(`${where}: "destroy ${m[1].trim()}" names an unknown participant and was skipped.`);
      continue;
    }
    if ((m = line.match(/^box\b\s*(.*)$/i))) {
      const rest = m[1].trim();
      // An optional colour comes first: rgb(...), #hex, or a CSS colour name.
      const first = rest.split(/\s+/)[0];
      const colorMatch = rest.match(/^(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s*/i) ?? (CSS_COLORS.has(first.toLowerCase()) ? [first] : null);
      let label = rest;
      if (colorMatch) label = rest.slice(colorMatch[0].length);
      label = clean(label) || `Group ${groups.length + 1}`;
      currentBox = { id: slug(`group-${label}`, taken), label: clip(label, 40, notes, 'Box label'), participants: [] };
      groups.push(currentBox);
      stack.push({ steps: [], owner: { kind: 'box', node: {} } });
      continue;
    }
    if ((m = line.match(/^activate\s+(.+)$/i))) {
      manual = true;
      const p = byName.get(m[1].trim());
      if (p && lastMsg && lastMsg.to === p.id) lastMsg.activate = true;
      else notes.push(`${where}: "activate ${m[1].trim()}" does not follow a message to it, so it was skipped.`);
      continue;
    }
    if ((m = line.match(/^deactivate\s+(.+)$/i))) {
      manual = true;
      const p = byName.get(m[1].trim());
      if (p && lastMsg && lastMsg.from === p.id) lastMsg.deactivate = true;
      else notes.push(`${where}: "deactivate ${m[1].trim()}" does not follow a message from it, so it was skipped.`);
      continue;
    }
    if ((m = line.match(/^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i))) {
      const [, pos, who, text] = m;
      const ids = who.split(',').map((w) => declare(w.trim()).id);
      const over = ids.length === 1 ? ids[0] : ids.slice(0, 2);
      const position = pos.toLowerCase().startsWith('left') ? 'left' : pos.toLowerCase().startsWith('right') ? 'right' : undefined;
      top().steps.push({ note: clip(clean(text) || '…', 160, notes, 'Note'), over, ...(position && ids.length === 1 ? { position } : {}) });
      continue;
    }
    if ((m = line.match(/^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i))) {
      const kind = m[1].toLowerCase();
      const label = clean(m[2]);
      const frame: Frame = { steps: [] };
      if (kind === 'rect') {
        const color = rgbToHex(m[2]);
        const node: Record<string, unknown> = { highlight: true, steps: frame.steps };
        if (color) node.color = color;
        top().steps.push(node as unknown as SequenceStep);
        frame.owner = { kind, node };
      } else {
        const node: Record<string, unknown> = { fragment: kind, steps: frame.steps };
        if (label) node.label = clip(label, 60, notes, 'Fragment label');
        top().steps.push(node as unknown as SequenceStep);
        frame.owner = { kind, node };
      }
      stack.push(frame);
      continue;
    }
    if ((m = line.match(/^(else|and|option)\b\s*(.*)$/i))) {
      const cur = top();
      if (!cur.owner || !['alt', 'par', 'critical'].includes(cur.owner.kind)) {
        notes.push(`${where}: "${m[1]}" outside alt, par or critical was skipped.`);
        continue;
      }
      stack.pop();
      const owner = cur.owner;
      const branch: { label?: string; steps: SequenceStep[] } = { steps: [] };
      const label = clean(m[2]);
      if (label) branch.label = clip(label, 60, notes, 'Branch label');
      const node = owner.node as { branches?: unknown[] };
      (node.branches ??= []).push(branch);
      stack.push({ steps: branch.steps, owner });
      continue;
    }
    if (/^end\b/i.test(line)) {
      if (stack.length === 1) {
        notes.push(`${where}: an "end" without an open block was skipped.`);
        continue;
      }
      const done = stack.pop()!;
      if (done.owner?.kind === 'box') {
        currentBox = undefined;
        top().steps.push(...done.steps);
      }
      continue;
    }
    // Messages: A->>+B: text
    const arrow = ARROWS.map((a) => ({ a, i: line.indexOf(a.op) })).filter((x) => x.i > 0).sort((x, y) => x.i - y.i || y.a.op.length - x.a.op.length)[0];
    if (arrow) {
      const colon = line.indexOf(':', arrow.i + arrow.a.op.length);
      const lhs = line.slice(0, arrow.i).trim();
      let rhs = (colon >= 0 ? line.slice(arrow.i + arrow.a.op.length, colon) : line.slice(arrow.i + arrow.a.op.length)).trim();
      const text = colon >= 0 ? clean(line.slice(colon + 1)) : '';
      let act: '+' | '-' | undefined;
      if (rhs.startsWith('+') || rhs.startsWith('-')) {
        act = rhs[0] as '+' | '-';
        rhs = rhs.slice(1).trim();
      }
      if (!lhs || !rhs) {
        notes.push(`${where}: could not read "${line}" and skipped it.`);
        continue;
      }
      const from = declare(lhs);
      const to = declare(rhs);
      const msg: SequenceMessage = { from: from.id, to: to.id };
      if (text) msg.label = clip(text, 80, notes, 'Message label');
      if (arrow.a.kind !== 'sync') msg.kind = arrow.a.kind;
      if (arrow.a.kind === 'sync' && arrow.a.dashed) msg.style = 'dashed';
      if (arrow.a.kind === 'async' && arrow.a.dashed) msg.style = 'dashed';
      if (arrow.a.kind === 'fail' && arrow.a.dashed) msg.style = 'dashed';
      if (arrow.a.both) msg.both = true;
      if (act === '+') {
        msg.activate = true;
        manual = true;
      }
      if (act === '-') {
        msg.deactivate = true;
        manual = true;
      }
      if (pendingCreate.has(to.id)) {
        msg.create = true;
        pendingCreate.delete(to.id);
      }
      if (pendingDestroy.has(to.id)) {
        msg.destroy = 'to';
        pendingDestroy.delete(to.id);
      } else if (pendingDestroy.has(from.id)) {
        msg.destroy = 'from';
        pendingDestroy.delete(from.id);
      }
      top().steps.push(msg);
      lastMsg = msg;
      continue;
    }
    notes.push(`${where}: "${line}" is not understood and was skipped.`);
  }
  if (!started) throw new Error('no "sequenceDiagram" header found. Only Mermaid sequence diagrams can be imported.');
  while (stack.length > 1) {
    const done = stack.pop()!;
    if (done.owner?.kind === 'box') top().steps.push(...done.steps);
    notes.push('A block was not closed with "end"; it was closed at the end of the file.');
  }
  if (!participants.length) throw new Error('the diagram has no participants or messages.');

  // Groups must hold neighbouring participants: keep the participant order Mermaid draws,
  // which already follows declaration order, and drop empty boxes.
  const usedGroups = groups.filter((g) => g.participants.length);
  const body: SequenceBody = { participants, steps: root.steps };
  if (usedGroups.length) body.groups = usedGroups;
  if (numbered) body.numbering = 'badge';
  body.activations = manual ? 'manual' : 'none';

  const msgs = sequenceMessages(body);
  const calls = msgs.filter((x) => x.msg.kind !== 'return').length;
  const altitude: Altitude = calls <= 9 && participants.length <= 6 ? 'executive' : calls <= 20 && participants.length <= 10 ? 'management' : 'detailed';
  const spec: Spec = {
    version: '1.0',
    type: 'sequence',
    altitude,
    title: title ?? 'State the finding this sequence shows',
    body: body as unknown as Record<string, unknown>,
  };
  if (msgs.length > (altitude === 'executive' ? 8 : 10)) spec.canvas = { aspect: 'auto' };
  if (!title) notes.push('The diagram has no title; replace the placeholder with an action title that states the finding.');
  return { spec, report: { participants: participants.length, messages: msgs.length, notes } };
}
