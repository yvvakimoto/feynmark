# Contributing to feynmark

Thanks for taking a look. Bug reports, diagrams that lay out badly, and DSL
proposals are all welcome — open an
[issue](https://github.com/yvvakimoto/feynmark/issues) or a pull request.

## Getting set up

```bash
npm install
npm run typecheck   # tsc --noEmit (types come from tsup's dts build)
npm test            # vitest
npm run build       # tsup -> dist/
```

CI runs exactly these, plus `npm run check:cdn` and `npm run build:site`, on
every push and pull request. Please make sure they pass locally first.

## The source tree

The pipeline runs left to right; each stage only knows about the one before it.

| directory | stage |
| --- | --- |
| `src/dsl/` | `lexer.ts` → `parser.ts` → `ast.ts`: text to syntax tree |
| `src/model/` | `resolve.ts`: syntax tree to `DocumentModel` — vertices, edges, defaults, validation |
| `src/layout/` | `layout.ts` places vertices by minimizing Σ tension·\|Δp\|² (`linsolve.ts` solves it exactly); `edges.ts` / `geometry.ts` turn that into edge paths |
| `src/render/` | `render.ts` composes the SVG from `strokes.ts` (propagator shapes), `arrows.ts`, `labels.ts`, `vertices.ts`, `theme.ts` (metrics + stylesheet) |
| `src/equation/` | `equation.ts` typesets an equation with diagrams substituted for `@name` terms |
| `src/autoinit.ts` | `renderInto` and the mermaid-style `run()` page scan |
| `src/index.ts` | the public API surface; `src/standalone.ts` is the IIFE entry |

Tests live in `test/`, mirroring those stages. `test/dom/` runs under jsdom
(see `environmentMatchGlobs` in `vitest.config.ts`); everything else runs in
node. `test/manual/eqtest.html` is a by-hand check that equations sit on the
text baseline — open it directly after `npm run build`.

## The demo site

`site/` holds the three pages (overview, live editor, gallery).
`scripts/build-site.mjs` copies them into `_site/` along with
`dist/feynmark.min.js` and a vendored copy of KaTeX from `node_modules`.

```bash
npm run build && npm run build:site
npx serve _site
```

Nothing built is committed: `dist/` and `_site/` are both gitignored, and the
published site is rebuilt from source by `.github/workflows/pages.yml`.

## Conventions

- TypeScript, `strict` plus `noUncheckedIndexedAccess`. No runtime dependencies
  in `src/` — KaTeX is optional and resolved at call time, never imported.
- Comments explain *why*, not *what*. Keep them at the density of the
  surrounding code.
- New DSL surface needs a parser test, and a gallery entry in
  `site/gallery.html` if it is visible.
- Layout must stay deterministic: same input, same SVG. No randomness, no
  iterative physics simulation.
- `VERSION` in `src/index.ts` is checked against `package.json` by
  `test/package.test.ts` — bump both together.

## Releasing

Distribution is jsDelivr's GitHub endpoint: it serves the tagged commit out of
this repository, so a release is a verified tag — nothing is uploaded anywhere.

1. Bump the version in `package.json` **and** `src/index.ts`
   (`test/package.test.ts` checks they agree).
2. `npm run build && npm run sync:cdn`, and commit `cdn/`.
3. Update [CHANGELOG.md](CHANGELOG.md).
4. Push a `v<version>` tag.

`.github/workflows/release.yml` then re-checks that the tag matches
`package.json`, that the tests pass, and that `cdn/` is not stale, and creates
the GitHub Release. The new tag is live on jsDelivr immediately:

```
https://cdn.jsdelivr.net/gh/yvvakimoto/feynmark@v<version>/cdn/feynmark.min.js
```

Publishing to npm as well would only need an `NPM_TOKEN` secret and an
`npm publish --provenance --access public` step; the `package.json` metadata
(`exports`, `files`, `unpkg`, `jsdelivr`) is already set up for it.
