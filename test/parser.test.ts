import { describe, expect, it } from 'vitest';
import { parse } from '../src/dsl/parser';
import { resolve } from '../src/model/resolve';
import { FeynmarkError } from '../src/errors';

const TREE = `
diagram tree {
  in  e1: $e^-$,  e2: $e^+$
  out m1: $\\mu^-$, m2: $\\mu^+$
  e1 -- [fermion] a -- [fermion] e2
  a  -- [photon, momentum=$q$] b
  m2 -- [fermion] b -- [fermion] m1
}
`;

describe('parser', () => {
  it('parses the QED tree example', () => {
    const doc = parse(TREE);
    expect(doc.blocks).toHaveLength(1);
    const d = doc.blocks[0]!;
    expect(d.kind).toBe('diagram');
    if (d.kind !== 'diagram') return;
    expect(d.name).toBe('tree');
    expect(d.stmts).toHaveLength(5);
    const chain = d.stmts[2]!;
    expect(chain.kind).toBe('chain');
    if (chain.kind !== 'chain') return;
    expect(chain.nodes.map((n) => n.name)).toEqual(['e1', 'a', 'e2']);
    expect(chain.edges[0]![0]!.key).toBe('fermion');
  });

  it('parses multi-word attribute keys and primes', () => {
    const doc = parse(`diagram { a -- [anti fermion, label'=$e$, bend left=45] b }`);
    const d = doc.blocks[0]!;
    if (d.kind !== 'diagram') throw new Error('expected diagram');
    const chain = d.stmts[0]!;
    if (chain.kind !== 'chain') throw new Error('expected chain');
    const attrs = chain.edges[0]!;
    expect(attrs[0]!.key).toBe('anti fermion');
    expect(attrs[1]!.key).toBe('label');
    expect(attrs[1]!.prime).toBe(true);
    expect(attrs[2]!.key).toBe('bend left');
    expect(attrs[2]!.value).toBe(45);
  });

  it('parses equation blocks with balanced TeX braces', () => {
    const doc = parse(`
diagram lo { in a; out b; a -- [photon] b }
equation amp { i\\mathcal{M} = @lo + \\mathcal{O}(\\alpha^2) }
`);
    expect(doc.blocks).toHaveLength(2);
    const eq = doc.blocks[1]!;
    expect(eq.kind).toBe('equation');
    if (eq.kind !== 'equation') return;
    expect(eq.tex).toContain('\\mathcal{M}');
    expect(eq.tex).toContain('@lo');
  });

  it('supports comments and semicolon separators', () => {
    const doc = parse(`diagram { % comment
      in a; out b // trailing
      a -- b
    }`);
    const d = doc.blocks[0]!;
    if (d.kind !== 'diagram') throw new Error('expected diagram');
    expect(d.stmts).toHaveLength(3);
  });

  it('parses explicit coordinates', () => {
    const doc = parse(`diagram { vertex v [dot] at (0.5, -0.25); v -- w at (1, 2) }`);
    const d = doc.blocks[0]!;
    if (d.kind !== 'diagram') throw new Error('expected diagram');
    const vd = d.stmts[0]!;
    if (vd.kind !== 'vertex') throw new Error('expected vertex');
    expect(vd.at).toEqual({ x: 0.5, y: -0.25 });
  });

  it('reports position on errors', () => {
    try {
      parse(`diagram {\n  a == b\n}`);
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FeynmarkError);
      expect((e as FeynmarkError).loc?.line).toBe(2);
    }
  });

  it('rejects unclosed math', () => {
    expect(() => parse(`diagram { a -- [label=$x] b }`)).toThrow(/unclosed/);
  });
});

describe('resolver', () => {
  it('resolves styles, arrows, and implicit vertices', () => {
    const model = resolve(parse(TREE));
    const d = model.diagrams[0]!;
    expect(d.vertices.size).toBe(6);
    expect(d.vertices.get('a')!.external).toBeUndefined();
    expect(d.vertices.get('e1')!.external).toBe('in');
    const photon = d.edges.find((e) => e.style === 'photon')!;
    expect(photon.arrow).toBe('none');
    expect(photon.momentum?.tex).toBe('q');
    const f = d.edges.find((e) => e.style === 'fermion')!;
    expect(f.arrow).toBe('forward');
  });

  it('maps quarter/half shorthands to bends', () => {
    const model = resolve(parse(`diagram { in a; out b
      a -- [fermion, half left] c -- [fermion, quarter right] b }`));
    expect(model.diagrams[0]!.edges[0]!.bend).toBe(90);
    expect(model.diagrams[0]!.edges[1]!.bend).toBe(-45);
  });

  it('marks self-edges as loops', () => {
    const model = resolve(parse(`diagram { in p; p -- a; a -- [scalar, loop=up] a }`));
    const loop = model.diagrams[0]!.edges[1]!;
    expect(loop.loop).toBe('up');
  });

  it('rejects unknown styles and duplicate names', () => {
    expect(() => resolve(parse(`diagram { in a; out b; a -- [wibble] b }`))).toThrow(/unknown edge attribute/);
    expect(() => resolve(parse(`diagram x { in a; out b; a--b }\ndiagram x { in a; out b; a--b }`))).toThrow(
      /duplicate/,
    );
  });

  it('rejects equations referencing unknown diagrams', () => {
    expect(() => resolve(parse(`diagram d { in a; out b; a--b }\nequation { @nope }`))).toThrow(/unknown diagram/);
  });

  it('applies mom dir and pos regardless of attribute order', () => {
    const model = resolve(parse(
      `diagram { in a; out b; a -- [mom dir=back, momentum=$q$, pos=0.3, label=$x$] b }`,
    ));
    const e = model.diagrams[0]!.edges[0]!;
    expect(e.momentum?.dir).toBe(-1);
    expect(e.label?.pos).toBe(0.3);
  });

  it('rejects mom dir / pos without their targets', () => {
    expect(() => resolve(parse(`diagram { in a; out b; a -- [mom dir=back] b }`))).toThrow(
      /requires 'momentum'/,
    );
    expect(() => resolve(parse(`diagram { in a; out b; a -- [pos=0.3] b }`))).toThrow(/requires 'label'/);
  });

  it('rejects bends of 180 degrees or more', () => {
    expect(() => resolve(parse(`diagram { in a; out b; a -- [bend left=180] b }`))).toThrow(/180/);
    expect(() => resolve(parse(`diagram { in a; out b; a -- [bend right=200] b }`))).toThrow(/180/);
    // Boundary: 179 is still a valid (major) arc.
    const model = resolve(parse(`diagram { in a; out b; a -- [bend left=179] b }`));
    expect(model.diagrams[0]!.edges[0]!.bend).toBe(179);
  });

  it('rejects colors outside CSS color syntax', () => {
    expect(() =>
      resolve(parse(`diagram { in a; out b; a -- [color="red;fill:blue"] b }`)),
    ).toThrow(/invalid color/);
    const model = resolve(parse(`diagram { in a; out b; a -- [color="rgb(200, 30, 30)"] b }`));
    expect(model.diagrams[0]!.edges[0]!.color).toBe('rgb(200, 30, 30)');
  });
});
