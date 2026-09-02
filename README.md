# feynmark

**Declarative Feynman diagrams for the web, Mermaid-style.**

[![CI](https://github.com/yvvakimoto/feynmark/actions/workflows/ci.yml/badge.svg)](https://github.com/yvvakimoto/feynmark/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Write a TikZ-Feynman-flavored DSL in a markdown code block; feynmark renders it
as publication-quality SVG in the browser — with KaTeX labels, automatic
layout, and diagrams that can appear *as terms inside equations*.

```feynman
diagram tree {
  in  e1: $e^-$,  e2: $e^+$
  out m1: $\mu^-$, m2: $\mu^+$
  e1 -- [fermion] a -- [fermion] e2
  a  -- [photon, momentum=$q$] b
  m2 -- [fermion] b -- [fermion] m1
}
```

**[Overview](https://yvvakimoto.github.io/feynmark/) ·
[Live editor](https://yvvakimoto.github.io/feynmark/editor.html) ·
[Gallery](https://yvvakimoto.github.io/feynmark/gallery.html)**

## Quick start (CDN)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/yvvakimoto/feynmark@v0.1.0/cdn/feynmark.min.js"></script>
```

On `DOMContentLoaded`, feynmark scans the page for

- `pre > code.language-feynman` (what markdown renderers emit for ` ```feynman ` blocks),
- `div.feynman`, and `[data-feynman]`

and replaces each with its rendered diagrams.

### Versions

feynmark is distributed through jsDelivr's GitHub endpoint, which serves the
tagged commit directly from this repository — there is no package registry in
the path, which is why [`cdn/`](cdn/) is the one build output that *is*
committed.

| URL | resolves to |
| --- | --- |
| `.../feynmark@v0.1.0/cdn/feynmark.min.js` | exactly that release — **use this in production** |
| `.../feynmark@0.1/cdn/feynmark.min.js` | the newest `0.1.x` tag |
| `.../feynmark@main/cdn/feynmark.min.js` | whatever is on `main` (cached ~12 h; don't ship this) |

Not on npm: `npm install feynmark` does not work yet. To use feynmark from a
bundler today, clone the repo and `npm run build`, then import from `dist/`.

```js
import { render, renderInto, initialize, run } from './feynmark/dist/index.js';

// String pipeline (no DOM):
const [diagram] = render(source);
console.log(diagram.svg);

// Or mermaid-style page scanning:
initialize({ scale: 1.2 });
run();
```

### KaTeX

KaTeX is an **optional peer dependency**. feynmark never imports it; at render
time it uses the instance you pass in `RenderOptions.katex`, else the global
`window.katex`, and falls back to plain italic `<text>` when neither is present
(pass `katex: null` to force that fallback).

feynmark ships no KaTeX CSS. **Loading `katex.min.css` is the host page's job** —
without it, the `<foreignObject>` labels render unstyled. The library's own
`STYLESHEET` only defines the `.feynmark*` classes and is injected automatically
by `renderInto` / `run`.

## Syntax

A code block holds one or more `diagram` / `equation` blocks.

```feynman
diagram <name>? [<options>]? {
  in  a: $e^-$, b        % external legs entering from the left
  out c, d: $\mu^+$      % external legs exiting to the right
  vertex v [blob]        % optional vertex declarations
  a -- [fermion] v -- [photon, momentum=$q$] c   % edge chains
  brace [label=$p$] a, b % bracket a group of lines as one hadron
}

equation <name>? [height=6]? {
  i\mathcal{M} = @tree + @loop + \mathcal{O}(\alpha^2)
}
```

- Statements end at a newline or `;`. Chains may wrap after `--`.
- Comments: `%` or `//` to end of line.
- Unknown identifiers in a chain implicitly create internal vertices.
- `@name` inside an `equation` embeds that diagram as a term, centered on the
  math axis (set `baseline=<vertex>` on the diagram to pick the anchor line).

### Propagator styles

| style | rendering |
| --- | --- |
| `fermion` / `anti fermion` | solid line, mid arrow (reversed for anti) |
| `plain` | solid line, no arrow |
| `scalar` / `charged scalar` | dashed (arrow for charged) |
| `ghost` | dotted |
| `photon` / `boson` | sine wave |
| `gluon` | coil |
| `double` | double line |
| `majorana` / `anti majorana` | double line, opposing arrows |
| `graviton` | braided double wave |

### Edge attributes

| attribute | meaning |
| --- | --- |
| `label=$..$` / `label'=$..$` | particle label, left / right of travel direction |
| `momentum=$..$` / `momentum'=$..$` | momentum arrow with label; `mom dir=back` reverses |
| `arrow=forward\|back\|none\|both` | override the arrow implied by the style |
| `bend left`/`bend right` (`=deg`) | circular-arc edge (default 30°) |
| `quarter left/right`, `half left/right` | 45° / 90° arcs (two `half` edges make a circle) |
| `loop=up\|down\|left\|right` | tadpole self-loop direction (on `a -- a`) |
| `tension=n` | layout spring weight (lower = longer) |
| `color=...`, `width=n` | stroke overrides |

### Vertex attributes

`dot`, `blob` (`blob=shade`), `cross` (counterterm ⊗), `square`,
`label=$..$`, `size=n`, and `at (x, y)` for explicit placement (y-up).

### Hadron brackets

`brace [<attrs>] v1, v2, ...` draws a bracket alongside a group of vertices —
the hadron idiom, where three tight quark lines are gathered under a `p`.

```feynman
diagram betaquark {
  in  u1, d1, d2
  out u2, d3, u3, ne: $ar
u_e$, e: $e^-$
  ...
  brace [label=$n$] u1, d1, d2
  brace [label=$p$] u2, d3, u3
}
```

| attribute | meaning |
| --- | --- |
| `left`, `right`, `top`, `bottom` | which side of the group to bracket |
| `paren` | draw `(` instead of the default `{` |
| `label=$..$` | label placed outside the bracket tip |

The side defaults to the edge the members sit on: a group of `out` legs
brackets on the right, anything else on the left. Brackets are decoration —
they never move a vertex — but they do claim room, and each one is placed clear
of its own members' labels, so `brace` on labelled legs pushes out far enough to
sit outside them. A bracket needs at least two vertices, and every member must
already appear in the diagram.

### Diagram options

`direction=right|left|down|up`, `scale=n`, `baseline=<vertex>`.

## Layout

External legs are pinned to the borders (`in` left, `out` right, declaration
order top-to-bottom); internal vertices minimize Σ tension·|Δp|² — the feynMF
algorithm, solved exactly and deterministically. A relaxation pass then evens
out the propagator lengths, holding every external leg within 60° of the flow
direction so that a leg cannot topple over and read as a kink in the line it
joins. Same input, same diagram, every time. Escape hatches: `tension=`,
explicit `at (x, y)` (which also lifts the leg-angle limit), `bend`.

## API

| export | description |
| --- | --- |
| `render(source, opts?)` | source → `RenderedDiagram[]`; no DOM, diagrams only |
| `renderInto(el, source)` | render diagrams *and* equations into a DOM element |
| `run(opts?)` | scan & replace feynman code blocks (mermaid's `run`); never throws |
| `initialize(config)` | set `startOnLoad`, `katex`, `scale`, `selectors` |
| `config` | the live `FeynmarkConfig` object `initialize` merges into |
| `parse(source)` | source → `DocumentNode` (syntax) |
| `resolve(doc, source?)` | `DocumentNode` → `DocumentModel` (semantics) |
| `layoutDiagram(model, edgeLength?)` | `DiagramModel` → vertex positions |
| `renderDiagram(model, opts?)` | `DiagramModel` → `RenderedDiagram` |
| `renderEquationInto(el, eq, diagrams, katex?)` | typeset one equation with embedded diagram terms |
| `DomLabelMeasurer` / `HeuristicLabelMeasurer` | `LabelMeasurer` implementations (browser / headless) |
| `FeynmarkError` | error with `.loc` (line, col) and `.excerpt()` |
| `STYLESHEET` | the `.feynmark*` CSS, if you prefer to inline it yourself |
| `BASE_EDGE_LEN`, `VERSION` | layout unit (px) and package version |

`RenderedDiagram` is `{ svg, width, height, anchorFraction, name? }`;
`RenderOptions` is `{ katex?, measurer?, scale?, edgeLength? }`.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest: parser / layout / stroke-geometry / DOM suites
npm run build       # tsup: ESM + CJS + IIFE bundles into dist/
npm run sync:cdn    # refresh the committed cdn/ bundle from dist/
```

`dist/` is gitignored; [`cdn/`](cdn/) is not, because jsDelivr serves it from
the repository. CI runs `npm run check:cdn`, which fails if the committed
bundle differs from a fresh build — so rerun `sync:cdn` and commit whenever you
change `src/`.

The demo site under [`site/`](site/) is assembled into `_site/` together with
the freshly built bundle and a vendored copy of KaTeX:

```bash
npm run build && npm run build:site
npx serve _site
```

Then open `/` (overview), `/editor.html` (live editor) or `/gallery.html`.
Pushing to `main` deploys exactly that to GitHub Pages via
[`pages.yml`](.github/workflows/pages.yml).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout of the source tree.

## License

MIT
