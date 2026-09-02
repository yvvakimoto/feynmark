import { describe, expect, it } from 'vitest';
import { parse } from '../src/dsl/parser';
import { resolve } from '../src/model/resolve';
import { layoutDiagram } from '../src/layout/layout';
import { buildEdgeGeometries } from '../src/layout/edges';
import { choleskySolve } from '../src/layout/linsolve';

function lay(src: string) {
  const model = resolve(parse(src))!.diagrams[0]!;
  return { model, layout: layoutDiagram(model) };
}

describe('choleskySolve', () => {
  it('solves a hand-checked SPD system', () => {
    // A = [[4,1],[1,3]], b = [1,2]  =>  x = [1/11, 7/11]
    const x = choleskySolve(new Float64Array([4, 1, 1, 3]), new Float64Array([1, 2]), 2);
    expect(x[0]).toBeCloseTo(1 / 11, 10);
    expect(x[1]).toBeCloseTo(7 / 11, 10);
  });

  it('throws on singular systems', () => {
    expect(() => choleskySolve(new Float64Array([1, 1, 1, 1]), new Float64Array([1, 1]), 2)).toThrow(/singular/);
  });
});

describe('layoutDiagram', () => {
  it('pins externals and centers internals symmetrically (s-channel)', () => {
    const { layout } = lay(`diagram {
      in e1, e2; out m1, m2
      e1 -- [fermion] a -- [fermion] e2
      a -- [photon] b
      m2 -- [fermion] b -- [fermion] m1
    }`);
    const p = (id: string) => layout.positions.get(id)!;
    // Externals pinned on the left/right borders.
    expect(p('e1').x).toBeCloseTo(0, 6);
    expect(p('e2').x).toBeCloseTo(0, 6);
    expect(p('m1').x).toBeCloseTo(p('m2').x, 6);
    expect(p('m1').x).toBeGreaterThan(p('e1').x);
    // First declared leg on top (smaller screen y).
    expect(p('e1').y).toBeLessThan(p('e2').y);
    // Internal vertices sit on the horizontal center line, mirror-symmetric.
    const cy = (p('e1').y + p('e2').y) / 2;
    expect(p('a').y).toBeCloseTo(cy, 6);
    expect(p('b').y).toBeCloseTo(cy, 6);
    const width = p('m1').x - p('e1').x;
    expect(p('a').x - p('e1').x).toBeCloseTo(p('m1').x - p('b').x, 6);
    expect(p('a').x).toBeGreaterThan(0);
    expect(p('b').x - p('a').x).toBeGreaterThan(0);
    expect(width).toBeGreaterThan(0);
  });

  it('box diagram comes out fully symmetric', () => {
    const { layout } = lay(`diagram {
      in d, sb; out s, db
      d  -- [fermion] a -- [fermion] b -- [fermion] s
      sb -- [anti fermion] c -- [anti fermion] e -- [anti fermion] db
      a -- [boson] c
      b -- [boson] e
    }`);
    const p = (id: string) => layout.positions.get(id)!;
    // Up-down mirror: a/c (and the leg pair) are symmetric about the center line.
    expect(p('a').y + p('c').y).toBeCloseTo(p('d').y + p('sb').y, 4);
    expect(p('b').y).toBeCloseTo(p('a').y, 4);
    expect(p('a').x).toBeCloseTo(p('c').x, 4);
    expect(p('b').x).toBeCloseTo(p('e').x, 4);
    // Mirror symmetry left-right.
    const cx = (p('d').x + p('s').x) / 2;
    expect(cx - p('a').x).toBeCloseTo(p('b').x - cx, 4);
  });

  it('nudges the degenerate tadpole stem apart', () => {
    const { model, layout } = lay(`diagram {
      in p
      p -- [scalar] a
      a -- [scalar, loop=up] a
    }`);
    const p = layout.positions.get('p')!;
    const a = layout.positions.get('a')!;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    expect(d).toBeGreaterThan(1);
    // Loop geometry is a closed circle attached at `a`.
    const geoms = buildEdgeGeometries(model, layout);
    const loop = geoms.find((g) => g.edge.from === g.edge.to)!;
    const start = loop.path.start();
    const end = loop.path.end();
    expect(start.x).toBeCloseTo(a.x, 6);
    expect(start.y).toBeCloseTo(a.y, 6);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
    expect(loop.path.length).toBeGreaterThan(10);
  });

  it('respects explicit at() pins (y-up)', () => {
    const { layout } = lay(`diagram {
      vertex a at (0, 0); vertex b at (1, 1)
      a -- b
    }`);
    const a = layout.positions.get('a')!;
    const b = layout.positions.get('b')!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeLessThan(a.y); // y-up input => smaller screen y
  });

  it('errors when an internal vertex is unanchored', () => {
    expect(() => lay(`diagram { in a; a -- b; c -- d }`)).toThrow(/not connected/);
  });

  it('errors when nothing is pinned', () => {
    expect(() => lay(`diagram { a -- b }`)).toThrow(/no external legs/);
  });

  it('auto-fans parallel edges into a lens', () => {
    const { model, layout } = lay(`diagram {
      in g1; out g2
      g1 -- [photon] a
      a -- [fermion] b
      b -- [fermion] a
      b -- [photon] g2
    }`);
    const geoms = buildEdgeGeometries(model, layout);
    const pair = geoms.filter(
      (g) => (g.edge.from === 'a' && g.edge.to === 'b') || (g.edge.from === 'b' && g.edge.to === 'a'),
    );
    expect(pair).toHaveLength(2);
    // The two arcs bulge to opposite sides: their midpoints differ.
    const m0 = pair[0]!.path.point(pair[0]!.path.length / 2);
    const m1 = pair[1]!.path.point(pair[1]!.path.length / 2);
    expect(Math.hypot(m0.x - m1.x, m0.y - m1.y)).toBeGreaterThan(5);
  });
});
