/**
 * Hadron brackets: the curly brace (or parenthesis) drawn alongside a group of
 * vertices, as in three quark lines gathered under a `p`. Geometry only —
 * braces never influence the layout, they are placed around whatever the
 * layout produced.
 */
import type { BraceShape, BraceSide } from '../model/model';
import type { Vec2 } from '../layout/geometry';
import type { Metrics } from './theme';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BraceGeometry {
  d: string;
  /** Corners of the band the bracket occupies (for the diagram bounding box). */
  bounds: Vec2[];
  /** Point just outside the bracket tip where its label is anchored. */
  labelAnchor: Vec2;
  /** Outward unit normal — the direction the label may retreat along. */
  labelNormal: Vec2;
}

const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

interface Frame {
  /** Origin of the local frame: the start of the span, on the arm plane. */
  o: Vec2;
  /** Unit vector along the span. */
  u: Vec2;
  /** Unit vector pointing away from the bracketed content. */
  n: Vec2;
  /** Span length. */
  L: number;
}

/**
 * Local frame for one side. `d` runs from 0 at the arm plane (nearest the
 * content) to `depth` at the tip, so the same path code serves all four sides.
 */
function frameFor(box: Box, side: BraceSide, gap: number, pad: number): Frame {
  switch (side) {
    case 'left':
      return {
        o: { x: box.minX - gap, y: box.minY - pad },
        u: { x: 0, y: 1 },
        n: { x: -1, y: 0 },
        L: box.maxY - box.minY + 2 * pad,
      };
    case 'right':
      return {
        o: { x: box.maxX + gap, y: box.minY - pad },
        u: { x: 0, y: 1 },
        n: { x: 1, y: 0 },
        L: box.maxY - box.minY + 2 * pad,
      };
    case 'top':
      return {
        o: { x: box.minX - pad, y: box.minY - gap },
        u: { x: 1, y: 0 },
        n: { x: 0, y: -1 },
        L: box.maxX - box.minX + 2 * pad,
      };
    case 'bottom':
      return {
        o: { x: box.minX - pad, y: box.maxY + gap },
        u: { x: 1, y: 0 },
        n: { x: 0, y: 1 },
        L: box.maxX - box.minX + 2 * pad,
      };
  }
}

/** Bracket path and label anchor for a group whose ink spans `box`. */
export function braceGeometry(box: Box, side: BraceSide, shape: BraceShape, m: Metrics): BraceGeometry {
  const gap = m.labelSep * 0.8;
  const pad = m.labelSep * 0.5;
  const w = m.braceDepth;
  const { o, u, n, L } = frameFor(box, side, gap, pad);

  const at = (t: number, d: number): Vec2 => ({
    x: o.x + u.x * t + n.x * d,
    y: o.y + u.y * t + n.y * d,
  });
  const P = (t: number, d: number): string => {
    const p = at(t, d);
    return `${fmt(p.x)},${fmt(p.y)}`;
  };

  let d: string;
  if (shape === 'paren') {
    // One quadratic: the control at 2w puts the apex of the arc at depth w.
    d = `M${P(0, 0)}Q${P(L / 2, 2 * w)} ${P(L, 0)}`;
  } else {
    // Curly brace: arm tip -> spine -> central cusp -> spine -> arm tip.
    // Each arm tip points at the content (tangent along n) and its shoulder
    // rounds outward into the spine, meeting it tangentially — a quarter arc
    // centred on the arm plane. The cusp mirrors that shape at depth w.
    const h = w / 2;
    const r = Math.min(w, L / 4);
    d =
      `M${P(0, 0)}` +
      `C${P(0, h * 0.55)} ${P(r * 0.45, h)} ${P(r, h)}` +
      `L${P(L / 2 - r, h)}` +
      `C${P(L / 2 - r * 0.45, h)} ${P(L / 2, w * 0.55)} ${P(L / 2, w)}` +
      `C${P(L / 2, w * 0.55)} ${P(L / 2 + r * 0.45, h)} ${P(L / 2 + r, h)}` +
      `L${P(L - r, h)}` +
      `C${P(L - r * 0.45, h)} ${P(L, h * 0.55)} ${P(L, 0)}`;
  }

  return {
    d,
    bounds: [at(0, 0), at(L, 0), at(0, w), at(L, w)],
    labelAnchor: at(L / 2, w + m.labelSep),
    labelNormal: n,
  };
}
