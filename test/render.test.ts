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
