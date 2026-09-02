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
<script defer src="https://cdn.jsdelivr.net/npm/feynmark/dist/feynmark.min.js"></script>
```

On `DOMContentLoaded`, feynmark scans the page for

- `pre > code.language-feynman` (what markdown renderers emit for ` ```feynman ` blocks),
- `div.feynman`, and `[data-feynman]`

and replaces each with its rendered diagrams.

> **Not on npm yet.** The CDN and `npm install` lines above start working with
> the first release: pushing a `v*` tag runs
> [`release.yml`](.github/workflows/release.yml), which publishes the package.
> Until then, clone the repo and `npm run build` to get `dist/feynmark.min.js`.

### ESM / bundlers

```bash
npm install feynmark katex
```

```js
import { render, renderInto, initialize, run } from 'feynmark';

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

### Diagram options

`direction=right|left|down|up`, `scale=n`, `baseline=<vertex>`.

## Layout

External legs are pinned to the borders (`in` left, `out` right, declaration
order top-to-bottom); internal vertices minimize Σ tension·|Δp|² — the feynMF
algorithm, solved exactly and deterministically. Same input, same diagram,
every time. Escape hatches: `tension=`, explicit `at (x, y)`, `bend`.

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
```

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
