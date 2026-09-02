import { FeynmarkError } from '../errors';
import type { DiagramModel, Vertex } from '../model/model';
import { choleskySolve } from './linsolve';
import { dist, type Vec2 } from './geometry';

export interface VertexLayout {
  positions: Map<string, Vec2>;
  /** Reference length: the target mean propagator length in px. */
  unit: number;
}

/** Target mean edge chord length in px at scale = 1. */
export const BASE_EDGE_LEN = 78;

/**
 * feynMF-style layout: pin external legs (and explicit `at` vertices), then
 * place internal vertices by minimizing Σ w|Δp|² — i.e. solve the Laplacian
 * system L_II P_I = -L_IX P_X. Deterministic, no iteration.
 *
 * Works in an abstract frame first (in-legs on x=0, out-legs on x=1, first
 * declared leg on top), then scales so the mean edge length is BASE_EDGE_LEN.
 * Output is in screen coordinates (y down).
 */
export function layoutDiagram(model: DiagramModel, edgeLength?: number): VertexLayout {
  const ids = [...model.vertices.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  // --- 1. Pins ---------------------------------------------------------
  const nIn = countExternals(model, 'in');
  const nOut = countExternals(model, 'out');
  const pins = new Map<string, Vec2>();

  for (const v of model.vertices.values()) {
    const p = pinFor(v, nIn, nOut, model.options.direction);
    if (p) pins.set(v.id, p);
  }
  if (pins.size === 0) {
    throw new FeynmarkError(
      `diagram${model.name ? ` '${model.name}'` : ''} has no external legs or pinned vertices — ` +
        `declare 'in'/'out' legs or use 'at (x, y)'`,
    );
  }

  // --- 2. Laplacian over non-loop edges (parallel edges: summed weights) --
  const W = new Float64Array(n * n);
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    const i = index.get(e.from)!;
    const j = index.get(e.to)!;
    // A bent edge carries more ink per chord length; weaken its spring by the
    // chord/arc ratio so strongly bent propagators get room to breathe.
    let w = e.tension;
    if (e.bend !== undefined && Math.abs(e.bend) > 1) {
      const a = (Math.abs(e.bend) * Math.PI) / 180;
      w *= Math.sin(a) / a;
    }
    W[i * n + j] = (W[i * n + j] ?? 0) + w;
    W[j * n + i] = (W[j * n + i] ?? 0) + w;
  }

  const internal = ids.filter((id) => !pins.has(id));
  const m = internal.length;
  const positions = new Map<string, Vec2>();
  for (const [id, p] of pins) positions.set(id, { ...p });

  if (m > 0) {
    // Connectivity check: every internal vertex must reach a pinned vertex.
    checkAnchored(model, ids, index, W, pins);

    const iidx = new Map(internal.map((id, k) => [id, k]));
    const A = new Float64Array(m * m);
    const bx = new Float64Array(m);
    const by = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const i = index.get(internal[k]!)!;
      let deg = 0;
      for (let j = 0; j < n; j++) {
        const w = W[i * n + j]!;
        if (w === 0) continue;
        deg += w;
        const jid = ids[j]!;
        if (pins.has(jid)) {
          const p = pins.get(jid)!;
          bx[k] = bx[k]! + w * p.x;
          by[k] = by[k]! + w * p.y;
        } else {
          A[k * m + iidx.get(jid)!] = -w;
        }
      }
      A[k * m + k] = deg;
    }
    const xs = choleskySolve(A, bx, m);
    const ys = choleskySolve(A, by, m);
    for (let k = 0; k < m; k++) positions.set(internal[k]!, { x: xs[k]!, y: ys[k]! });
  }

  // --- 3. Degeneracy nudge ---------------------------------------------
  nudgeDegenerate(model, positions, internal);

  // --- 3.5 Edge-length equalization ------------------------------------
  // The harmonic solution fixes the topology but can leave very uneven edge
  // lengths (an external leg squeezed to nothing beside a long propagator).
  // Relax internal vertices toward uniform ideal lengths — deterministic
  // stress majorization with the pins held fixed.
  equalizeEdgeLengths(model, positions, internal);

  // --- 4. Scale to px ----------------------------------------------------
  const unit = (edgeLength ?? BASE_EDGE_LEN) * model.options.scale;
  const chords: number[] = [];
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    chords.push(dist(positions.get(e.from)!, positions.get(e.to)!));
  }
  const mean = chords.length ? chords.reduce((a, b) => a + b, 0) / chords.length : 1;
  const S = mean > 1e-9 ? unit / mean : unit;
  for (const [id, p] of positions) positions.set(id, { x: p.x * S, y: p.y * S });

  return { positions, unit };
}

function countExternals(model: DiagramModel, dir: 'in' | 'out'): number {
  let c = 0;
  for (const v of model.vertices.values()) if (v.external === dir) c++;
  return c;
}

/**
 * Canonical pin frame (direction=right): in-legs on x=0, out-legs on x=1,
 * legs at y=(2i+1)/(2k), first declared on top. `at (x, y)` uses y-up
 * coordinates and overrides the external default.
 */
function pinFor(
  v: Vertex,
  nIn: number,
  nOut: number,
  direction: 'right' | 'left' | 'down' | 'up',
): Vec2 | undefined {
  let p: Vec2 | undefined;
  if (v.pin) {
    p = { x: v.pin.x, y: -v.pin.y }; // y-up user coords -> screen
  } else if (v.external) {
    const k = v.external === 'in' ? nIn : nOut;
    const x = v.external === 'in' ? 0 : 1;
    const y = (2 * (v.externalIndex ?? 0) + 1) / (2 * k);
    p = { x, y };
  }
  if (!p) return undefined;
  switch (direction) {
    case 'right':
      return p;
    case 'left':
      return { x: 1 - p.x, y: p.y };
    case 'down':
      return { x: p.y, y: p.x };
    case 'up':
      return { x: p.y, y: 1 - p.x };
  }
}

function checkAnchored(
  model: DiagramModel,
  ids: string[],
  index: Map<string, number>,
  W: Float64Array,
  pins: Map<string, Vec2>,
): void {
  const n = ids.length;
  const reached = new Set<string>(pins.keys());
  const queue = [...pins.keys()];
  while (queue.length) {
    const id = queue.pop()!;
    const i = index.get(id)!;
    for (let j = 0; j < n; j++) {
      if (W[i * n + j]! !== 0 && !reached.has(ids[j]!)) {
        reached.add(ids[j]!);
        queue.push(ids[j]!);
      }
    }
  }
  for (const id of ids) {
    if (!reached.has(id)) {
      throw new FeynmarkError(
        `vertex '${id}' is not connected to any external leg or pinned vertex — ` +
          `the layout cannot place it (connect it, or pin it with 'at (x, y)')`,
      );
    }
  }
}

interface StressEdge {
  a: string;
  b: string;
  weight: number;
  /** Ideal chord length relative to the unit length d0. */
  idealFactor: number;
}

/**
 * Stress relaxation: pull every edge chord toward a uniform ideal length.
 * Ideal lengths honor `tension` (lower = longer) and shrink for strongly
 * bent edges (their ink budget lives in the arc, not the chord). Jacobi
 * updates with damping keep the result deterministic and preserve any
 * mirror symmetry of the harmonic starting point.
 */
function equalizeEdgeLengths(model: DiagramModel, positions: Map<string, Vec2>, internal: string[]): void {
  if (internal.length === 0) return;

  // Collapse parallel edges per unordered pair.
  const pairs = new Map<string, StressEdge>();
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    const key = e.from < e.to ? `${e.from} ${e.to}` : `${e.to} ${e.from}`;
    let factor = 1 / e.tension;
    if (e.bend !== undefined && Math.abs(e.bend) > 1) {
      const a = (Math.abs(e.bend) * Math.PI) / 180;
      factor *= Math.sin(a) / a;
    }
    factor = Math.min(factor, 2.5);
    const prev = pairs.get(key);
    if (prev) {
      // Tension-weighted mean of the parallel edges' ideal factors: a straight
      // line paired with a half-circle (self-energy) keeps a roomy chord,
      // while a symmetric bubble still contracts to its natural diameter.
      prev.idealFactor = (prev.idealFactor * prev.weight + factor * e.tension) / (prev.weight + e.tension);
      prev.weight += e.tension;
    } else {
      pairs.set(key, { a: e.from, b: e.to, weight: e.tension, idealFactor: factor });
    }
  }
  if (pairs.size === 0) return;

  // Unit length: mean of the current nonzero chords.
  let sum = 0;
  let n = 0;
  for (const p of pairs.values()) {
    const d = dist(positions.get(p.a)!, positions.get(p.b)!);
    if (d > 1e-9) {
      sum += d;
      n++;
    }
  }
  const d0 = n > 0 ? sum / n : 1;

  // Adjacency with ideal lengths.
  const nbrs = new Map<string, { other: string; w: number; ideal: number }[]>();
  const push = (u: string, v: string, w: number, ideal: number): void => {
    let list = nbrs.get(u);
    if (!list) {
      list = [];
      nbrs.set(u, list);
    }
    list.push({ other: v, w, ideal });
  };
  for (const p of pairs.values()) {
    const ideal = d0 * p.idealFactor;
    push(p.a, p.b, p.weight, ideal);
    push(p.b, p.a, p.weight, ideal);
  }

  const DAMP = 0.8;
  for (let iter = 0; iter < 120; iter++) {
    const next = new Map<string, Vec2>();
    for (const id of internal) {
      const list = nbrs.get(id);
      if (!list || list.length === 0) continue;
      const p = positions.get(id)!;
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (const { other, w, ideal } of list) {
        const q = positions.get(other)!;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        // Target: the point at distance `ideal` from the neighbor, in the
        // current direction (deterministic +x fallback for coincidence).
        const ux = d > 1e-9 ? dx / d : 1;
        const uy = d > 1e-9 ? dy / d : 0;
        sx += w * (q.x + ideal * ux);
        sy += w * (q.y + ideal * uy);
        sw += w;
      }
      const tx = sx / sw;
      const ty = sy / sw;
      next.set(id, { x: p.x + DAMP * (tx - p.x), y: p.y + DAMP * (ty - p.y) });
    }
    let moved = 0;
    for (const [id, p] of next) {
      moved = Math.max(moved, dist(p, positions.get(id)!));
      positions.set(id, p);
    }
    if (moved < 1e-5 * d0) break;
  }
}

/**
 * Harmonic layouts may place a vertex exactly on top of another (e.g. a
 * tadpole stem: the loop vertex coincides with its single neighbor). Nudge
 * such vertices deterministically.
 */
function nudgeDegenerate(model: DiagramModel, positions: Map<string, Vec2>, internal: string[]): void {
  const EPS = 1e-4;
  const chords: number[] = [];
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    const d = dist(positions.get(e.from)!, positions.get(e.to)!);
    if (d > EPS) chords.push(d);
  }
  const step = chords.length ? 0.6 * (chords.reduce((a, b) => a + b, 0) / chords.length) : 0.5;

  for (let pass = 0; pass < 2; pass++) {
    for (const id of internal) {
      const p = positions.get(id)!;
      const clash = [...positions.entries()].some(([other, q]) => other !== id && dist(p, q) < EPS);
      if (!clash) continue;
      // Push away from the mean of the neighbors; fall back to +x.
      let dx = 0;
      let dy = 0;
      let cnt = 0;
      for (const e of model.edges) {
        if (e.from === e.to) continue;
        const nb = e.from === id ? e.to : e.to === id ? e.from : undefined;
        if (!nb) continue;
        const q = positions.get(nb)!;
        dx += p.x - q.x;
        dy += p.y - q.y;
        cnt++;
      }
      let ux = 1;
      let uy = 0;
      const l = Math.hypot(dx, dy);
      if (cnt > 0 && l > EPS) {
        ux = dx / l;
        uy = dy / l;
      }
      positions.set(id, { x: p.x + ux * step, y: p.y + uy * step });
    }
  }
}
