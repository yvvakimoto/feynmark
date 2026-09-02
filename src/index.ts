/**
 * feynmark — Mermaid-style declarative Feynman diagrams for the web.
 *
 * ```feynman
 * diagram tree {
 *   in  e1: $e^-$,  e2: $e^+$
 *   out m1: $\mu^-$, m2: $\mu^+$
 *   e1 -- [fermion] a -- [fermion] e2
 *   a  -- [photon, momentum=$q$] b
 *   m2 -- [fermion] b -- [fermion] m1
 * }
 * ```
 */
export { parse } from './dsl/parser';
export { resolve } from './model/resolve';
export { renderDiagram, type RenderedDiagram, type RenderOptions } from './render/render';
export { renderEquationInto } from './equation/equation';
export { layoutDiagram, BASE_EDGE_LEN } from './layout/layout';
export { initialize, config, type FeynmarkConfig } from './config';
export { run, renderInto } from './autoinit';
export { FeynmarkError } from './errors';
export { STYLESHEET } from './render/theme';
export {
  DomLabelMeasurer,
  HeuristicLabelMeasurer,
  type KatexLike,
  type LabelMeasurer,
} from './render/labels';
export type { DocumentModel, DiagramModel, EquationModel } from './model/model';

import { parse } from './dsl/parser';
import { resolve } from './model/resolve';
import { renderDiagram, type RenderedDiagram, type RenderOptions } from './render/render';

/**
 * Compile feynmark source to rendered SVG strings (no DOM insertion).
 * Equations are DOM-dependent; use `renderInto`/`run` for those.
 */
export function render(source: string, opts: RenderOptions = {}): RenderedDiagram[] {
  const model = resolve(parse(source), source);
  return model.diagrams.map((d) => renderDiagram(d, opts));
}

export const VERSION = '0.2.0';
