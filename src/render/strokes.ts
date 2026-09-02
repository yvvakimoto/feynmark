/**
 * Propagator stroke generation. Every decorated stroke is emitted as a smooth
 * cubic-Bézier path (Catmull-Rom through analytic samples), so curves stay
 * crisp at any zoom. Waves and coils are quantized to integer period counts
 * and land on the vertices at zero phase — no half-wave stubs.
 */
import { ArcPath, LinePath, type Path, type Vec2 } from '../layout/geometry';
import type { Metrics } from './theme';

export interface Stroke {
  /** SVG path `d` strings (double lines emit two). */
  ds: string[];
  dasharray?: string;
  /** Points touched by the ink, for bounding-box computation. */
  bounds: Vec2[];
  /** Round linecap looks right for waves/coils; butt for dashes. */
  linecap: 'round' | 'butt';
  /** Stroke-width multiplier (dotted ghosts need fatter dots to read). */
  widthScale?: number;
}

const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Catmull-Rom (centripetal-ish, uniform) → cubic Bézier path. */
export function smoothPathD(pts: Vec2[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}L${fmt(pts[1]!.x)} ${fmt(pts[1]!.y)}`;
  let d = `M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

/** SVG `d` for an undecorated base path (exact primitives, not samples). */
export function basePathD(path: Path): string {
  if (path instanceof ArcPath) {
    const a = path.start();
    const sweepAbs = Math.abs(path.sweep);
    const sf = path.sweep > 0 ? 1 : 0;
    const r = fmt(path.radius);
    if (sweepAbs > 1.99 * Math.PI) {
      // Full circle: two half arcs.
      const m = path.point(path.length / 2);
      return (
        `M${fmt(a.x)} ${fmt(a.y)}` +
        `A${r} ${r} 0 0 ${sf} ${fmt(m.x)} ${fmt(m.y)}` +
        `A${r} ${r} 0 0 ${sf} ${fmt(a.x)} ${fmt(a.y)}`
      );
    }
    const b = path.end();
    const laf = sweepAbs > Math.PI ? 1 : 0;
    return `M${fmt(a.x)} ${fmt(a.y)}A${r} ${r} 0 ${laf} ${sf} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  const a = path.start();
  const b = path.end();
  return `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`;
}

function samplePath(path: Path, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) pts.push(path.point((path.length * i) / n));
  return pts;
}

/** smoothstep envelope, 1 in the middle, 0 at both ends over `edge` widths. */
function envelope(t: number, edge: number): number {
  const rise = (x: number): number => {
    const u = Math.min(1, Math.max(0, x));
    return u * u * (3 - 2 * u);
  };
  return rise(t / edge) * rise((1 - t) / edge);
}

export function plainStroke(path: Path): Stroke {
  return { ds: [basePathD(path)], bounds: samplePath(path, 24), linecap: 'round' };
}

/** Sine wave with an integer number of half-periods, zero phase at both ends. */
export function waveStroke(path: Path, m: Metrics, doubled = false): Stroke {
  const L = path.length;
  let halfPeriods = Math.max(3, Math.round((2 * L) / m.wavelength));
  const A = m.waveAmplitude;

  let sign = 1;
  if (path instanceof ArcPath) {
    // Phase-align so the apex carries an OUTWARD crest: an even count puts a
    // zero-crossing at the top, and an odd count can point its apex crest
    // inward. Force odd, then flip the wave so the crest at s = L/2 points
    // away from the arc center.
    if (halfPeriods % 2 === 0) halfPeriods += 1;
    const outward = path.sweep > 0 ? 1 : -1; // left bend: the left normal faces outward
    const apex = Math.sin((Math.PI * halfPeriods) / 2); // ±1 for odd counts
    sign = outward * apex;
  }

  const knots = halfPeriods * 8;
  const build = (s0: number): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= knots; i++) {
      const s = (L * i) / knots;
      const p = path.point(s);
      const n = path.normal(s);
      const off = s0 * A * Math.sin((Math.PI * halfPeriods * s) / L);
      pts.push({ x: p.x + off * n.x, y: p.y + off * n.y });
    }
    return pts;
  };
  const up = build(sign);
  if (!doubled) return { ds: [smoothPathD(up)], bounds: up, linecap: 'round' };
  const down = build(-sign);
  return { ds: [smoothPathD(up), smoothPathD(down)], bounds: [...up, ...down], linecap: 'round' };
}

/**
 * Gluon coil (prolate cycloid). Loops appear because the pen over-advances
 * along the path each cycle; amplitude and over-advance taper to zero over
 * the first/last half-coil so the stroke lands exactly on the vertices.
 */
export function coilStroke(path: Path, m: Metrics): Stroke {
  const L = path.length;
  const coils = Math.max(3, Math.round(L / m.coilWavelength));
  const A = m.coilAmplitude;
  const total = 2 * Math.PI * coils;
  const c = L / total;
  const B = 1.7 * c;
  const knots = coils * 16;
  const pts: Vec2[] = [];
  for (let i = 0; i <= knots; i++) {
    const th = (total * i) / knots;
    const env = envelope(th / total, 0.5 / coils);
    const u = Math.min(L, Math.max(0, c * th + env * B * Math.sin(th)));
    const p = path.point(u);
    const n = path.normal(u);
    const off = env * A * Math.cos(th);
    pts.push({ x: p.x + off * n.x, y: p.y + off * n.y });
  }
  return { ds: [smoothPathD(pts)], bounds: pts, linecap: 'round' };
}

/** Dashed stroke; dash length adjusted so both ends are dashes. */
export function dashedStroke(path: Path, m: Metrics): Stroke {
  const L = path.length;
  const n = Math.max(1, Math.round(L / m.dashPeriod - 0.5));
  const dash = L / (2 * n + 1);
  return {
    ds: [basePathD(path)],
    dasharray: `${fmt(dash)} ${fmt(dash)}`,
    bounds: samplePath(path, 24),
    linecap: 'butt',
  };
}

/** Dotted (ghost) stroke; gap adjusted so both ends are dots. */
export function dottedStroke(path: Path, m: Metrics): Stroke {
  const L = path.length;
  const n = Math.max(2, Math.round(L / m.dotGap));
  const gap = L / n;
  return {
    ds: [basePathD(path)],
    dasharray: `0.01 ${fmt(gap)}`,
    bounds: samplePath(path, 24),
    linecap: 'round',
    // A round cap on a zero-length dash draws a dot of one stroke-width;
    // fatten it so the dots carry the same visual weight as a thin line.
    widthScale: 1.8,
  };
}

/** Two parallel lines offset ±sep/2 along the normal (curvature-aware). */
export function doubleStroke(path: Path, m: Metrics): Stroke {
  const off = m.doubleSep / 2;
  const build = (sign: number): Vec2[] => {
    if (path instanceof LinePath) {
      const n = path.normal(0);
      const a = path.start();
      const b = path.end();
      return [
        { x: a.x + sign * off * n.x, y: a.y + sign * off * n.y },
        { x: b.x + sign * off * n.x, y: b.y + sign * off * n.y },
      ];
    }
    const knots = 32;
    const pts: Vec2[] = [];
    for (let i = 0; i <= knots; i++) {
      const s = (path.length * i) / knots;
      const p = path.point(s);
      const n = path.normal(s);
      pts.push({ x: p.x + sign * off * n.x, y: p.y + sign * off * n.y });
    }
    return pts;
  };
  const a = build(1);
  const b = build(-1);
  return { ds: [smoothPathD(a), smoothPathD(b)], bounds: [...a, ...b], linecap: 'round' };
}
