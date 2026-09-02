// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import katex from 'katex';
import { config, initialize } from '../../src/config';
import { run, renderInto } from '../../src/autoinit';
import { HeuristicLabelMeasurer } from '../../src/render/labels';

const TREE = `
diagram tree {
  in  e1: $e^-$,  e2: $e^+$
  out m1: $\\mu^-$, m2: $\\mu^+$
  e1 -- [fermion] a -- [fermion] e2
  a  -- [photon] b
  m2 -- [fermion] b -- [fermion] m1
}
`;

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  initialize({ katex: undefined, startOnLoad: true, scale: 1, selectors: [] });
});

describe('autoinit.run', () => {
  it('replaces pre>code.language-feynman blocks with rendered SVG', () => {
    document.body.innerHTML = `<pre><code class="language-feynman">${TREE}</code></pre>`;
    initialize({ katex: null });
    run();
    expect(document.querySelector('pre')).toBeNull();
    const container = document.querySelector('.feynmark-container')!;
    expect(container).not.toBeNull();
    expect(container.querySelectorAll('svg.feynmark')).toHaveLength(1);
    expect(document.getElementById('feynmark-style')).not.toBeNull();
  });

  it('renders parse errors as inline error boxes without throwing', () => {
    document.body.innerHTML = `<pre><code class="language-feynman">diagram { a ==> b }</code></pre>`;
    run();
    const box = document.querySelector('.feynmark-error')!;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('feynmark:');
    expect(box.textContent).toMatch(/line/);
  });

  it('does not process the same node twice', () => {
    document.body.innerHTML = `<div class="feynman">diagram { in a; out b; a -- b }</div>`;
    run();
    run();
    expect(document.querySelectorAll('.feynmark-container')).toHaveLength(1);
  });
});

describe('equation embedding', () => {
  it('hides referenced diagrams and inlines them into the KaTeX equation', () => {
    initialize({ katex });
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderInto(
      container,
      `
diagram lo { in a; out b; a -- [photon] b }
equation amp { i\\mathcal{M} = @lo + \\mathcal{O}(\\alpha^2) }
`,
    );
    // The diagram is only inside the equation, not standalone.
    expect(container.querySelectorAll('.feynmark-diagram')).toHaveLength(0);
    const eq = container.querySelector('.feynmark-equation')!;
    expect(eq).not.toBeNull();
    expect(eq.querySelector('.katex')).not.toBeNull();
    // The slot exists and contains the SVG overlay.
    const slot = eq.querySelector('[class*="fm-slot-"]')!;
    expect(slot).not.toBeNull();
    expect(slot.querySelector('svg')).not.toBeNull();
    // The sizing rule is kept (spacing) but hidden.
    const rule = slot.querySelector('.rule') as HTMLElement;
    expect(rule).not.toBeNull();
    expect(rule.style.visibility).toBe('hidden');
  });

  it('falls back to plain flow without KaTeX', () => {
    initialize({ katex: null });
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderInto(container, `diagram lo { in a; out b; a -- b }\nequation { M = @lo }`);
    const eq = container.querySelector('.feynmark-equation-plain')!;
    expect(eq).not.toBeNull();
    expect(eq.querySelector('svg')).not.toBeNull();
  });
});

describe('labels with KaTeX (foreignObject)', () => {
  it('embeds KaTeX HTML inside foreignObject', () => {
    initialize({ katex });
    const container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom has no layout: use the heuristic measurer through renderInto by
    // rendering via the string API instead.
    void new HeuristicLabelMeasurer();
    renderInto(container, TREE);
    const svg = container.querySelector('svg.feynmark')!;
    expect(svg.querySelectorAll('foreignObject').length).toBeGreaterThanOrEqual(4);
    expect(svg.querySelector('foreignObject .katex')).not.toBeNull();
  });
});

describe('config', () => {
  it('initialize merges settings', () => {
    initialize({ scale: 2 });
    expect(config.scale).toBe(2);
  });
});
