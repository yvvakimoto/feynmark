import { describe, expect, it } from 'vitest';
import { render } from '../src/index';

const TREE = `
diagram tree {
  in  e1: $e^-$,  e2: $e^+$
  out m1: $\\mu^-$, m2: $\\mu^+$
  e1 -- [fermion] a -- [fermion] e2
  a  -- [photon, momentum=$q$] b
  m2 -- [fermion] b -- [fermion] m1
}
`;

describe('renderDiagram (string pipeline, heuristic measurer)', () => {
  it('produces a self-contained SVG with expected structure', () => {
    const [r] = render(TREE, { katex: null });
    expect(r).toBeDefined();
    const svg = r!.svg;
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('class="feynmark"');
    // 5 propagators: 4 fermions + 1 photon
    expect(count(svg, 'fm-fermion')).toBe(4);
    expect(count(svg, 'fm-photon')).toBe(1);
    // 4 fermion arrows + momentum head + shaft
    expect(count(svg, 'fm-arrow')).toBe(4);
    expect(count(svg, 'fm-momentum')).toBeGreaterThanOrEqual(2);
    // 4 external labels + 1 momentum label (as <text> fallback without KaTeX)
    expect(count(svg, '<text')).toBe(5);
    expect(r!.width).toBeGreaterThan(100);
    expect(r!.height).toBeGreaterThan(50);
    expect(r!.anchorFraction).toBeGreaterThan(0.2);
    expect(r!.anchorFraction).toBeLessThan(0.8);
  });

  it('renders every propagator style without error', () => {
    const styles = [
      'plain',
      'fermion',
      'anti fermion',
      'scalar',
      'charged scalar',
      'ghost',
      'photon',
      'boson',
      'gluon',
      'double',
      'majorana',
      'anti majorana',
      'graviton',
    ];
    for (const s of styles) {
      const [r] = render(`diagram { in a; out b; a -- [${s}] b }`, { katex: null });
      expect(r!.svg).toContain(`fm-${s.replace(/ /g, '-')}`);
    }
  });

  it('renders vertex glyphs with propagator trimming', () => {
    const [r] = render(
      `diagram {
        in a; out b
        vertex v [blob]
        a -- [fermion] v -- [fermion] b
      }`,
      { katex: null },
    );
    expect(r!.svg).toContain('fm-blob');
    expect(r!.svg).toContain('-hatch');
  });

  it('renders crosses and squares', () => {
    const [r] = render(
      `diagram { in a; out b; vertex x [cross]; a -- x -- b }`,
      { katex: null },
    );
    expect(r!.svg).toContain('fm-cross');
  });

  it('majorana carries two opposing arrows', () => {
    const [r] = render(`diagram { in a; out b; a -- [majorana] b }`, { katex: null });
    expect(count(r!.svg, 'fm-arrow')).toBe(2);
  });

  it('explicit arrow= overrides the majorana default', () => {
    const [none] = render(`diagram { in a; out b; a -- [majorana, arrow=none] b }`, { katex: null });
    expect(count(none!.svg, 'fm-arrow')).toBe(0);
    const [fwd] = render(`diagram { in a; out b; a -- [majorana, arrow=forward] b }`, { katex: null });
    expect(count(fwd!.svg, 'fm-arrow')).toBe(1);
  });

  it('tadpole renders a closed loop', () => {
    const [r] = render(`diagram { in p: $\\phi$; p -- [scalar] a; a -- [scalar, loop=up] a }`, {
      katex: null,
    });
    expect(count(r!.svg, 'fm-scalar')).toBe(2);
  });

  it('bubble diagram with two half bends renders both arcs', () => {
    const [r] = render(
      `diagram {
        in g1: $\\gamma$; out g2: $\\gamma$
        g1 -- [photon] a
        a -- [fermion, half left] b
        b -- [fermion, half left] a
        b -- [photon] g2
      }`,
      { katex: null },
    );
    expect(count(r!.svg, 'fm-fermion')).toBe(2);
  });

  it('draws hadron brackets and widens the diagram for them', () => {
    const body = `
      in u1, d1, d2
      out o1, o2
      u1 -- o1; d1 -- o1; d2 -- o2`;
    const plain = render(`diagram {${body}
}`, { katex: null })[0]!;
    const braced = render(`diagram {${body}
brace [label=$p$] u1, d1, d2
}`, { katex: null })[0]!;
    expect(count(plain.svg, 'class="fm-brace"')).toBe(0);
    expect(count(braced.svg, 'class="fm-brace"')).toBe(1);
    expect(count(braced.svg, 'fm-brace-label')).toBe(1);
    // The bracket and its label claim room to the left of the group.
    expect(braced.width).toBeGreaterThan(plain.width);
  });

  it('pushes the bracket clear of the members own labels', () => {
    const src = (legs: string): string =>
      `diagram {
        in ${legs}
        out o
        a -- o; b -- o
        brace a, b
      }`;
    const bare = render(src('a, b'), { katex: null })[0]!.svg;
    const labelled = render(src('a: $u$, b: $d$'), { katex: null })[0]!.svg;
    expect(braceMinX(labelled)).toBeLessThan(braceMinX(bare));
  });

  it('uses one quadratic for a paren and cubics for a curly brace', () => {
    const src = (shape: string): string =>
      `diagram { in a, b; out o; a -- o; b -- o; brace [${shape}] a, b }`;
    const paren = bracePathOf(render(src('paren'), { katex: null })[0]!.svg);
    const curly = bracePathOf(render(src('left'), { katex: null })[0]!.svg);
    expect(count(paren, 'Q')).toBe(1);
    expect(count(paren, 'C')).toBe(0);
    // arm -> spine, spine -> cusp, cusp -> spine, spine -> arm
    expect(count(curly, 'C')).toBe(4);
    expect(count(curly, 'Q')).toBe(0);
  });

  it('points each curly-brace tip at the content and joins the spine tangentially', () => {
    // Left-side bracket: the span runs along y, depth along x. The tip cubic must
    // leave the tip along the depth (same y as the tip) and arrive at the spine
    // along the span (same x as the spine), or the shoulder bulges the wrong way.
    const svg = render(`diagram { in a, b; out o; a -- o; b -- o; brace [left] a, b }`, { katex: null })[0]!.svg;
    const nums = bracePathOf(svg).match(/-?[\d.]+/g)!.map(Number);
    // M x0 y0 C c1x c1y c2x c2y x1 y1 ...
    const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = nums;
    expect(c1y).toBeCloseTo(y0!, 5);
    expect(c1x).not.toBeCloseTo(x0!, 5);
    expect(c2x).toBeCloseTo(x1!, 5);
    expect(c2y).not.toBeCloseTo(y1!, 5);
    // Symmetric at the far end: the last cubic's second control shares y with the tip.
    const n = nums.length;
    const [ex, ey, kx, ky] = [nums[n - 2], nums[n - 1], nums[n - 4], nums[n - 3]];
    expect(ky).toBeCloseTo(ey!, 5);
    expect(kx).not.toBeCloseTo(ex!, 5);
  });

  it('honors baseline for the equation anchor', () => {
    const [r] = render(
      `diagram [baseline=a] {
        in i1, i2
        i1 -- a; i2 -- a; a -- [photon] o at (1.5, 0.9)
      }`,
      { katex: null },
    );
    expect(r!.anchorFraction).toBeGreaterThanOrEqual(0);
    expect(r!.anchorFraction).toBeLessThanOrEqual(1);
  });
});

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

function bracePathOf(svg: string): string {
  const m = /class="fm-brace" d="([^"]+)"/.exec(svg);
  if (!m) throw new Error('no brace path in the SVG');
  return m[1]!;
}

/** Leftmost x touched by the bracket path. */
function braceMinX(svg: string): number {
  const coords = [...bracePathOf(svg).matchAll(/(-?[\d.]+),(-?[\d.]+)/g)];
  return Math.min(...coords.map((c) => Number(c[1])));
}
