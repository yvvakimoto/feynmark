import type { Path, Vec2 } from '../layout/geometry';
import type { Metrics } from './theme';

const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * Filled stealth-style arrowhead sitting ON the line at arclength `s`,
 * optically centered (its visual centroid, not its bbox center, lands on the
 * anchor point). `dir` +1 = along travel, -1 = reversed.
 */
export function arrowheadAt(path: Path, s: number, dir: 1 | -1, m: Metrics): { d: string; bounds: Vec2[] } {
  const p = path.point(s);
  const t0 = path.tangent(s);
  const t = { x: t0.x * dir, y: t0.y * dir };
  const n = { x: t.y, y: -t.x };
  const L = m.arrowLength;
  const W = 0.78 * L; // full width — a ~42° apex reads clearly at small sizes
  const notch = 0.26 * L; // stealth notch depth
  // Optical centering: centroid of the stealth triangle sits ~0.4L behind the
  // tip; shift so the centroid lands on the anchor.
  const tip = { x: p.x + 0.55 * L * t.x, y: p.y + 0.55 * L * t.y };
  const back = { x: tip.x - L * t.x, y: tip.y - L * t.y };
  const left = { x: back.x + (W / 2) * n.x, y: back.y + (W / 2) * n.y };
  const right = { x: back.x - (W / 2) * n.x, y: back.y - (W / 2) * n.y };
  const mid = { x: back.x + notch * t.x, y: back.y + notch * t.y };
  const d =
    `M${fmt(tip.x)} ${fmt(tip.y)}` +
    `L${fmt(left.x)} ${fmt(left.y)}` +
    `L${fmt(mid.x)} ${fmt(mid.y)}` +
    `L${fmt(right.x)} ${fmt(right.y)}Z`;
  return { d, bounds: [tip, left, right] };
}

export interface MomentumArrow {
  d: string;
  headD: string;
  bounds: Vec2[];
  /** Anchor for the momentum label (center of the arrow, pushed outward). */
  labelAnchor: Vec2;
  labelNormal: Vec2;
}

/**
 * Momentum arrow: a slim arrow following the edge at a lateral offset,
 * spanning the middle 40% of the edge. `side` +1 = visual left of travel.
 */
export function momentumArrow(path: Path, side: 1 | -1, dir: 1 | -1, m: Metrics): MomentumArrow {
  const L = path.length;
  const s0 = 0.3 * L;
  const s1 = 0.7 * L;
  const off = m.momentumSep;
  const knots = 12;
  const pts: Vec2[] = [];
  for (let i = 0; i <= knots; i++) {
    const s = s0 + ((s1 - s0) * i) / knots;
    const p = path.point(s);
    const n = path.normal(s);
    pts.push({ x: p.x + side * off * n.x, y: p.y + side * off * n.y });
  }
  if (dir === -1) pts.reverse();

  // Polyline for the shaft (ends slightly short of the head).
  let d = `M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`;

  // Small stealth head at the last point, along the local direction.
  const pEnd = pts[pts.length - 1]!;
  const pPrev = pts[pts.length - 2]!;
  const tl = Math.hypot(pEnd.x - pPrev.x, pEnd.y - pPrev.y) || 1;
  const t = { x: (pEnd.x - pPrev.x) / tl, y: (pEnd.y - pPrev.y) / tl };
  const n = { x: t.y, y: -t.x };
  const hl = 0.62 * m.arrowLength;
  const hw = 0.78 * hl;
  const back = { x: pEnd.x - hl * t.x, y: pEnd.y - hl * t.y };
  const left = { x: back.x + hw * n.x, y: back.y + hw * n.y };
  const right = { x: back.x - hw * n.x, y: back.y - hw * n.y };
  const mid = { x: back.x + 0.28 * hl * t.x, y: back.y + 0.28 * hl * t.y };
  const headD =
    `M${fmt(pEnd.x)} ${fmt(pEnd.y)}` +
    `L${fmt(left.x)} ${fmt(left.y)}` +
    `L${fmt(mid.x)} ${fmt(mid.y)}` +
    `L${fmt(right.x)} ${fmt(right.y)}Z`;

  const sMid = (s0 + s1) / 2;
  const pm = path.point(sMid);
  const nm = path.normal(sMid);
  return {
    d,
    headD,
    bounds: pts,
    labelAnchor: { x: pm.x + side * off * nm.x, y: pm.y + side * off * nm.y },
    labelNormal: { x: side * nm.x, y: side * nm.y },
  };
}
