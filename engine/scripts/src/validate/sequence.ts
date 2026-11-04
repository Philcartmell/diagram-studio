/** Cross-reference and altitude checks for sequence diagrams. */
import {
  type Altitude,
  type SequenceBody,
  type SequenceStep,
  isSeqDelay,
  isSeqDivider,
  isSeqFragment,
  isSeqHighlight,
  isSeqMessage,
  isSeqNote,
  isSeqPhase,
  sequenceMessages,
} from '../spec.js';
import { contrast, isHex } from '../theme/color.js';
import type { Theme } from '../theme/types.js';
import { closest } from '../util.js';
import { NEXT_ALTITUDE } from './altitude.js';

type Report = (path: string, message: string, code: string) => void;

/** Participants a sequence can carry at each altitude before the columns stop reading. */
export const SEQUENCE_PARTICIPANTS: Record<Altitude, number> = { executive: 6, management: 10, detailed: 14 };

/** Fragments nest at most this deep. */
const MAX_DEPTH = 4;

function raise(altitude: Altitude): string {
  const higher = NEXT_ALTITUDE[altitude];
  return higher ? `, or set "altitude": "${higher}"` : '';
}

export function checkSequence(body: SequenceBody, altitude: Altitude, err: Report, warn: Report): void {
  const ids = body.participants.map((p) => p.id);
  const order = new Map(ids.map((id, i) => [id, i]));
  const refParticipant = (path: string, v: string) => {
    if (order.has(v)) return true;
    const g = closest(v, ids);
    err(path, `"${v}" is not a participant.${g ? ` Did you mean "${g}"?` : ''} Participants are: ${ids.join(', ')}.`, 'ref.participant');
    return false;
  };

  const limit = SEQUENCE_PARTICIPANTS[altitude];
  if (body.participants.length > limit)
    err('body.participants', `${body.participants.length} participants; ${altitude} sequence diagrams allow ${limit}. Merge parties that act as one (for example the services behind one gateway)${raise(altitude)}.`, 'altitude.participants');

  // Groups: known, contiguous participants, each in one group at most.
  const grouped = new Map<string, string>();
  (body.groups ?? []).forEach((g, i) => {
    const okIds = g.participants.filter((p, k) => refParticipant(`body.groups[${i}].participants[${k}]`, p));
    for (const p of okIds) {
      const prev = grouped.get(p);
      if (prev) err(`body.groups[${i}].participants`, `"${p}" is already in group "${prev}". A participant belongs to one group at most.`, 'ref.group');
      else grouped.set(p, g.id);
    }
    if (okIds.length === g.participants.length) {
      const idx = okIds.map((p) => order.get(p)!).sort((a, b) => a - b);
      if (idx[idx.length - 1] - idx[0] !== idx.length - 1)
        err(`body.groups[${i}].participants`, `the participants of "${g.id}" are not next to each other. Reorder "participants" so ${okIds.join(', ')} sit side by side.`, 'ref.group');
    }
  });

  // Walk the steps in order: references, create/destroy order, nesting.
  const created = new Set<string>();
  const destroyed = new Map<string, string>();
  const seen = new Set<string>();
  const willCreate = new Set<string>();
  for (const { msg } of sequenceMessages(body)) if (msg.create) willCreate.add(msg.to);
  const use = (path: string, p: string) => {
    if (destroyed.has(p)) err(path, `"${p}" is used after its lifeline ended at ${destroyed.get(p)}. Move the "destroy" to its last message.`, 'ref.destroyed');
    if (willCreate.has(p) && !created.has(p)) err(path, `"${p}" is used before the message that creates it. Move "create": true to its first message.`, 'ref.created');
    seen.add(p);
  };

  const walk = (steps: SequenceStep[], path: string, depth: number) => {
    steps.forEach((s, i) => {
      const p = `${path}[${i}]`;
      if (isSeqMessage(s)) {
        const okFrom = refParticipant(`${p}.from`, s.from);
        const okTo = refParticipant(`${p}.to`, s.to);
        if (okFrom) use(`${p}.from`, s.from);
        if (okTo && s.create) {
          if (s.from === s.to) err(`${p}.create`, 'a participant cannot create itself.', 'ref.created');
          else if (created.has(s.to)) err(`${p}.create`, `"${s.to}" is created twice. Only its first message creates it.`, 'ref.created');
          else if (seen.has(s.to)) err(`${p}.create`, `"${s.to}" already appears earlier, so this message cannot create it. Move "create": true to its first message.`, 'ref.created');
          created.add(s.to);
          seen.add(s.to);
        } else if (okTo) use(`${p}.to`, s.to);
        if (s.destroy) {
          const who = s.destroy === 'from' ? s.from : s.to;
          if (order.has(who)) destroyed.set(who, p);
        }
        if (s.from === s.to && s.kind === 'return') warn(p, 'a return message from a participant to itself reads oddly. Use a "sync" self-message or drop it.', 'ref.self-return');
      } else if (isSeqNote(s)) {
        const over = Array.isArray(s.over) ? s.over : [s.over];
        over.forEach((o, k) => {
          if (refParticipant(Array.isArray(s.over) ? `${p}.over[${k}]` : `${p}.over`, o)) use(`${p}.over`, o);
        });
        if (over.length === 2 && over[0] === over[1]) err(`${p}.over`, 'names the same participant twice. Give one participant, or two different ones to stretch across.', 'ref.note');
        if (over.length === 2 && s.position && s.position !== 'over') err(`${p}.position`, `"${s.position}" works with one participant only; a note across two is always drawn over them.`, 'ref.note');
      } else if (isSeqFragment(s) || isSeqHighlight(s)) {
        if (depth >= MAX_DEPTH) err(p, `fragments nest ${depth + 1} deep; keep it to ${MAX_DEPTH}. Flatten the inner ones or split the diagram.`, 'ref.nesting');
        walk(s.steps, `${p}.steps`, depth + 1);
        if (isSeqFragment(s)) {
          (s.branches ?? []).forEach((b, k) => walk(b.steps, `${p}.branches[${k}].steps`, depth + 1));
          if ((s.fragment === 'loop' || s.fragment === 'opt' || s.fragment === 'break') && s.branches?.length)
            err(`${p}.branches`, `a "${s.fragment}" has one section. Use "alt" for either/or branches or "par" for parallel ones.`, 'ref.fragment');
          if ((s.fragment === 'alt' || s.fragment === 'par') && !s.branches?.length)
            warn(p, `an "${s.fragment}" with one section reads as "opt". Add "branches" or use "fragment": "opt".`, 'ref.fragment');
        }
      } else if (isSeqPhase(s)) {
        if (depth > 0) err(p, 'phases run across the whole diagram, so they sit at the top level of "steps", not inside a fragment.', 'ref.phase');
        walk(s.steps, `${p}.steps`, depth);
      } else if (isSeqDivider(s) || isSeqDelay(s)) {
        // nothing to check
      }
    });
  };
  walk(body.steps, 'body.steps', 0);

  // Phases: when used, every top-level step belongs to one.
  const top = body.steps;
  if (top.some(isSeqPhase) && !top.every((s) => isSeqPhase(s) || isSeqDivider(s) || isSeqDelay(s)))
    err('body.steps', 'once one step is a phase, every top-level step must be a phase (dividers and delays may sit between them). Wrap the loose steps in a phase.', 'ref.phase');

  body.participants.forEach((pt, i) => {
    if (!seen.has(pt.id)) warn(`body.participants[${i}]`, `"${pt.id}" sends and receives nothing. Remove it or add its messages.`, 'ref.unused-participant');
  });

  const msgs = sequenceMessages(body);
  if (!msgs.length) err('body.steps', 'has no messages. A sequence diagram needs at least one message between participants.', 'ref.empty');
  const named = new Map(msgs.filter((m) => m.msg.id).map((m) => [m.msg.id!, m.index]));
  (body.timings ?? []).forEach((t, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!named.has(t[end])) {
        const g = closest(t[end], [...named.keys()]);
        err(`body.timings[${i}].${end}`, `"${t[end]}" is not a message id.${g ? ` Did you mean "${g}"?` : ''} Give the messages an "id" to point at them.`, 'ref.timing');
      }
    }
    if (named.has(t.from) && named.has(t.to) && named.get(t.to)! < named.get(t.from)!)
      err(`body.timings[${i}]`, `"to" (${t.to}) comes before "from" (${t.from}). Swap them.`, 'ref.timing');
  });
}

/** Hex colours that would disappear on the page background. */
export function sequenceColorWarnings(body: SequenceBody, theme: Theme, warn: Report): void {
  const check = (path: string, c: string | undefined) => {
    if (!c || !isHex(c)) return;
    const k = contrast(c, theme.color.background);
    if (k < 2.2) warn(`${path}.color`, `"${c}" has ${k}:1 contrast on the ${theme.name} background, so lines and outlines in it will be hard to see. Pick a darker colour, or a theme colour such as "accent" or "cat-2".`, 'ref.color');
  };
  body.participants.forEach((p, i) => check(`body.participants[${i}]`, p.color));
  (body.groups ?? []).forEach((g, i) => check(`body.groups[${i}]`, g.color));
  const walk = (steps: SequenceStep[], path: string) =>
    steps.forEach((s, i) => {
      const p = `${path}[${i}]`;
      if ('color' in s) check(p, (s as { color?: string }).color);
      if (isSeqFragment(s)) {
        walk(s.steps, `${p}.steps`);
        (s.branches ?? []).forEach((b, k) => walk(b.steps, `${p}.branches[${k}].steps`));
      } else if (isSeqHighlight(s) || isSeqPhase(s)) walk(s.steps, `${p}.steps`);
    });
  walk(body.steps, 'body.steps');
}
