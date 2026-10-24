/**
 * Orthogonal connector router: A* over an 8-unit lattice. Routes never enter
 * a node (inflated by a clearance), start and end perpendicular to a box
 * edge, and are penalised for bends, crossings and shared segments, so the
 * result reads cleanly and is identical run to run.
 */
import type { Box, Point, ShapeKind, Side } from '../scene/types.js';

export interface RouteNode {
  id: string;
  box: Box;
  shape: ShapeKind;
  /**
   * Explicit port centres per side (e.g. an icon whose label hangs below it). Only
   * listed sides are used; ports spread along the side by up to `spread` units.
   */
  ports?: Partial<Record<Side, { x: number; y: number; spread: number }>>;
}

export interface RouteRequest {
  id: string;
  from: RouteNode;
  to: RouteNode;
  /** Extra cost per side, lower is preferred. Missing sides are not allowed. */
  fromSides: Partial<Record<Side, number>>;
  toSides: Partial<Record<Side, number>>;
  /** Soft areas this route may cross freely (e.g. the boundaries around its own ends). */
  allowed?: ReadonlySet<string>;
}

export interface RouteResult {
  id: string;
  points: Point[];
  fromSide: Side;
  toSide: Side;
  ok: boolean;
}

export interface RouterOptions {
  bounds: Box;
  obstacles: RouteNode[];
  step?: number;
  clearance?: number;
  /** Length of the straight run into the target (room for the arrowhead). */
  endStub?: number;
  /** Decorative lines (e.g. phase separators) routes should not run along. */
  softLines?: Point[][];
  /** Areas (e.g. unrelated boundaries) a route should not wander through; each step inside costs extra. */
  softBoxes?: { id: string; box: Box }[];
}

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const SIDE_DIR: Record<Side, number> = { right: 0, left: 1, bottom: 2, top: 3 };
const INWARD: Record<Side, number> = { right: 1, left: 0, bottom: 3, top: 2 };

const COST = {
  bend: 48,
  cross: 160,
  overlap: 600,
  cornerTouch: 240,
  portShare: 300,
  portCrowd: 140,
  portOffset: 10,
  softLine: 40,
  softArea: 12,
};

class Heap {
  private a: { f: number; g: number; s: number; seq: number }[] = [];
  private seq = 0;
  get size() {
    return this.a.length;
  }
  push(f: number, g: number, s: number) {
    const item = { f, g, s, seq: this.seq++ };
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  private less(x: { f: number; g: number; seq: number }, y: { f: number; g: number; seq: number }) {
    if (x.f !== y.f) return x.f < y.f;
    if (x.g !== y.g) return x.g > y.g;
    return x.seq < y.seq;
  }
}

interface Port {
  side: Side;
  /** Point on the box edge. */
  at: Point;
  /** Point outside the box where routing starts/ends. */
  stub: Point;
  cost: number;
}

export class Router {
  private step: number;
  private clear: number;
  private endStub: number;
  private x0: number;
  private y0: number;
  private nx: number;
  private ny: number;
  private blocked: Uint8Array;
  private dist: Uint8Array;
  /** Lattice edge usage: key = point index * 2 + (0 horizontal | 1 vertical). */
  private usedEdge = new Map<number, number>();
  /** Points crossed by a route, by orientation bit (1 = H, 2 = V, 4 = corner). */
  private usedPoint = new Uint8Array(0);
  private usedPorts = new Map<string, number>();
  private portsBySide = new Map<string, Point[]>();
  /** Lattice edges lying on a soft line. */
  private softEdge = new Set<number>();

  constructor(private readonly opts: RouterOptions) {
    this.step = opts.step ?? 8;
    this.clear = opts.clearance ?? 8;
    this.endStub = opts.endStub ?? 16;
    const b = opts.bounds;
    this.x0 = Math.floor(b.x / this.step) * this.step;
    this.y0 = Math.floor(b.y / this.step) * this.step;
    this.nx = Math.floor((b.x + b.w - this.x0) / this.step) + 1;
    this.ny = Math.floor((b.y + b.h - this.y0) / this.step) + 1;
    const N = this.nx * this.ny;
    this.blocked = new Uint8Array(N);
    this.usedPoint = new Uint8Array(N);
    for (const o of opts.obstacles) this.block(o.box, this.clear);
    this.dist = this.distanceField();
    for (const line of opts.softLines ?? []) {
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1];
        const b = line[k];
        const horizontal = a.y === b.y;
        const steps = Math.round((horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)) / this.step);
        const dx = Math.sign(b.x - a.x) * this.step;
        const dy = Math.sign(b.y - a.y) * this.step;
        for (let s = 0; s < steps; s++) {
          const i = this.toIdx({ x: a.x + dx * s, y: a.y + dy * s });
          const j = this.toIdx({ x: a.x + dx * (s + 1), y: a.y + dy * (s + 1) });
          if (i >= 0 && j >= 0) this.softEdge.add(Math.min(i, j) * 2 + (horizontal ? 0 : 1));
        }
      }
    }
  }

  private idx(ix: number, iy: number) {
    return iy * this.nx + ix;
  }

  private toIdx(p: Point): number {
    const ix = Math.round((p.x - this.x0) / this.step);
    const iy = Math.round((p.y - this.y0) / this.step);
    if (ix < 0 || iy < 0 || ix >= this.nx || iy >= this.ny) return -1;
    return this.idx(ix, iy);
  }

  private pt(i: number): Point {
    return { x: this.x0 + (i % this.nx) * this.step, y: this.y0 + Math.floor(i / this.nx) * this.step };
  }

  private block(b: Box, c: number) {
    for (let iy = 0; iy < this.ny; iy++) {
      const y = this.y0 + iy * this.step;
      if (y <= b.y - c || y >= b.y + b.h + c) continue;
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + ix * this.step;
        if (x > b.x - c && x < b.x + b.w + c) this.blocked[this.idx(ix, iy)] = 1;
      }
    }
  }

  /** Lattice distance (in steps, capped) to the nearest blocked point. */
  private distanceField(): Uint8Array {
    const N = this.nx * this.ny;
    const d = new Uint8Array(N).fill(255);
    const q: number[] = [];
    for (let i = 0; i < N; i++)
      if (this.blocked[i]) {
        d[i] = 0;
        q.push(i);
      }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (d[i] >= 4) continue;
      const ix = i % this.nx;
      const iy = Math.floor(i / this.nx);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx;
        const jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= this.nx || jy >= this.ny) continue;
        const j = this.idx(jx, jy);
        if (d[j] > d[i] + 1) {
          d[j] = d[i] + 1;
          q.push(j);
        }
      }
    }
    return d;
  }

  private ports(node: RouteNode, sides: Partial<Record<Side, number>>, stubLen: number): Port[] {
    const out: Port[] = [];
    const b = node.box;
    const single = node.shape === 'diamond' || node.shape === 'ellipse' || node.shape === 'pill';
    for (const side of Object.keys(sides).sort() as Side[]) {
      const base = sides[side]!;
      const fixed = node.ports?.[side];
      if (node.ports && !fixed) continue;
      if (fixed) {
        const along = side === 'left' || side === 'right' ? fixed.y : fixed.x;
        const offsets: number[] = [0];
        for (let k = this.step; k <= fixed.spread; k += this.step) offsets.push(k, -k);
        for (const off of offsets) {
          const c = Math.round((along + off) / this.step) * this.step;
          const at = side === 'left' || side === 'right' ? { x: fixed.x, y: c } : { x: c, y: fixed.y };
          const d = side === 'left' ? { x: -1, y: 0 } : side === 'right' ? { x: 1, y: 0 } : side === 'top' ? { x: 0, y: -1 } : { x: 0, y: 1 };
          const stub = { x: at.x + d.x * stubLen, y: at.y + d.y * stubLen };
          const si = this.toIdx(stub);
          if (si < 0 || this.blocked[si]) continue;
          if (!this.runClear(at, stub, node.id)) continue;
          const key = `${node.id}:${side}:${at.x},${at.y}`;
          const share = this.usedPorts.has(key) ? COST.portShare : 0;
          out.push({ side, at, stub, cost: base + (Math.abs(off) / this.step) * COST.portOffset + share });
        }
        continue;
      }
      const horizontalSide = side === 'top' || side === 'bottom';
      const len = horizontalSide ? b.w : b.h;
      const mid = horizontalSide ? b.x + b.w / 2 : b.y + b.h / 2;
      const offsets: number[] = [0];
      if (!single) {
        for (let k = this.step; k <= len / 2 - 12; k += this.step) offsets.push(k, -k);
      }
      for (const off of offsets) {
        const c = Math.round((mid + off) / this.step) * this.step;
        let at: Point;
        let stub: Point;
        switch (side) {
          case 'left':
            at = { x: b.x, y: c };
            stub = { x: b.x - stubLen, y: c };
            break;
          case 'right':
            at = { x: b.x + b.w, y: c };
            stub = { x: b.x + b.w + stubLen, y: c };
            break;
          case 'top':
            at = { x: c, y: b.y };
            stub = { x: c, y: b.y - stubLen };
            break;
          case 'bottom':
            at = { x: c, y: b.y + b.h };
            stub = { x: c, y: b.y + b.h + stubLen };
            break;
        }
        if (single) {
          // Single-port shapes connect at the side midpoint (a diamond's vertex is exact;
          // flat-sided pills and ellipses snap to the lattice).
          const snapL = (v: number) => (node.shape === 'diamond' ? v : Math.round(v / this.step) * this.step);
          if (side === 'left' || side === 'right') {
            at = { ...at, y: snapL(b.y + b.h / 2) };
            stub = { ...stub, y: at.y };
          } else {
            at = { ...at, x: snapL(b.x + b.w / 2) };
            stub = { ...stub, x: at.x };
          }
        }
        const si = this.toIdx(stub);
        if (si < 0 || this.blocked[si]) continue;
        // The stub run must not clip a neighbouring node.
        if (!this.runClear(at, stub, node.id)) continue;
        const key = `${node.id}:${side}:${at.x},${at.y}`;
        const share = this.usedPorts.has(key) ? COST.portShare : 0;
        // Ports crowding an already-used port on the same side read as one arrow.
        const near = (this.portsBySide.get(`${node.id}:${side}`) ?? []).some(
          (p) => Math.abs(p.x - at.x) + Math.abs(p.y - at.y) > 0 && Math.abs(p.x - at.x) + Math.abs(p.y - at.y) < 32,
        );
        out.push({ side, at, stub, cost: base + (Math.abs(off) / this.step) * COST.portOffset + share + (near ? COST.portCrowd : 0) });
      }
    }
    return out;
  }

  private runClear(a: Point, b: Point, ownId: string): boolean {
    for (const o of this.opts.obstacles) {
      if (o.id === ownId) continue;
      const bx = o.box;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      if (x1 > bx.x - this.clear && x0 < bx.x + bx.w + this.clear && y1 > bx.y - this.clear && y0 < bx.y + bx.h + this.clear) return false;
    }
    return true;
  }

  route(req: RouteRequest): RouteResult {
    const starts = this.ports(req.from, req.fromSides, this.step);
    const goals = this.ports(req.to, req.toSides, this.endStub);
    if (!starts.length || !goals.length) return this.fallback(req);
    const goalByIdx = new Map<number, Port[]>();
    for (const g of goals) {
      const gi = this.toIdx(g.stub);
      if (gi < 0) continue;
      const list = goalByIdx.get(gi) ?? [];
      list.push(g);
      goalByIdx.set(gi, list);
    }
    const N = this.nx * this.ny;
    const S = N * 4;
    const DONE = S; // virtual goal state
    const areaCost = this.areaPenalty(req.allowed);
    const gScore = new Float64Array(S + 1).fill(Infinity);
    const came = new Int32Array(S + 1).fill(-1);
    const startOf = new Map<number, Port>();
    let doneVia: { state: number; port: Port } | undefined;
    const heap = new Heap();
    const goalPts = goals.map((g) => g.stub);
    const h = (i: number) => {
      const p = this.pt(i);
      let best = Infinity;
      for (const q of goalPts) best = Math.min(best, Math.abs(p.x - q.x) + Math.abs(p.y - q.y));
      return best;
    };
    for (const s of starts) {
      const si = this.toIdx(s.stub);
      if (si < 0) continue;
      const st = si * 4 + SIDE_DIR[s.side];
      if (s.cost < gScore[st]) {
        gScore[st] = s.cost;
        startOf.set(st, s);
        heap.push(s.cost + h(si), s.cost, st);
      }
    }
    while (heap.size) {
      const { g, s } = heap.pop();
      if (s === DONE) break;
      if (g > gScore[s]) continue;
      const i = s >> 2;
      const dir = s & 3;
      const gl = goalByIdx.get(i);
      if (gl) {
        for (const port of gl) {
          const cost = g + port.cost + (dir === INWARD[port.side] ? 0 : COST.bend);
          if (cost < gScore[DONE]) {
            gScore[DONE] = cost;
            doneVia = { state: s, port };
            heap.push(cost, cost, DONE);
          }
        }
      }
      const ix = i % this.nx;
      const iy = Math.floor(i / this.nx);
      for (let nd = 0; nd < 4; nd++) {
        if ((dir ^ nd) === 1 && (dir >> 1) === (nd >> 1)) continue; // no U-turn
        const jx = ix + DIRS[nd].x;
        const jy = iy + DIRS[nd].y;
        if (jx < 0 || jy < 0 || jx >= this.nx || jy >= this.ny) continue;
        const j = this.idx(jx, jy);
        if (this.blocked[j]) continue;
        let cost = this.step;
        if (nd !== dir) cost += COST.bend;
        const horizontal = nd < 2;
        const ek = (horizontal ? Math.min(i, j) : Math.min(i, j)) * 2 + (horizontal ? 0 : 1);
        if (this.usedEdge.has(ek)) cost += COST.overlap;
        if (this.softEdge.has(ek)) cost += COST.softLine;
        const up = this.usedPoint[j];
        if (up) {
          const perpendicular = horizontal ? up & 2 : up & 1;
          if (up & 4) cost += COST.cornerTouch;
          else if (perpendicular) cost += COST.cross;
        }
        if (nd !== dir && this.usedPoint[i]) cost += COST.cornerTouch;
        const d = this.dist[j];
        if (d < 3) cost += (3 - d) * 2;
        if (areaCost) cost += areaCost[j];
        const ns = j * 4 + nd;
        const ng = g + cost;
        if (ng < gScore[ns]) {
          gScore[ns] = ng;
          came[ns] = s;
          heap.push(ng + h(j), ng, ns);
        }
      }
    }
    if (!doneVia) return this.fallback(req);
    // Reconstruct.
    const states: number[] = [];
    let cur = doneVia.state;
    while (cur !== -1) {
      states.push(cur);
      if (startOf.has(cur)) break;
      cur = came[cur];
    }
    states.reverse();
    const start = startOf.get(states[0])!;
    const lattice = states.map((st) => this.pt(st >> 2));
    const pts = simplify([start.at, ...lattice, doneVia.port.at]);
    this.commit(states, start, doneVia.port, req);
    return { id: req.id, points: pts, fromSide: start.side, toSide: doneVia.port.side, ok: true };
  }

  /** Per-point extra cost inside soft boxes the route has no business in. */
  private areaPenalty(allowed?: ReadonlySet<string>): Uint8Array | undefined {
    const boxes = (this.opts.softBoxes ?? []).filter((b) => !allowed?.has(b.id));
    if (!boxes.length) return undefined;
    const pen = new Uint8Array(this.nx * this.ny);
    for (const { box } of boxes) {
      for (let iy = 0; iy < this.ny; iy++) {
        const y = this.y0 + iy * this.step;
        if (y <= box.y || y >= box.y + box.h) continue;
        for (let ix = 0; ix < this.nx; ix++) {
          const x = this.x0 + ix * this.step;
          if (x > box.x && x < box.x + box.w) pen[this.idx(ix, iy)] = Math.min(255, pen[this.idx(ix, iy)] + COST.softArea);
        }
      }
    }
    return pen;
  }

  private commit(states: number[], start: Port, end: Port, req: RouteRequest) {
    for (let k = 0; k < states.length; k++) {
      const i = states[k] >> 2;
      const dir = states[k] & 3;
      const horizontal = dir < 2;
      const nextDir = k + 1 < states.length ? states[k + 1] & 3 : dir;
      this.usedPoint[i] |= nextDir !== dir ? 4 : horizontal ? 1 : 2;
      if (k > 0) {
        const p = states[k - 1] >> 2;
        const ek = Math.min(i, p) * 2 + (horizontal ? 0 : 1);
        this.usedEdge.set(ek, (this.usedEdge.get(ek) ?? 0) + 1);
      }
    }
    this.usedPorts.set(`${req.from.id}:${start.side}:${start.at.x},${start.at.y}`, 1);
    this.usedPorts.set(`${req.to.id}:${end.side}:${end.at.x},${end.at.y}`, 1);
    for (const [id, p] of [
      [req.from.id, start],
      [req.to.id, end],
    ] as const) {
      const k = `${id}:${p.side}`;
      this.portsBySide.set(k, [...(this.portsBySide.get(k) ?? []), p.at]);
    }
  }

  /** Straight-ish fallback when no lattice path exists (reported by QA). */
  private fallback(req: RouteRequest): RouteResult {
    const a = req.from.box;
    const b = req.to.box;
    const p1 = { x: a.x + a.w, y: a.y + a.h / 2 };
    const p2 = { x: b.x, y: b.y + b.h / 2 };
    const mx = (p1.x + p2.x) / 2;
    return {
      id: req.id,
      points: simplify([p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]),
      fromSide: 'right',
      toSide: 'left',
      ok: false,
    };
  }
}

/** Drop collinear and duplicate points. */
export function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}
