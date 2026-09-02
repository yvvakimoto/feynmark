/** 2D geometry: vectors and the Path abstraction all stroke decorators use.
 *
 * All coordinates are SCREEN coordinates (y grows downward). The "left"
 * normal is the visual left of the direction of travel: N = (T.y, -T.x).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Visual-left normal of a unit tangent (screen coords). */
export const leftNormal = (t: Vec2): Vec2 => ({ x: t.y, y: -t.x });

/**
 * A parametric path with arclength access. `s` runs 0..length.
 * point/tangent/normal are exact (analytic) for lines and arcs.
 */
export interface Path {
  readonly length: number;
  point(s: number): Vec2;
  /** Unit tangent (direction of travel). */
  tangent(s: number): Vec2;
  /** Visual-left unit normal. */
  normal(s: number): Vec2;
  /** Sub-path from arclength s0 to s1 (0 <= s0 < s1 <= length). */
  slice(s0: number, s1: number): Path;
  /** Endpoints (convenience). */
  start(): Vec2;
  end(): Vec2;
}

export class LinePath implements Path {
  readonly length: number;
  private readonly a: Vec2;
  private readonly t: Vec2;

  constructor(a: Vec2, b: Vec2) {
    this.a = a;
    this.length = dist(a, b);
    this.t = this.length < 1e-12 ? vec(1, 0) : mul(sub(b, a), 1 / this.length);
  }

  point(s: number): Vec2 {
    return add(this.a, mul(this.t, s));
  }
  tangent(_s: number): Vec2 {
    return this.t;
  }
  normal(_s: number): Vec2 {
    return leftNormal(this.t);
  }
  slice(s0: number, s1: number): Path {
    return new LinePath(this.point(s0), this.point(s1));
  }
  start(): Vec2 {
    return this.a;
  }
  end(): Vec2 {
    return this.point(this.length);
  }
}

/**
 * Circular arc: center, radius, start angle, signed sweep (radians).
 * Positive sweep = increasing angle = clockwise on screen.
 */
export class ArcPath implements Path {
  readonly length: number;
  constructor(
    readonly center: Vec2,
    readonly radius: number,
    readonly theta0: number,
    readonly sweep: number,
  ) {
    this.length = Math.abs(sweep) * radius;
  }

  private theta(s: number): number {
    return this.theta0 + (s / this.length) * this.sweep;
  }

  point(s: number): Vec2 {
    const th = this.theta(s);
    return {
      x: this.center.x + this.radius * Math.cos(th),
      y: this.center.y + this.radius * Math.sin(th),
    };
  }

  tangent(s: number): Vec2 {
    const th = this.theta(s);
    const sgn = Math.sign(this.sweep) || 1;
    return { x: -Math.sin(th) * sgn, y: Math.cos(th) * sgn };
  }

  normal(s: number): Vec2 {
    return leftNormal(this.tangent(s));
  }

  slice(s0: number, s1: number): Path {
    const th0 = this.theta(s0);
    const th1 = this.theta(s1);
    return new ArcPath(this.center, this.radius, th0, th1 - th0);
  }

  start(): Vec2 {
    return this.point(0);
  }
  end(): Vec2 {
    return this.point(this.length);
  }
}

/**
 * Arc between two points with a tangent-chord angle `bendDeg` (positive bends
 * to the visual left of travel). |bendDeg| = 90 gives a half circle.
 */
export function arcBetween(a: Vec2, b: Vec2, bendDeg: number): Path {
  const alpha = (Math.abs(bendDeg) * Math.PI) / 180;
  if (alpha < 1e-6) return new LinePath(a, b);
  const L = dist(a, b);
  const t = mul(sub(b, a), 1 / L);
  const nLeft = leftNormal(t);
  const R = L / (2 * Math.sin(alpha));
  const mid = mul(add(a, b), 0.5);
  // Center sits opposite the bulge: distance (L/2)/tan(alpha) from the midpoint,
  // on the -nLeft side for a left bend (+nLeft for a right bend).
  const d = L / (2 * Math.tan(alpha));
  const side = bendDeg > 0 ? -1 : 1;
  const c = add(mid, mul(nLeft, side * d));
  const theta0 = Math.atan2(a.y - c.y, a.x - c.x);
  const sweep = (bendDeg > 0 ? 1 : -1) * 2 * alpha;
  return new ArcPath(c, R, theta0, sweep);
}

/**
 * Tadpole loop: a full circle tangent-attached at `v`, extending in unit
 * direction `dir` (screen coords). Travel starts heading to the visual right
 * of `dir`.
 */
export function loopAt(v: Vec2, dir: Vec2, radius: number): ArcPath {
  const center = add(v, mul(dir, radius));
  const theta0 = Math.atan2(v.y - center.y, v.x - center.x);
  // Sweep sign: choose so that initial travel direction is `dir` rotated -90°
  // (i.e. to the visual right of the loop direction).
  // Tangent at s=0 for sweep>0 is (-sin θ0, cos θ0).
  const right = { x: -dir.y, y: dir.x };
  const tPos = { x: -Math.sin(theta0), y: Math.cos(theta0) };
  const sweep = tPos.x * right.x + tPos.y * right.y > 0 ? 2 * Math.PI : -2 * Math.PI;
  return new ArcPath(center, radius, theta0, sweep);
}
