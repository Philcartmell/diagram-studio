/**
 * sequence: participants as lifelines, messages as horizontal arrows in time
 * order. Columns are sized from the measured labels (each message gets the
 * room it needs between its two lifelines), rows stack down the page, and
 * fragments, notes, phases and timing brackets wrap around what they hold.
 *
 * Geometry is computed first (a model), then drawn back to front: groups,
 * phase bands, fragment fills, lifelines, activation bars, headers, fragment
 * tags, notes, messages, labels, timing brackets.
 */
import type { Box, Point, ShapeKind } from '../scene/types.js';
import {
  type Altitude,
  type Emphasis,
  type FragmentKind,
  type MessageKind,
  type SequenceBody,
  type SequenceFragment,
  type SequenceMessage,
  type SequenceNote,
  type SequenceParticipant,
  type SequenceStep,
  type SequenceStyle,
  isSeqDelay,
  isSeqDivider,
  isSeqFragment,
  isSeqHighlight,
  isSeqMessage,
  isSeqNote,
  isSeqPhase,
} from '../spec.js';
import { STATUS_LABEL, badgeLook } from '../theme/paint.js';
import type { Token } from '../theme/tokens.js';
import { clamp, snap, snapUp } from '../util.js';
import { type LayoutContext, type TextStyle, addShape, addText, fitIssue, lh, styles, textOn, textWidth, wrap } from './context.js';
import { type LegendItem, beginFrame, endFrame } from './frame.js';

// ---- Tunables ------------------------------------------------------------------

const HEADER_GAP = 24; // between neighbouring header cards
const LABEL_PAD = 16; // clear space each side of a message label
const BAR_W = 10; // activation bar width
const BAR_STEP = 5; // nested bar offset
const LOOP_W = 28; // self-message loop width
const NOTE_MAX = 200;
const NOTE_MIN = 72;
const TAG_H = 20;
const FRAME_PAD = 14; // fragment frame around its content
const FRAME_NEST = 8; // extra per nesting level outside
const GROUP_PAD = 12;
const GROUP_HEAD = 28;
const BADGE = 18;
const MAX_GAP = 320;

const MSG_WRAP: Record<Altitude, number> = { executive: 220, management: 240, detailed: 260 };
const HEADER_MAX: Record<Altitude, number> = { executive: 200, management: 184, detailed: 168 };

const KIND_ICON: Partial<Record<NonNullable<SequenceParticipant['kind']>, string>> = { person: 'user', queue: 'layers' };

const FRAGMENT_TAG: Record<FragmentKind, string> = { loop: 'loop', alt: 'alt', opt: 'opt', par: 'par', critical: 'critical', break: 'break', group: '' };

// ---- Model ---------------------------------------------------------------------

interface Header {
  p: SequenceParticipant;
  i: number;
  w: number;
  lines: string[];
  desc: string[];
  icon?: string;
}

interface MsgRow {
  t: 'msg';
  m: SequenceMessage;
  id: string;
  n: number;
  lines: string[];
  detail: string[];
  labelW: number;
  labelH: number;
  self: boolean;
  /** Line y (set in the vertical pass). */
  y: number;
  /** Row top. */
  top: number;
}

interface NoteRow {
  t: 'note';
  s: SequenceNote;
  id: string;
  over: number[];
  lines: string[];
  w: number;
  h: number;
  y: number;
  box?: Box;
}

interface FragOpen {
  t: 'open';
  f: SequenceFragment | { highlight: true; label?: string; color?: string; id?: string };
  key: string;
  depth: number;
  kind: FragmentKind | 'highlight';
  label?: string;
  y: number;
}
interface FragSep {
  t: 'sep';
  key: string;
  label?: string;
  y: number;
}
interface FragClose {
  t: 'close';
  key: string;
  y: number;
}
interface PhaseOpen {
  t: 'phase';
  label: string;
  index: number;
  color?: string;
  y: number;
}
interface PhaseClose {
  t: 'phaseEnd';
  index: number;
  y: number;
}
interface Divider {
  t: 'divider';
  text: string;
  y: number;
}
interface Delay {
  t: 'delay';
  text: string;
  y: number;
  h: number;
}

type Row = MsgRow | NoteRow | FragOpen | FragSep | FragClose | PhaseOpen | PhaseClose | Divider | Delay;

interface Resolved {
  participants: SequenceParticipant[];
  style: Required<SequenceStyle>;
  numbering: 'none' | 'badge' | 'inline';
  activations: 'auto' | 'manual' | 'none';
}

/** Spec colour name → theme token. */
export function colorToken(c: string | undefined): Token | undefined {
  if (!c) return undefined;
  if (c.startsWith('#')) return c;
  if (c === 'muted') return 'inkMuted';
  if (c.startsWith('cat-')) return `cat.${Number(c.slice(4)) - 1}`;
  if (['new', 'changed', 'retired'].includes(c)) return `status.${c}`;
  if (c === 'at-risk') return 'status.atRisk';
  return c;
}

function emphasisColor(e: Emphasis | undefined): Token | undefined {
  return e === 'accent' ? 'accent' : e === 'highlight' ? 'highlight' : undefined;
}

export async function layoutSequence(ctx: LayoutContext): Promise<void> {
  const body = ctx.spec.body as unknown as SequenceBody;
  const { theme } = ctx;
  const st = styles(theme);
  const alt = ctx.altitude;
  const s = theme.font.size;
  const w8 = theme.font.weight;

  const res: Resolved = {
    participants: body.participants,
    style: {
      participants: body.style?.participants ?? 'card',
      lifeline: body.style?.lifeline ?? 'dashed',
      arrowheads: body.style?.arrowheads ?? 'classic',
      shading: body.style?.shading ?? (theme.style.bandFill === 'none' ? 'none' : 'soft'),
      density: body.style?.density ?? (alt === 'detailed' ? 'compact' : 'comfortable'),
      shadow: body.style?.shadow ?? theme.shape.shadow === 'soft',
      mirror: body.style?.mirror ?? false,
    },
    numbering: body.numbering ?? 'none',
    activations: body.activations ?? (alt === 'executive' ? 'none' : 'auto'),
  };
  const style = res.style;
  const compact = style.density === 'compact';

  const msgSt: TextStyle = alt === 'detailed' ? { size: s.body, weight: w8.body } : { size: s.body + 1, weight: w8.body };
  const detailSt = st.caption;
  const headSt = st.label;
  const descSt = st.caption;
  const noteSt = st.body;
  const tagSt = st.captionStrong;
  const guardSt: TextStyle = { size: s.caption + 0.5, weight: w8.body };
  const phaseSt = st.bodyStrong;
  const timingSt = st.captionStrong;

  const pIndex = new Map(body.participants.map((p, i) => [p.id, i]));
  const N = body.participants.length;

  // ---- Rows (document order) -----------------------------------------------------
  const rows: Row[] = [];
  let msgCount = 0;
  let fragCount = 0;
  let phaseCount = 0;
  const accented = countAccented(body.steps);
  const focus = accented >= 2;
  const msgWrap = MSG_WRAP[alt];

  const pushSteps = (steps: SequenceStep[], depth: number) => {
    for (const step of steps) {
      if (isSeqMessage(step)) {
        msgCount++;
        const id = step.id ?? `message-${msgCount}`;
        const self = step.from === step.to;
        const text = step.label ? (res.numbering === 'inline' ? `${msgCount}. ${step.label}` : step.label) : res.numbering === 'inline' ? `${msgCount}.` : '';
        const lines = text ? wrap(ctx, text, msgWrap, msgSt) : [];
        const detail = step.detail ? wrap(ctx, step.detail, msgWrap, detailSt) : [];
        const labelW = Math.max(0, ...lines.map((l) => textWidth(ctx, l, msgSt)), ...detail.map((l) => textWidth(ctx, l, detailSt)));
        const labelH = lines.length * lh(ctx, msgSt.size) + detail.length * lh(ctx, detailSt.size);
        rows.push({ t: 'msg', m: step, id, n: msgCount, lines, detail, labelW, labelH, self, y: 0, top: 0 });
      } else if (isSeqNote(step)) {
        const over = (Array.isArray(step.over) ? step.over : [step.over]).map((o) => pIndex.get(o) ?? 0).sort((a, b) => a - b);
        const natural = textWidth(ctx, step.note, noteSt) + 24;
        const w = clamp(Math.ceil(natural), NOTE_MIN, NOTE_MAX);
        const lines = wrap(ctx, step.note, w - 24, noteSt);
        const h = snapUp(lines.length * lh(ctx, noteSt.size) + 16, 4);
        rows.push({ t: 'note', s: step, id: step.id ?? `note-${rows.filter((r) => r.t === 'note').length + 1}`, over, lines, w, h, y: 0 });
      } else if (isSeqFragment(step)) {
        const key = step.id ?? `fragment-${++fragCount}`;
        if (step.id) fragCount++;
        rows.push({ t: 'open', f: step, key, depth, kind: step.fragment, label: step.label, y: 0 });
        pushSteps(step.steps, depth + 1);
        for (const b of step.branches ?? []) {
          rows.push({ t: 'sep', key, label: b.label ?? (step.fragment === 'alt' ? 'else' : undefined), y: 0 });
          pushSteps(b.steps, depth + 1);
        }
        rows.push({ t: 'close', key, y: 0 });
      } else if (isSeqHighlight(step)) {
        const key = step.id ?? `highlight-${++fragCount}`;
        if (step.id) fragCount++;
        rows.push({ t: 'open', f: { highlight: true, label: typeof step.highlight === 'string' ? step.highlight : undefined, color: step.color, id: step.id }, key, depth, kind: 'highlight', label: typeof step.highlight === 'string' ? step.highlight : undefined, y: 0 });
        pushSteps(step.steps, depth + 1);
        rows.push({ t: 'close', key, y: 0 });
      } else if (isSeqPhase(step)) {
        const index = phaseCount++;
        rows.push({ t: 'phase', label: step.phase, index, color: step.color, y: 0 });
        pushSteps(step.steps, depth);
        rows.push({ t: 'phaseEnd', index, y: 0 });
      } else if (isSeqDivider(step)) {
        rows.push({ t: 'divider', text: step.divider, y: 0 });
      } else if (isSeqDelay(step)) {
        rows.push({ t: 'delay', text: step.delay, y: 0, h: 0 });
      }
    }
  };
  pushSteps(body.steps, 0);
  const msgs = rows.filter((r): r is MsgRow => r.t === 'msg');

  // ---- Headers ---------------------------------------------------------------------
  const boxed = style.participants === 'card' || style.participants === 'pill';
  const headerMax = HEADER_MAX[alt];
  const headers: Header[] = body.participants.map((p, i) => {
    const icon = p.icon ?? KIND_ICON[p.kind ?? 'system'];
    const iconW = icon ? 26 : 0;
    const padX = style.participants === 'pill' ? 20 : boxed ? 14 : 4;
    const natural = Math.max(textWidth(ctx, p.label, headSt), p.description ? textWidth(ctx, p.description, descSt) : 0);
    const textW = Math.min(natural, headerMax - 2 * padX - iconW);
    const lines = wrap(ctx, p.label, textW + 0.5, headSt);
    const desc = p.description ? wrap(ctx, p.description, textW + 0.5, descSt) : [];
    const used = Math.max(...lines.map((l) => textWidth(ctx, l, headSt)), ...desc.map((l) => textWidth(ctx, l, descSt)));
    const w = Math.max(boxed ? 96 : 72, Math.ceil(used + 2 * padX + iconW));
    return { p, i, w: snapUp(w, 4), lines, desc, icon };
  });
  const badgeH = (p: SequenceParticipant) => (p.status && p.status !== 'current' ? 16 + 4 : 0);
  const headTextH = (h: Header) => h.lines.length * lh(ctx, headSt.size) + (h.desc.length ? 2 + h.desc.length * lh(ctx, descSt.size) : 0);
  const HH = snapUp(Math.max(...headers.map((h) => headTextH(h) + badgeH(h.p))) + (boxed ? 20 : style.participants === 'underline' ? 14 : 6), 4);
  const created = new Map<string, MsgRow>();
  for (const r of msgs) if (r.m.create && !created.has(r.m.to)) created.set(r.m.to, r);

  // ---- Columns: the gap between neighbouring lifelines ------------------------------
  const groupOf = new Map<number, number>();
  (body.groups ?? []).forEach((g, gi) => g.participants.forEach((id) => groupOf.set(pIndex.get(id) ?? -1, gi)));
  const gaps: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    let g = (headers[i].w + headers[i + 1].w) / 2 + HEADER_GAP;
    const ga = groupOf.get(i);
    const gb = groupOf.get(i + 1);
    if (ga !== gb) g += (ga !== undefined ? GROUP_PAD : 0) + (gb !== undefined ? GROUP_PAD : 0) + 8;
    gaps.push(g);
  }
  type Need = { lo: number; hi: number; w: number };
  const needs: Need[] = [];
  const barRoom = res.activations === 'none' ? 0 : BAR_W;
  const badgeRoom = res.numbering === 'badge' ? BADGE + 4 : 0;
  // Right-hand overhang past the last lifeline, and left-hand past the first.
  let overR = 0;
  let overL = 0;
  for (const r of msgs) {
    const a = pIndex.get(r.m.from) ?? 0;
    const b = pIndex.get(r.m.to) ?? 0;
    if (r.self) {
      const need = barRoom / 2 + LOOP_W + 8 + r.labelW + LABEL_PAD;
      if (a < N - 1) needs.push({ lo: a, hi: a + 1, w: need + headers[a + 1].w * 0 + 8 });
      else overR = Math.max(overR, need);
      continue;
    }
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    needs.push({ lo, hi, w: r.labelW + 2 * LABEL_PAD + barRoom + badgeRoom });
    // A created participant's header sits on the arrow's end: leave room for half of it.
    if (r.m.create) needs.push({ lo, hi, w: headers[b].w / 2 + 48 + badgeRoom });
  }
  for (const r of rows) {
    if (r.t !== 'note') continue;
    const pos = r.s.position ?? 'over';
    const [a, b] = [r.over[0], r.over[r.over.length - 1]];
    if (r.over.length === 2) needs.push({ lo: a, hi: b, w: r.w - 48 });
    else if (pos === 'right') {
      if (a < N - 1) needs.push({ lo: a, hi: a + 1, w: r.w + 16 + barRoom });
      else overR = Math.max(overR, r.w + 16);
    } else if (pos === 'left') {
      if (a > 0) needs.push({ lo: a - 1, hi: a, w: r.w + 16 + barRoom });
      else overL = Math.max(overL, r.w + 16);
    }
  }
  needs.sort((x, y) => x.hi - x.lo - (y.hi - y.lo));
  for (const nd of needs) {
    let have = 0;
    for (let i = nd.lo; i < nd.hi; i++) have += gaps[i];
    if (have < nd.w) {
      const add = (nd.w - have) / (nd.hi - nd.lo);
      for (let i = nd.lo; i < nd.hi; i++) gaps[i] += add;
    }
  }
  for (let i = 0; i < gaps.length; i++) gaps[i] = Math.ceil(gaps[i]);

  // ---- Side columns: phases on the left, timing brackets on the right -----------------
  const phases = rows.filter((r): r is PhaseOpen => r.t === 'phase');
  const gutter = phases.length
    ? clamp(snapUp(Math.max(...phases.flatMap((p) => p.label.split(/\s+/).map((w) => textWidth(ctx, w, phaseSt)))) + 28), 96, 152)
    : 0;
  const timings = body.timings ?? [];
  const msgById = new Map(msgs.map((m) => [m.id, m]));
  const timingCols = assignTimingColumns(timings, msgById);
  const timingW = timings.length
    ? Math.max(...timings.map((t) => textWidth(ctx, t.label, timingSt))) + 28 + (Math.max(0, ...timingCols) * 20)
    : 0;

  // ---- Fit the width ------------------------------------------------------------------
  const headL = headers[0].w / 2;
  const headR = headers[N - 1].w / 2;
  const groupL = groupOf.has(0) ? GROUP_PAD : 0;
  const groupR = groupOf.has(N - 1) ? GROUP_PAD : 0;
  const nestMax = maxDepth(rows);
  const frameOver = rows.some((r) => r.t === 'open') ? FRAME_PAD + 2 + nestMax * FRAME_NEST : 0;
  // Measure what overhangs the outer lifelines (frames, notes, self-messages) at the natural spacing;
  // spreading the gaps later only moves inner lifelines apart, so the overhang stays the same.
  const xsRel = [0];
  for (let i = 0; i < N - 1; i++) xsRel.push(xsRel[i] + gaps[i]);
  const pre = measureX(xsRel);
  const preMin = Math.min(0, ...pre.frames.map((f) => f.x), ...[...pre.rowSpan.values()].map((v) => v[0]));
  const preMax = Math.max(xsRel[N - 1], ...pre.frames.map((f) => f.x + f.w), ...[...pre.rowSpan.values()].map((v) => v[1]));
  const leftReach = Math.ceil(Math.max(headL + groupL, overL, frameOver + barRoom / 2, -preMin));
  const rightReach = Math.ceil(Math.max(headR + groupR, overR + frameOver, frameOver + barRoom / 2, preMax - xsRel[N - 1]));
  const span = () => gaps.reduce((a, b) => a + b, 0);
  const sideW = (gutter ? gutter + 16 : 0) + (timingW ? timingW + 16 : 0);
  let natural = leftReach + span() + rightReach + sideW;
  if (ctx.auto) {
    // A growing canvas widens before the frame is placed, so the footer and callout follow it.
    const calloutCol = ctx.spec.callout?.anchor ? Math.min(240, Math.max(200, snap(ctx.W * 0.18))) + 24 : 0;
    const avail = ctx.W - 2 * ctx.margin - calloutCol;
    if (natural > avail) ctx.W = snapUp(natural + 2 * ctx.margin + calloutCol);
  }
  const frame = beginFrame(ctx, { calloutSide: 'right', legend: legendFor(ctx, body) });
  const C = frame.content;
  if (natural > C.w + 0.5) {
    fitIssue(
      ctx,
      'ds-content',
      `the ${N} participants and their message labels need ${Math.ceil(natural)} units of width but ${Math.floor(C.w)} are free. Shorten the longest message labels, drop participants, or set "canvas": { "aspect": "auto" }.`,
    );
  } else if (N > 1) {
    // Spread spare width across the gaps (to a comfortable maximum) and centre the result.
    const spare = C.w - natural;
    const room = gaps.map((g) => Math.max(0, MAX_GAP - g));
    const totalRoom = room.reduce((a, b) => a + b, 0);
    if (totalRoom > 0) {
      const k = Math.min(1, spare / totalRoom);
      for (let i = 0; i < gaps.length; i++) gaps[i] = Math.floor(gaps[i] + room[i] * k);
    }
    natural = leftReach + span() + rightReach + sideW;
  }
  const diagramW = leftReach + span() + rightReach;
  const x0 = Math.round(C.x + (gutter ? gutter + 16 : 0) + Math.max(0, (C.w - natural) / 2));
  const xs: number[] = [];
  let acc = x0 + leftReach;
  for (let i = 0; i < N; i++) {
    xs.push(Math.round(acc));
    if (i < N - 1) acc += gaps[i];
  }
  const diagramL = x0;
  const diagramR = x0 + diagramW;
  const bandL = C.x;
  const bandR = C.x + C.w;

  // ---- Vertical pass ------------------------------------------------------------------
  // Rows stack at the chosen density; on a fixed canvas they tighten (compact, then tight) before
  // the layout reports that it does not fit.
  const spacings = [
    compact ? { gap: 12, loop: 16, head: 16, frame: 10 } : { gap: 18, loop: 20, head: 20, frame: 12 },
    { gap: 12, loop: 16, head: 16, frame: 10 },
    { gap: 8, loop: 14, head: 12, frame: 8 },
  ];
  let loopH = spacings[0].loop;
  const headTop = C.y + (body.groups?.length ? GROUP_HEAD : 0);
  let bodyTop = 0;
  const place = (sp: (typeof spacings)[number]): number => {
    let y = headTop + HH + sp.head;
    bodyTop = y;
    for (const r of rows) {
      switch (r.t) {
        case 'msg': {
          r.top = y;
          if (r.self) {
            const lift = Math.max(0, (r.labelH - sp.loop) / 2);
            r.y = y + lift;
            y = r.y + sp.loop + Math.max(0, r.labelH - sp.loop - lift) + sp.gap;
          } else if (r.m.create) {
            r.y = y + Math.max(r.labelH + 6, HH / 2);
            y = r.y + HH / 2 + sp.gap;
          } else {
            r.y = y + r.labelH + 6;
            y = r.y + sp.gap + (r.m.destroy ? 6 : 0);
          }
          break;
        }
        case 'note':
          r.y = y + 2;
          y = r.y + r.h + sp.gap;
          break;
        case 'open':
          y += 4;
          r.y = y;
          y += (r.kind === 'highlight' ? (r.label ? lh(ctx, tagSt.size) + 8 : 6) : TAG_H) + sp.frame;
          break;
        case 'sep':
          y += 2;
          r.y = y;
          y += (r.label ? lh(ctx, guardSt.size) + 4 : 0) + sp.frame;
          break;
        case 'close':
          y += 2;
          r.y = y;
          y += sp.frame - 2;
          break;
        case 'phase':
          r.y = y - 8;
          y += 8;
          break;
        case 'phaseEnd':
          y += 4;
          r.y = y;
          y += 12;
          break;
        case 'divider':
          y += 4;
          r.y = y + 12;
          y += 32;
          break;
        case 'delay':
          r.y = y;
          r.h = sp.gap > 10 ? 44 : 36;
          y += r.h + 4;
          break;
      }
    }
    return Math.max(y, bodyTop + 24) + 8;
  };
  const tail = (style.mirror ? HH : 0) + (body.groups?.length ? GROUP_PAD : 0);
  let y = 0;
  // A growing canvas keeps the chosen density; a growing figure (an exhibit panel or a deck page
  // that will be scaled down) uses compact rows so it shrinks less.
  const tries = ctx.auto ? (ctx.figure ? spacings.slice(1, 2) : spacings.slice(0, 1)) : spacings;
  for (const sp of tries) {
    loopH = sp.loop;
    y = place(sp);
    if (y + tail <= C.y + C.h + 0.5) {
      // Spare height on a fixed canvas: open the rows up a little rather than leave the bottom empty.
      const spare = C.y + C.h - (y + tail);
      const gaps = rows.filter((r) => r.t === 'msg' || r.t === 'note').length;
      if (!ctx.auto && sp === spacings[0] && spare > 8 && gaps) {
        const add = Math.floor(Math.min((spare - 8) / gaps, 22));
        if (add >= 2) {
          y = place({ ...sp, gap: sp.gap + add, head: sp.head + Math.min(add, 8) });
          if (y + tail > C.y + C.h + 0.5) y = place(sp);
        }
      }
      break;
    }
  }
  if (!ctx.auto && y + tail > C.y + C.h + 0.5 && !ctx.issues.some((i) => i.id === 'ds-content')) {
    fitIssue(
      ctx,
      'ds-content',
      `the ${msgs.length} messages need ${Math.ceil(y + tail - C.y)} units of height but the ${ctx.spec.canvas?.aspect ?? '16:9'} canvas leaves ${Math.floor(C.h)}, even with rows tightened. Sequence diagrams run down the page: set "canvas": { "aspect": "auto" } (or "A4-portrait"), drop the subtitle or legend, move detail into fewer messages, or split the flow across two slides.`,
    );
  }
  const lifeEnd = Math.round(y);
  const mirrorTop = lifeEnd;
  const bottom = style.mirror ? mirrorTop + HH : lifeEnd;
  const groupBottom = bottom + (body.groups?.length ? GROUP_PAD : 0);

  // ---- Activations ----------------------------------------------------------------------
  interface Bar {
    p: number;
    level: number;
    y0: number;
    y1: number;
    color?: Token;
  }
  const bars: Bar[] = [];
  const open = new Map<number, Bar[]>();
  const lastUse = new Map<number, number>();
  const levelAt = (p: number, yy: number): number => {
    let lvl = -1;
    for (const b of bars) if (b.p === p && b.y0 <= yy + 0.01 && b.y1 >= yy - 0.01) lvl = Math.max(lvl, b.level);
    for (const b of open.get(p) ?? []) if (b.y0 <= yy + 0.01) lvl = Math.max(lvl, b.level);
    return lvl;
  };
  const startBar = (p: number, yy: number) => {
    const stack = open.get(p) ?? [];
    stack.push({ p, level: stack.length, y0: yy, y1: yy });
    open.set(p, stack);
  };
  const endBar = (p: number, yy: number) => {
    const stack = open.get(p);
    const b = stack?.pop();
    if (b) bars.push({ ...b, y1: Math.max(yy, b.y0 + 12) });
  };
  // Per message: the sender's and receiver's bar level at the line, for the arrow ends.
  const ends = new Map<MsgRow, { fromLvl: number; toLvl: number }>();
  for (const r of rows) {
    if (r.t === 'note') for (const o of r.over) lastUse.set(o, r.y + r.h);
    if (r.t !== 'msg') continue;
    const a = pIndex.get(r.m.from) ?? 0;
    const b = pIndex.get(r.m.to) ?? 0;
    lastUse.set(a, r.y);
    lastUse.set(b, r.y + (r.self ? loopH : 0));
    const kind = r.m.kind ?? 'sync';
    const auto = res.activations === 'auto';
    const wantOpen = res.activations !== 'none' && !r.self && (r.m.activate ?? (auto && kind === 'sync'));
    const wantClose = res.activations !== 'none' && (r.m.deactivate ?? (auto && kind === 'return' && !r.self));
    const fromLvl = levelAt(a, r.y);
    if (wantOpen) startBar(b, r.y);
    const toLvl = levelAt(b, r.y);
    ends.set(r, { fromLvl, toLvl });
    if (wantClose) endBar(a, r.y);
  }
  for (const [p, stack] of open) {
    while (stack.length) {
      const b = stack.pop()!;
      bars.push({ ...b, y1: Math.max(b.y0 + 12, Math.min(lifeEnd - 8, (lastUse.get(p) ?? b.y0) + 12)) });
    }
  }
  const barEdge = (p: number, lvl: number, side: 1 | -1) => (lvl < 0 ? xs[p] : xs[p] + lvl * BAR_STEP + (side * BAR_W) / 2);

  // ---- Horizontal extents of each row and fragment frame, for lifeline positions xs ----
  function measureX(xs: number[]) {
  const rowSpan = new Map<Row, [number, number]>();
  for (const r of rows) {
    if (r.t === 'msg') {
      const a = pIndex.get(r.m.from) ?? 0;
      const b = pIndex.get(r.m.to) ?? 0;
      if (r.self) rowSpan.set(r, [xs[a] - barRoom, xs[a] + barRoom / 2 + LOOP_W + 8 + r.labelW]);
      else {
        let lo = Math.min(xs[a], xs[b]) - barRoom;
        let hi = Math.max(xs[a], xs[b]) + barRoom;
        if (r.m.create) {
          lo = Math.min(lo, xs[b] - headers[b].w / 2);
          hi = Math.max(hi, xs[b] + headers[b].w / 2);
        }
        rowSpan.set(r, [lo, hi]);
      }
    } else if (r.t === 'note') {
      const box = noteBox(r, xs, barRoom);
      r.box = box;
      rowSpan.set(r, [box.x, box.x + box.w]);
    }
  }
  const frames: FrameGeom[] = [];
  {
    const stack: { open: FragOpen; lo: number; hi: number; seps: FragSep[]; inner: number }[] = [];
    for (const r of rows) {
      if (r.t === 'open') stack.push({ open: r, lo: Infinity, hi: -Infinity, seps: [], inner: 0 });
      else if (r.t === 'sep') stack[stack.length - 1]?.seps.push(r);
      else if (r.t === 'close') {
        const f = stack.pop()!;
        const pad = FRAME_PAD + f.inner * FRAME_NEST;
        let lo = Number.isFinite(f.lo) ? f.lo - pad : xs[0] - pad;
        let hi = Number.isFinite(f.hi) ? f.hi + pad : xs[0] + pad;
        const tagW = f.open.kind === 'highlight' ? 0 : fragTagWidth(ctx, f.open, tagSt) + 8 + (f.open.label ? textWidth(ctx, guardText(f.open), guardSt) + 12 : 0);
        const sepW = Math.max(0, ...f.seps.map((x) => (x.label ? textWidth(ctx, guardLabel(f.open.kind, x.label), guardSt) + 24 : 0)));
        const capW = f.open.kind === 'highlight' && f.open.label ? textWidth(ctx, f.open.label.toUpperCase(), tagSt) + f.open.label.length * 0.6 + 24 : 0;
        hi = Math.max(hi, lo + tagW + 8, lo + sepW, lo + capW);
        lo = Math.round(lo);
        hi = Math.round(hi);
        frames.push({ open: f.open, close: r, x: lo, w: hi - lo, y: 0, h: 0, seps: f.seps, depth: f.open.depth });
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.lo = Math.min(parent.lo, lo);
          parent.hi = Math.max(parent.hi, hi);
          parent.inner = Math.max(parent.inner, f.inner + 1);
        }
      } else {
        const sp = rowSpan.get(r);
        if (sp)
          for (const f of stack) {
            f.lo = Math.min(f.lo, sp[0]);
            f.hi = Math.max(f.hi, sp[1]);
          }
      }
    }
  }
  frames.sort((a, b) => a.depth - b.depth);
  return { rowSpan, frames };
  }
  const { rowSpan, frames } = measureX(xs);
  for (const f of frames) {
    f.y = f.open.y;
    f.h = f.close.y - f.open.y;
  }

  // Everything must stay inside the content box; report rather than draw off the page.
  const minX = Math.min(...frames.map((f) => f.x), ...[...rowSpan.values()].map((v) => v[0]), xs[0] - headL - groupL);
  const maxX = Math.max(...frames.map((f) => f.x + f.w), ...[...rowSpan.values()].map((v) => v[1]), xs[N - 1] + headR + groupR);
  if (!ctx.issues.some((i) => i.id === 'ds-content') && (minX < C.x + (gutter ? gutter + 16 : 0) - 0.5 || maxX > C.x + C.w - (timingW ? timingW + 16 : 0) + 0.5)) {
    fitIssue(ctx, 'ds-content', `the diagram needs more width than the canvas gives. Shorten message labels or notes, drop participants, or set "canvas": { "aspect": "auto" }.`);
  }

  // ---- Colours -----------------------------------------------------------------------------
  const pColor = (p: SequenceParticipant): Token | undefined => colorToken(p.color) ?? emphasisColor(p.emphasis);
  const bgRegions: { box: Box; fill: Token }[] = [];
  const bgAt = (x: number, yy: number): Token => {
    for (let i = bgRegions.length - 1; i >= 0; i--) {
      const b = bgRegions[i].box;
      if (x >= b.x && x <= b.x + b.w && yy >= b.y && yy <= b.y + b.h) return bgRegions[i].fill;
    }
    return ctx.background ?? 'background';
  };
  const region = (box: Box, fill: Token) => {
    if (fill !== 'none') bgRegions.push({ box, fill });
  };
  // Tints are mixed over what sits underneath, so they stay opaque and text contrast is exact.
  const tintOver = (c: Token, pct: number, x: number, yy: number): Token => {
    const under = bgAt(x, yy);
    return `${c}@${pct}:${under}`;
  };

  // ---- Draw: phase bands --------------------------------------------------------------------------
  const phaseBox = new Map<number, Box>();
  for (const r of rows) {
    if (r.t !== 'phase') continue;
    const end = rows.find((x): x is PhaseClose => x.t === 'phaseEnd' && x.index === r.index)!;
    phaseBox.set(r.index, { x: bandL, y: r.y, w: bandR - bandL, h: end.y - r.y });
  }
  for (const r of phases) {
    const box = phaseBox.get(r.index)!;
    const c = colorToken(r.color);
    const banded = style.shading !== 'none';
    const fill: Token = c ? `${c}@${banded ? 8 : 5}` : banded && r.index % 2 === 0 ? 'surface' : 'none';
    addShape(ctx, {
      id: `phase-${r.index + 1}`,
      role: 'phase',
      shape: 'rect',
      ...box,
      radius: Math.min(4, theme.shape.radius),
      paint: { fill, stroke: 'none', strokeWidth: 0 },
      box: false,
      container: true,
      meta: { kind: 'phase', label: r.label },
    });
    region(box, fill === 'none' ? 'background' : fill);
    if (r.index > 0 && fill === 'none' && style.shading === 'none') {
      ctx.els.push({ kind: 'line', id: `phase-${r.index + 1}--rule`, role: 'decoration', points: [{ x: bandL, y: box.y }, { x: bandR, y: box.y }], paint: { fill: 'none', stroke: 'line', strokeWidth: 1 } });
    }
    // Accent tick and label in the gutter.
    ctx.els.push({
      kind: 'line',
      id: `phase-${r.index + 1}--tick`,
      role: 'decoration',
      points: [{ x: bandL + 1.5, y: box.y + 10 }, { x: bandL + 1.5, y: box.y + box.h - 10 }],
      paint: { fill: 'none', stroke: c ?? 'accent', strokeWidth: 3 },
    });
    const lines = wrap(ctx, r.label, gutter - 24, phaseSt);
    addText(ctx, { id: `phase-${r.index + 1}--label`, role: 'header', x: bandL + 14, y: box.y + 10, w: gutter - 24, lines, ...phaseSt, anchor: 'start', color: textOn(c ?? 'ink', fill === 'none' ? bgAt(bandL + 14, box.y + 12) : fill), slot: 'heading' });
  }

  // ---- Draw: groups ----------------------------------------------------------------------------
  (body.groups ?? []).forEach((g) => {
    const idx = g.participants.map((id) => pIndex.get(id) ?? 0).sort((a, b) => a - b);
    const a = idx[0];
    const b = idx[idx.length - 1];
    const gx = Math.round(xs[a] - headers[a].w / 2 - GROUP_PAD);
    const gw = Math.round(xs[b] + headers[b].w / 2 + GROUP_PAD) - gx;
    const c = colorToken(g.color) ?? emphasisColor(g.emphasis);
    // Over phase bands a group is an outline, so the bands still read across it.
    const fill: Token = phases.length ? 'none' : c ? `${c}@7` : 'surface';
    const box = { x: gx, y: C.y, w: gw, h: groupBottom - C.y };
    addShape(ctx, {
      id: `group-${g.id}`,
      role: 'group',
      shape: 'rect',
      ...box,
      radius: theme.shape.radius + 2,
      paint: { fill, stroke: c ? `${c}@45` : 'line', strokeWidth: 1, dash: g.emphasis === 'muted' ? 'dashed' : 'solid' },
      box: false,
      container: true,
      meta: { specId: g.id, kind: 'group', label: g.label, emphasis: g.emphasis ?? 'normal' },
    });
    region(box, fill);
    const labelBg = fill === 'none' ? bgAt(gx + GROUP_PAD, C.y + 8) : fill;
    ctx.anchors.set(g.id, box);
    const label = g.label.toUpperCase();
    const maxW = gw - 2 * GROUP_PAD;
    const lines = wrap(ctx, label, maxW, tagSt).slice(0, 1);
    addText(ctx, { id: `group-${g.id}--label`, role: 'header', x: gx + GROUP_PAD, y: C.y + 7, w: maxW, lines, ...tagSt, anchor: 'start', color: textOn(c ?? 'inkMuted', labelBg), letterSpacing: 0.6, slot: 'heading' });
  });

  // ---- Draw: zebra rows (banded shading) ------------------------------------------------------
  if (style.shading === 'banded') {
    msgs.forEach((r, i) => {
      if (i % 2 === 1) return;
      const yy = Math.round(r.top - 4);
      const hh = Math.round(r.y + (r.self ? loopH + 4 : 6) - yy);
      const box = { x: diagramL, y: yy, w: diagramR - diagramL, h: hh };
      const fill = tintOver('ink', 3, box.x + 1, box.y + 1);
      addShape(ctx, { id: `${r.id}--band`, role: 'decoration', shape: 'rect', ...box, radius: 2, paint: { fill, stroke: 'none', strokeWidth: 0 }, box: false });
      region(box, fill);
    });
  }

  // ---- Draw: fragment fills (outer first) ------------------------------------------------------
  const frameLook = (f: FrameGeom) => {
    const c = f.open.kind === 'highlight' ? colorToken((f.open.f as { color?: string }).color) ?? 'highlight' : colorToken((f.open.f as SequenceFragment).color) ?? emphasisColor((f.open.f as SequenceFragment).emphasis);
    return c;
  };
  for (const f of frames) {
    const c = frameLook(f);
    const box = { x: f.x, y: f.y, w: f.w, h: f.h };
    const hl = f.open.kind === 'highlight';
    const fill: Token = hl ? tintOver(c!, 10, f.x + 1, f.y + 1) : style.shading === 'none' ? 'none' : tintOver(c ?? 'ink', c ? 5 : 2.5, f.x + 1, f.y + 1);
    const muted = !hl && (f.open.f as SequenceFragment).emphasis === 'muted';
    addShape(ctx, {
      id: f.open.key,
      role: 'group',
      shape: 'rect',
      ...box,
      radius: Math.min(4, theme.shape.radius),
      paint: hl ? { fill, stroke: 'none', strokeWidth: 0 } : { fill, stroke: c ?? (muted ? 'line' : 'lineStrong'), strokeWidth: c ? theme.shape.stroke : 1, dash: muted ? 'dashed' : 'solid' },
      box: false,
      container: true,
      meta: { specId: (f.open.f as { id?: string }).id, kind: f.open.kind, label: f.open.label, emphasis: hl ? 'normal' : (f.open.f as SequenceFragment).emphasis ?? 'normal' },
    });
    region(box, fill === 'none' ? bgAt(f.x + 1, f.y + 1) : fill);
    if ((f.open.f as { id?: string }).id) ctx.anchors.set((f.open.f as { id: string }).id, box);
  }

  // ---- Draw: delay bands (time passes) ----------------------------------------------------
  rows.forEach((r) => {
    if (r.t !== 'delay') return;
    const k = rows.filter((x) => x.t === 'delay').indexOf(r) + 1;
    const box = { x: diagramL, y: Math.round(r.y + 4), w: diagramR - diagramL, h: Math.round(r.h - 8) };
    const fill = tintOver('ink', 4, box.x + 1, box.y + 1);
    addShape(ctx, { id: `delay-${k}--band`, role: 'decoration', shape: 'rect', ...box, radius: 3, paint: { fill, stroke: 'none', strokeWidth: 0 }, box: false });
    region(box, fill);
  });

  // ---- Draw: lifelines --------------------------------------------------------------------------
  const lifeDash = style.lifeline;
  const delays = rows.filter((r): r is Delay => r.t === 'delay');
  const destroyAt = new Map<number, number>();
  for (const r of msgs) {
    if (!r.m.destroy) continue;
    const p = pIndex.get(r.m.destroy === 'from' ? r.m.from : r.m.to) ?? 0;
    destroyAt.set(p, r.m.destroy === 'to' ? r.y : r.y + 14);
  }
  body.participants.forEach((p, i) => {
    const cr = created.get(p.id);
    const startY = cr ? Math.round(cr.y + HH / 2) : headTop + HH;
    const endY = destroyAt.get(i) ?? (style.mirror ? mirrorTop : lifeEnd);
    const muted = p.emphasis === 'muted';
    const stroke: Token = muted ? 'line@60' : 'line';
    // Split around delays: dotted through the gap.
    let from = startY;
    let k = 0;
    const seg = (y0: number, y1: number, dash: 'solid' | 'dashed' | 'dotted', id: string) => {
      if (y1 - y0 < 1) return;
      ctx.els.push({ kind: 'line', id, role: 'decoration', points: [{ x: xs[i], y: y0 }, { x: xs[i], y: y1 }], paint: { fill: 'none', stroke, strokeWidth: 1, dash } });
    };
    for (const d of delays) {
      if (d.y + d.h <= from || d.y >= endY) continue;
      seg(from, d.y, lifeDash, `${p.id}--lifeline${k ? `-${k + 1}` : ''}`);
      k++;
      seg(Math.max(from, d.y + 6), Math.min(endY, d.y + d.h - 6), 'dotted', `${p.id}--lifeline-gap-${k}`);
      from = d.y + d.h;
    }
    seg(from, endY, lifeDash, `${p.id}--lifeline${k ? `-${k + 1}` : ''}`);
    if (destroyAt.has(i)) {
      const yy = destroyAt.get(i)!;
      const d = 7;
      for (const [k2, pts] of [
        [1, [{ x: xs[i] - d, y: yy - d }, { x: xs[i] + d, y: yy + d }]],
        [2, [{ x: xs[i] - d, y: yy + d }, { x: xs[i] + d, y: yy - d }]],
      ] as const)
        ctx.els.push({ kind: 'line', id: `${p.id}--destroy-${k2}`, role: 'marker', points: [...pts], paint: { fill: 'none', stroke: 'lineStrong', strokeWidth: 1.75 } });
    }
  });

  // ---- Draw: activation bars -----------------------------------------------------------------------
  bars.sort((a, b) => a.level - b.level || a.y0 - b.y0);
  const barCount = new Map<number, number>();
  for (const b of bars) {
    const p = body.participants[b.p];
    const c = pColor(p);
    const k = (barCount.get(b.p) ?? 0) + 1;
    barCount.set(b.p, k);
    const x = xs[b.p] + b.level * BAR_STEP - BAR_W / 2;
    const yy = Math.round(b.y0 - 4);
    const fill = tintOver(c ?? 'ink', c ? 18 : 8, x + 1, yy + 1);
    addShape(ctx, {
      id: `${p.id}--activation-${k}`,
      role: 'marker',
      shape: 'rect',
      x,
      y: yy,
      w: BAR_W,
      h: Math.round(b.y1 + 4) - yy,
      radius: 1.5,
      paint: { fill, stroke: c ?? 'lineStrong', strokeWidth: 1 },
      box: false,
    });
  }

  // ---- Draw: headers --------------------------------------------------------------------------------
  const headerBoxes = new Map<number, Box>();
  const drawHeader = (h: Header, cy: number, suffix: string, anchor: boolean) => {
    const p = h.p;
    const c = pColor(p);
    const muted = p.emphasis === 'muted';
    const box = { x: Math.round(xs[h.i] - h.w / 2), y: Math.round(cy - HH / 2), w: h.w, h: HH };
    const id = `${p.id}${suffix}`;
    const under = bgAt(xs[h.i], box.y + 2);
    const shape: ShapeKind = p.kind === 'database' && boxed ? 'cylinder' : style.participants === 'pill' ? 'pill' : 'rect';
    const onTint = groupOf.has(h.i) && !phases.length;
    let fill: Token = boxed ? (onTint ? 'background' : 'surface') : 'none';
    if (c && boxed) fill = `${c}@${p.emphasis === 'accent' && theme.style.accentFill === 'solid' ? 100 : 12}:${onTint ? 'background' : 'surface'}`;
    if (muted && boxed) fill = 'background';
    const stroke: Token = !boxed ? 'none' : c ?? (muted ? 'line' : 'lineStrong');
    const sw = p.emphasis === 'accent' ? theme.shape.strokeStrong : theme.shape.stroke;
    const textBg = fill === 'none' ? under : fill;
    addShape(ctx, {
      id,
      role: 'node',
      shape,
      ...box,
      radius: shape === 'rect' ? theme.shape.radius : undefined,
      paint: { fill: boxed ? fill : 'none', stroke, strokeWidth: boxed ? sw : 0, dash: p.kind === 'external' || p.status === 'retired' ? 'dashed' : 'solid', shadow: boxed && style.shadow },
      obstacle: false,
      box: boxed,
      inset: { l: 4, r: 4, t: 2, b: 2 },
      align: suffix ? undefined : { group: created.has(p.id) ? `created-${p.id}` : 'sequence-headers', axis: 'row' },
      group: `g-${id}`,
      meta: anchor ? { specId: p.id, kind: p.kind ?? 'participant', label: p.label, description: p.description, emphasis: p.emphasis ?? 'normal', status: p.status } : undefined,
    });
    if (anchor) ctx.anchors.set(p.id, box);
    headerBoxes.set(h.i, box);
    if (!boxed && style.participants === 'underline') {
      ctx.els.push({ kind: 'line', id: `${id}--rule`, role: 'decoration', points: [{ x: box.x + 4, y: box.y + box.h - 2 }, { x: box.x + box.w - 4, y: box.y + box.h - 2 }], paint: { fill: 'none', stroke: c ?? 'accent', strokeWidth: 2.5 }, group: `g-${id}` });
    }
    const bh = badgeH(p);
    // Every header reserves the badge row when any has one, so the labels line up.
    const bhAll = Math.max(...headers.map((x) => badgeH(x.p)));
    const textH = headTextH(h);
    const iconW = h.icon ? 26 : 0;
    const blockW = Math.max(...h.lines.map((l) => textWidth(ctx, l, headSt)), ...h.desc.map((l) => textWidth(ctx, l, descSt)));
    const left = xs[h.i] - (blockW + iconW) / 2;
    const cyl = shape === 'cylinder' ? 4 : 0;
    const maxTextH = Math.max(...headers.map(headTextH));
    let ty = box.y + cyl + bhAll + (box.h - cyl - bhAll - maxTextH - (style.participants === 'underline' ? 6 : 0)) / 2 + (maxTextH - textH) / 2;
    if (h.icon) {
      ctx.els.push({ kind: 'icon', id: `${id}--icon`, role: 'icon', name: h.icon, x: Math.round(left), y: Math.round(ty + (Math.min(textH, 40) - 20) / 2), size: 20, color: textOn(c ?? 'accent', textBg), group: `g-${id}` });
    }
    const tx = h.icon ? left + iconW : xs[h.i];
    const anchorT = h.icon ? 'start' : 'middle';
    const ink = muted ? textOn('inkMuted', textBg) : textOn('ink', textBg);
    addText(ctx, { id: `${id}--label`, role: 'label', x: tx, y: ty, w: blockW, lines: h.lines, ...headSt, anchor: anchorT, color: ink, box: boxed ? id : undefined, group: `g-${id}`, slot: 'label' });
    ty += h.lines.length * lh(ctx, headSt.size);
    if (h.desc.length) {
      addText(ctx, { id: `${id}--description`, role: 'label', x: tx, y: ty + 2, w: blockW, lines: h.desc, ...descSt, anchor: anchorT, color: textOn('inkMuted', textBg), box: boxed ? id : undefined, group: `g-${id}`, slot: 'description' });
    }
    if (bh) {
      const label = STATUS_LABEL[p.status!];
      const bw = Math.ceil(textWidth(ctx, label, st.captionStrong) + 14);
      const look = badgeLook(theme, p.status!, textBg);
      const bx = Math.round(xs[h.i] - bw / 2);
      const by = box.y + cyl + 6;
      addShape(ctx, { id: `${id}--badge`, role: 'badge', shape: 'pill', x: bx, y: by, w: bw, h: 16, paint: { ...look.paint, strokeWidth: 1 }, inset: { l: 6, r: 6, t: 0, b: 0 }, group: `g-${id}` });
      addText(ctx, { id: `${id}--badge-text`, role: 'label', x: bx + bw / 2, y: by, w: bw - 12, lines: [label], ...st.captionStrong, lineHeight: 16, anchor: 'middle', color: look.ink, box: `${id}--badge`, group: `g-${id}`, slot: 'badge' });
    }
  };
  for (const h of headers) {
    const cr = created.get(h.p.id);
    drawHeader(h, cr ? cr.y : headTop + HH / 2, '', true);
  }

  // ---- Draw: fragment tags and separators -------------------------------------------------------
  for (const f of [...frames].reverse()) {
    if (f.open.kind === 'highlight') {
      if (f.open.label) {
        const c = frameLook(f)!;
        const fill = bgAt(f.x + 2, f.y + 2);
        addText(ctx, { id: `${f.open.key}--label`, role: 'label', x: f.x + 12, y: f.y + 6, lines: [f.open.label.toUpperCase()], ...tagSt, anchor: 'start', color: textOn(c, fill), letterSpacing: 0.6, slot: 'heading' });
      }
      continue;
    }
    const c = frameLook(f);
    const tag = FRAGMENT_TAG[f.open.kind as FragmentKind] || (f.open.label ?? '');
    const tagText = tag.toUpperCase();
    const tw = fragTagWidth(ctx, f.open, tagSt);
    const tagFill: Token = c ?? 'lineStrong';
    addShape(ctx, {
      id: `${f.open.key}--tag`,
      role: 'header',
      shape: 'pentagon',
      x: f.x,
      y: f.y,
      w: tw,
      h: TAG_H,
      depth: 7,
      paint: { fill: tagFill, stroke: 'none', strokeWidth: 0 },
      inset: { l: 8, r: 10, t: 0, b: 0 },
      box: false,
      group: `g-${f.open.key}`,
    });
    addText(ctx, { id: `${f.open.key}--tag-text`, role: 'label', x: f.x + 8, y: f.y, lines: [tagText], ...tagSt, lineHeight: TAG_H, anchor: 'start', color: textOn('accentInk', tagFill), letterSpacing: 0.6, box: `${f.open.key}--tag`, group: `g-${f.open.key}`, slot: 'heading' });
    if (f.open.label && f.open.kind !== 'group') {
      const text = guardText(f.open);
      knockoutText(ctx, `${f.open.key}--guard`, f.x + tw + 8, f.y + (TAG_H - lh(ctx, guardSt.size)) / 2, [text], guardSt, 'start', (x, yy) => bgAt(x, yy), 'inkMuted');
    }
    f.seps.forEach((sp, k) => {
      ctx.els.push({ kind: 'line', id: `${f.open.key}--section-${k + 2}`, role: 'decoration', points: [{ x: f.x, y: sp.y }, { x: f.x + f.w, y: sp.y }], paint: { fill: 'none', stroke: c ?? 'lineStrong', strokeWidth: 1, dash: 'dashed' } });
      if (sp.label) knockoutText(ctx, `${f.open.key}--section-${k + 2}-guard`, f.x + 10, sp.y + 5, [guardLabel(f.open.kind, sp.label)], guardSt, 'start', (x, yy) => bgAt(x, yy), 'inkMuted');
    });
  }

  // ---- Draw: dividers and delays ------------------------------------------------------------------
  for (const r of rows) {
    if (r.t === 'divider') {
      const k = rows.filter((x) => x.t === 'divider').indexOf(r) + 1;
      const yy = Math.round(r.y);
      for (const dy of [-1.5, 1.5])
        ctx.els.push({ kind: 'line', id: `divider-${k}--rule${dy < 0 ? '' : '-2'}`, role: 'decoration', points: [{ x: diagramL, y: yy + dy }, { x: diagramR, y: yy + dy }], paint: { fill: 'none', stroke: 'line', strokeWidth: 1 } });
      const tw = textWidth(ctx, r.text.toUpperCase(), tagSt) + r.text.length * 0.6 + 20;
      const bx = Math.round((diagramL + diagramR) / 2 - tw / 2);
      const pillH = 20;
      const fill: Token = 'surfaceAlt';
      addShape(ctx, { id: `divider-${k}`, role: 'header', shape: 'pill', x: bx, y: yy - pillH / 2, w: Math.ceil(tw), h: pillH, paint: { fill, stroke: 'line', strokeWidth: 1 }, inset: { l: 8, r: 8, t: 0, b: 0 }, box: false });
      addText(ctx, { id: `divider-${k}--label`, role: 'label', x: bx + Math.ceil(tw) / 2, y: yy - pillH / 2, lines: [r.text.toUpperCase()], ...tagSt, lineHeight: pillH, anchor: 'middle', color: textOn('ink', fill), letterSpacing: 0.6, box: `divider-${k}`, slot: 'heading' });
    } else if (r.t === 'delay') {
      const k = delays.indexOf(r) + 1;
      const cst = { ...guardSt, weight: w8.label };
      const tw = textWidth(ctx, r.text, cst);
      const left = Math.round((diagramL + diagramR) / 2 - (tw + 22) / 2);
      const ty = r.y + r.h / 2 - lh(ctx, cst.size) / 2;
      ctx.els.push({ kind: 'icon', id: `delay-${k}--icon`, role: 'icon', name: 'clock', x: left, y: Math.round(r.y + r.h / 2 - 8), size: 16, color: textOn('inkMuted', bgAt(left + 8, r.y + r.h / 2)) });
      knockoutText(ctx, `delay-${k}`, left + 22, ty, [r.text], cst, 'start', (x, yy) => bgAt(x, yy), 'inkMuted');
    }
  }

  // ---- Draw: notes ------------------------------------------------------------------------------------
  for (const r of rows) {
    if (r.t !== 'note') continue;
    const b = { ...r.box!, y: r.y };
    const c = colorToken(r.s.color) ?? emphasisColor(r.s.emphasis);
    const under = bgAt(b.x + 2, b.y + 2);
    const fill: Token = c ? `${c}@12:${under}` : r.s.emphasis === 'muted' ? under : `highlight@10:${under}`;
    addShape(ctx, {
      id: r.id,
      role: 'callout',
      shape: 'note',
      ...b,
      paint: { fill, stroke: c ?? (r.s.emphasis === 'muted' ? 'line' : 'highlight@55'), strokeWidth: 1 },
      inset: { l: 12, r: 12, t: 8, b: 8 },
      obstacle: false,
      meta: { specId: r.s.id, kind: 'note', label: r.s.note, emphasis: r.s.emphasis ?? 'normal' },
    });
    if (r.s.id) ctx.anchors.set(r.s.id, b);
    addText(ctx, { id: `${r.id}--text`, role: 'label', x: b.x + 12, y: b.y + 8, w: b.w - 24, lines: r.lines, ...noteSt, anchor: 'start', color: textOn(r.s.emphasis === 'muted' ? 'inkMuted' : 'ink', fill), box: r.id, slot: 'text' });
  }

  // ---- Draw: messages ------------------------------------------------------------------------------------
  for (const r of msgs) {
    const a = pIndex.get(r.m.from) ?? 0;
    const b = pIndex.get(r.m.to) ?? 0;
    const kind: MessageKind = r.m.kind ?? 'sync';
    const { fromLvl, toLvl } = ends.get(r)!;
    const c = colorToken(r.m.color) ?? (r.m.emphasis === 'accent' ? 'accent' : r.m.emphasis === 'highlight' ? 'highlight' : undefined);
    const quiet = r.m.emphasis === 'muted' || (focus && !c);
    const stroke: Token = c ?? (quiet ? 'line' : 'lineStrong');
    const sw = c && r.m.emphasis === 'accent' ? theme.shape.stroke + 0.5 : theme.shape.stroke;
    const dash = r.m.style ?? (kind === 'return' ? 'dashed' : 'solid');
    const head: 'triangle' | 'open' = style.arrowheads === 'filled' ? 'triangle' : style.arrowheads === 'open' ? 'open' : kind === 'sync' ? 'triangle' : 'open';
    const labelInk: Token = quiet ? 'inkMuted' : kind === 'return' ? 'inkMuted' : 'ink';
    const yy = Math.round(r.y);
    let pts: Point[];
    let startX: number;
    let dir: 1 | -1 = 1;
    if (r.self) {
      const x1 = barEdge(a, fromLvl, 1);
            pts = [
        { x: x1, y: yy },
        { x: x1 + LOOP_W, y: yy },
        { x: x1 + LOOP_W, y: yy + loopH },
        { x: barEdge(a, Math.max(fromLvl, levelAt(a, yy + loopH)), 1), y: yy + loopH },
      ];
      startX = x1;
    } else {
      dir = b > a ? 1 : -1;
      startX = barEdge(a, fromLvl, dir);
      let endX = barEdge(b, toLvl, dir === 1 ? -1 : 1);
      if (r.m.create) endX = xs[b] - (dir * headers[b].w) / 2;
      if (r.m.destroy === 'to') endX = xs[b] - dir * 7;
      pts = [
        { x: startX, y: yy },
        { x: endX, y: yy },
      ];
    }
    const failed = kind === 'fail';
    // Ending the receiver's lifeline draws its own cross; one is enough.
    const failCross = failed && r.m.destroy !== 'to';
    ctx.els.push({
      kind: 'line',
      id: r.id,
      role: 'edge',
      points: pts,
      paint: { fill: 'none', stroke, strokeWidth: sw, dash },
      arrowEnd: !failed,
      arrowStart: !!r.m.both,
      arrow: head,
      group: `g-${r.id}`,
    });
    if (failCross) {
      const e = pts[pts.length - 1];
      const d = 5;
      ctx.els.push({ kind: 'line', id: `${r.id}--fail-1`, role: 'marker', points: [{ x: e.x - d, y: e.y - d }, { x: e.x + d, y: e.y + d }], paint: { fill: 'none', stroke, strokeWidth: sw + 0.25 }, group: `g-${r.id}` });
      ctx.els.push({ kind: 'line', id: `${r.id}--fail-2`, role: 'marker', points: [{ x: e.x - d, y: e.y + d }, { x: e.x + d, y: e.y - d }], paint: { fill: 'none', stroke, strokeWidth: sw + 0.25 }, group: `g-${r.id}` });
    }

    // Label above the line (beside the loop for a self-message).
    const badge = res.numbering === 'badge';
    let lx: number;
    let ly: number;
    let anchorT: 'start' | 'middle' = 'middle';
    if (r.self) {
      lx = pts[1].x + 8;
      ly = yy + loopH / 2 - r.labelH / 2;
      anchorT = 'start';
    } else {
      const x1 = pts[0].x + (badge ? dir * (BADGE + 2) : 0);
      lx = labelSpot(a, b, x1, pts[1].x, r.labelW);
      ly = yy - 5 - r.labelH;
    }
    const msgBox = { x: anchorT === 'middle' ? lx - r.labelW / 2 : lx, y: ly, w: r.labelW, h: r.labelH };
    if (r.m.id) ctx.anchors.set(r.m.id, msgBox);
    if (r.lines.length) knockoutText(ctx, `${r.id}--label`, lx, ly, r.lines, msgSt, anchorT, (x, y2) => bgAt(x, y2), labelInk, `g-${r.id}`, r.labelW);
    if (r.detail.length) knockoutText(ctx, `${r.id}--detail`, lx, ly + r.lines.length * lh(ctx, msgSt.size), r.detail, detailSt, anchorT, (x, y2) => bgAt(x, y2), 'inkMuted', `g-${r.id}`, r.labelW);
    if (badge) {
      const text = String(r.n);
      const bw = Math.max(BADGE, Math.ceil(textWidth(ctx, text, st.captionStrong) + 8));
      const bx = Math.round(startX + dir * (bw / 2 + 1) - bw / 2);
      const fill: Token = quiet ? 'line' : c ?? 'accent';
      addShape(ctx, { id: `${r.id}--number`, role: 'badge', shape: bw > BADGE ? 'pill' : 'ellipse', x: bx, y: yy - BADGE / 2, w: bw, h: BADGE, paint: { fill, stroke: 'background', strokeWidth: 1.5 }, inset: { l: 0, r: 0, t: 0, b: 0 }, box: false, group: `g-${r.id}` });
      addText(ctx, { id: `${r.id}--number-text`, role: 'label', x: bx + bw / 2, y: yy - BADGE / 2, lines: [text], ...st.captionStrong, lineHeight: BADGE, anchor: 'middle', color: textOn('accentInk', fill), box: `${r.id}--number`, group: `g-${r.id}`, slot: 'badge' });
    }
  }

  // ---- Draw: timing brackets -----------------------------------------------------------------------------
  timings.forEach((t, i) => {
    const a = msgById.get(t.from);
    const b = msgById.get(t.to);
    if (!a || !b) return;
    const col = timingCols[i];
    const bx = Math.round(diagramR + 16 + col * 20);
    const y0 = Math.round(a.y);
    const y1 = Math.round(b.y + (b.self ? loopH : 0));
    const c: Token = t.emphasis === 'accent' ? 'accent' : t.emphasis === 'highlight' ? 'highlight' : 'inkMuted';
    ctx.els.push({ kind: 'line', id: `timing-${i + 1}`, role: 'decoration', points: [{ x: bx - 6, y: y0 }, { x: bx, y: y0 }, { x: bx, y: y1 }, { x: bx - 6, y: y1 }], paint: { fill: 'none', stroke: c === 'inkMuted' ? 'lineStrong' : c, strokeWidth: 1.5 } });
    const lines = [t.label];
    const th = lh(ctx, timingSt.size);
    const tx = Math.round(diagramR + 16 + Math.max(...timingCols) * 20 + 8);
    const ty = (y0 + y1) / 2 - th / 2;
    knockoutText(ctx, `timing-${i + 1}--label`, tx, ty, lines, timingSt, 'start', (x, yy) => bgAt(x, yy), c);
  });

  // ---- Mirror headers -------------------------------------------------------------------------------------
  if (style.mirror) for (const h of headers) if (!destroyAt.has(h.i)) drawHeader(h, mirrorTop + HH / 2, '--mirror', false);

  endFrame(ctx, frame, Math.max(groupBottom, ...[...phaseBox.values()].map((b) => b.y + b.h)));

  // ---- Helpers ----
  /**
   * Centre of the label for a message from lifeline a to b: in the gap next to the sender when it
   * fits there (so no lifeline or activation bar runs through the text), else in any clear gap,
   * else over the whole arrow.
   */
  function labelSpot(a: number, b: number, x1: number, x2: number, w: number): number {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 2) return (x1 + x2) / 2;
    const clear = BAR_W / 2 + 2 * BAR_STEP + 6;
    const segs: [number, number][] = [];
    for (let k = lo; k < hi; k++) {
      const s0 = k === lo ? Math.min(x1, x2) : xs[k] + clear;
      const s1 = k === hi - 1 ? Math.max(x1, x2) : xs[k + 1] - clear;
      segs.push([s0, s1]);
    }
    if (a > b) segs.reverse();
    const fit = segs.find(([s0, s1]) => s1 - s0 >= w + 2 * 8);
    return fit ? (fit[0] + fit[1]) / 2 : (x1 + x2) / 2;
  }

  // ---- Helpers ---------------------------------------------------------------------------------------------
  function noteBox(r: NoteRow, xsv: number[], room: number): Box {
    const pos = r.s.position ?? 'over';
    const a = r.over[0];
    const b = r.over[r.over.length - 1];
    if (r.over.length === 2) {
      const lo = xsv[a] - 24;
      const hi = xsv[b] + 24;
      const w = Math.max(r.w, hi - lo);
      return { x: Math.round((lo + hi) / 2 - w / 2), y: 0, w: Math.round(w), h: r.h };
    }
    if (pos === 'right') return { x: Math.round(xsv[a] + room / 2 + 10), y: 0, w: r.w, h: r.h };
    if (pos === 'left') return { x: Math.round(xsv[a] - room / 2 - 10 - r.w), y: 0, w: r.w, h: r.h };
    return { x: Math.round(xsv[a] - r.w / 2), y: 0, w: r.w, h: r.h };
  }
}

interface FrameGeom {
  open: FragOpen;
  close: FragClose;
  x: number;
  w: number;
  y: number;
  h: number;
  seps: FragSep[];
  depth: number;
}

// ---- Free helpers ------------------------------------------------------------------------------------------

/** Text on an opaque plate the colour of whatever is underneath, so lifelines never cut through it. */
function knockoutText(
  ctx: LayoutContext,
  id: string,
  x: number,
  y: number,
  lines: string[],
  st: TextStyle,
  anchor: 'start' | 'middle',
  bgAt: (x: number, y: number) => Token,
  ink: Token,
  group?: string,
  width?: number,
): void {
  const w = width ?? Math.max(...lines.map((l) => textWidth(ctx, l, st)));
  const h = lines.length * lh(ctx, st.size);
  const left = anchor === 'middle' ? x - w / 2 : x;
  const fill = bgAt(left + w / 2, y + h / 2);
  addShape(ctx, {
    id: `${id}--plate`,
    role: 'decoration',
    shape: 'rect',
    x: Math.floor(left - 3),
    y: Math.floor(y),
    w: Math.ceil(w + 6),
    h: Math.ceil(y + h) - Math.floor(y),
    radius: 2,
    paint: { fill, stroke: 'none', strokeWidth: 0 },
    box: false,
    group,
  });
  addText(ctx, { id, role: 'label', x, y, w, lines, ...st, anchor, color: textOn(ink, fill), box: `${id}--plate`, group, slot: 'text' });
}

function guardText(o: FragOpen): string {
  if (!o.label) return '';
  return o.kind === 'group' ? o.label : `[${o.label}]`;
}

function guardLabel(kind: FragmentKind | 'highlight', label: string): string {
  return kind === 'group' || kind === 'highlight' ? label : `[${label}]`;
}

function fragTagWidth(ctx: LayoutContext, o: FragOpen, st: TextStyle): number {
  const tag = (FRAGMENT_TAG[o.kind as FragmentKind] || (o.label ?? '')).toUpperCase();
  return Math.ceil(textWidth(ctx, tag, st) + tag.length * 0.6 + 8 + 14);
}

function maxDepth(rows: Row[]): number {
  let d = 0;
  for (const r of rows) if (r.t === 'open') d = Math.max(d, r.depth + 1);
  return d;
}

function countAccented(steps: SequenceStep[]): number {
  let n = 0;
  for (const s of steps) {
    if (isSeqMessage(s) && s.emphasis === 'accent') n++;
    else if (isSeqFragment(s)) n += countAccented(s.steps) + (s.branches ?? []).reduce((k, b) => k + countAccented(b.steps), 0);
    else if (isSeqHighlight(s) || isSeqPhase(s)) n += countAccented(s.steps);
  }
  return n;
}

/** Overlapping brackets go in separate columns, outermost first. */
function assignTimingColumns(timings: NonNullable<SequenceBody['timings']>, byId: Map<string, { n: number }>): number[] {
  const spans = timings.map((t) => [byId.get(t.from)?.n ?? 0, byId.get(t.to)?.n ?? 0] as [number, number]);
  const cols: number[] = [];
  spans.forEach((s, i) => {
    let c = 0;
    while (spans.slice(0, i).some((o, j) => cols[j] === c && !(o[1] < s[0] || s[1] < o[0]))) c++;
    cols.push(c);
  });
  return cols;
}

function legendFor(ctx: LayoutContext, body: SequenceBody): LegendItem[] {
  const heads = body.style?.arrowheads ?? 'classic';
  if (ctx.altitude !== 'detailed' || ctx.spec.legend !== 'auto') return [];
  const kinds = new Set<MessageKind>();
  const walk = (steps: SequenceStep[]) => {
    for (const s of steps) {
      if (isSeqMessage(s)) kinds.add(s.kind ?? 'sync');
      else if (isSeqFragment(s)) {
        walk(s.steps);
        for (const b of s.branches ?? []) walk(b.steps);
      } else if (isSeqHighlight(s) || isSeqPhase(s)) walk(s.steps);
    }
  };
  walk(body.steps);
  if (kinds.size < 2) return [];
  const names: Record<MessageKind, string> = { sync: 'Call', async: 'Asynchronous message', return: 'Return', fail: 'Failed or lost message' };
  return (['sync', 'async', 'return', 'fail'] as MessageKind[])
    .filter((k) => kinds.has(k))
    .map((k) => ({
      label: names[k],
      kind: 'flow' as const,
      flow: { stroke: 'lineStrong', dash: k === 'return' ? ('dashed' as const) : undefined, arrow: k === 'fail' ? ('cross' as const) : heads === 'filled' || (heads === 'classic' && k === 'sync') ? ('triangle' as const) : ('open' as const) },
    }));
}
