# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 0.1.0 — 2026-09-02

First public release.

### Added

- **DSL** — `diagram` and `equation` blocks with named or anonymous forms,
  `in` / `out` external legs, `vertex` declarations, edge chains (`a -- [style] b -- c`),
  `%` and `//` comments, and statement termination by newline or `;`.
- **Propagator styles** — `fermion` / `anti fermion`, `plain`,
  `scalar` / `charged scalar`, `ghost`, `photon` / `boson`, `gluon`, `double`,
  `majorana` / `anti majorana`, `graviton`.
- **Edge attributes** — `label` / `label'`, `momentum` / `momentum'` with
  `mom dir`, `arrow`, `bend left/right`, `quarter`/`half left/right`, `loop`,
  `tension`, `color`, `width`.
- **Vertex attributes** — `dot`, `blob` (`blob=shade`), `cross`, `square`,
  `label`, `size`, and explicit `at (x, y)` placement.
- **Diagram options** — `direction`, `scale`, `baseline`.
- **Layout** — feynMF-style tension minimization solved exactly, so the same
  source always produces the same SVG.
- **Equations** — `@name` inside an `equation` embeds that diagram as a term on
  the math axis; embedded diagrams are re-laid-out compactly so strokes and
  labels keep their full size.
- **Rendering** — self-contained SVG using `currentColor`, KaTeX labels via
  `<foreignObject>` with a plain-text fallback when KaTeX is absent.
- **API** — `render`, `renderInto`, `run`, `initialize` / `config`, plus the
  individual pipeline stages (`parse`, `resolve`, `layoutDiagram`,
  `renderDiagram`, `renderEquationInto`) and `FeynmarkError` with source
  positions.
- **Distribution** — ESM, CJS and IIFE (`window.feynmark`) builds with
  TypeScript declarations; KaTeX as an optional peer dependency. The standalone
  bundle is served by jsDelivr from the tagged commit
  (`cdn.jsdelivr.net/gh/yvvakimoto/feynmark@v0.1.0/cdn/feynmark.min.js`), which
  is why `cdn/` is committed.
- **Site** — overview, live editor and 47-example gallery, deployed to GitHub
  Pages from `site/`.

[Unreleased]: https://github.com/yvvakimoto/feynmark/compare/v0.1.0...HEAD
