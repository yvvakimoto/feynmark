import { config } from './config';
import { FeynmarkError } from './errors';
import { parse } from './dsl/parser';
import { resolve } from './model/resolve';
import { renderDiagram, type RenderedDiagram } from './render/render';
import { BASE_EDGE_LEN } from './layout/layout';
import { renderEquationInto, type KatexRenderCapable } from './equation/equation';
import { resolveKatex } from './render/labels';
import { STYLESHEET } from './render/theme';

const DEFAULT_SELECTORS = [
  'pre > code.language-feynman',
  'pre > code.lang-feynman',
  'div.feynman',
  '[data-feynman]',
];

/** Inject the theme stylesheet once per document. */
function ensureStyles(doc: Document): void {
  if (doc.getElementById('feynmark-style')) return;
  const style = doc.createElement('style');
  style.id = 'feynmark-style';
  style.textContent = STYLESHEET;
  doc.head.appendChild(style);
}

/**
 * Render one feynmark source into a fresh container element.
 * Diagrams referenced by an equation appear only inside the equation.
 */
export function renderInto(container: HTMLElement, source: string): void {
  ensureStyles(container.ownerDocument);
  const doc = parse(source);
  const model = resolve(doc, source);
  const katex = resolveKatex(config.katex) as KatexRenderCapable | undefined;

  const referenced = new Set<string>();
  /** Target pixel height per referenced diagram (largest equation wins). */
  const targetHeight = new Map<string, number>();
  let fontPx = 16;
  if (typeof getComputedStyle === 'function') {
    const fs = parseFloat(getComputedStyle(container).fontSize);
    if (Number.isFinite(fs) && fs > 0) fontPx = fs;
  }
  for (const eq of model.equations) {
    for (const ref of eq.refs) {
      referenced.add(ref);
      const h = eq.heightEm * fontPx;
      targetHeight.set(ref, Math.max(targetHeight.get(ref) ?? 0, h));
    }
  }

  const rendered = new Map<string, RenderedDiagram>();
  /** One render per diagram, parallel to model.diagrams (unnamed ones included). */
  const renderedAll: RenderedDiagram[] = [];
  for (const d of model.diagrams) {
    let r = renderDiagram(d, { katex: config.katex, scale: config.scale });
    // Equation terms: re-render with a compact layout so the diagram's natural
    // size approaches its slot height — stroke weights and labels stay
    // full-size instead of being scaled down with the whole SVG. Labels and
    // padding are fixed overhead, so iterate the edge length to converge.
    const target = d.name ? targetHeight.get(d.name) : undefined;
    if (target) {
      // Long horizontal diagrams (propagator chains) are bounded by width too,
      // so an equation of several terms stays within one line of text.
      // Floor of 34px keeps waves, coils, and arrows legible — a term may
      // then end up somewhat taller than requested, which books do too.
      const MIN_EDGE = 34;
      const maxW = target * 2.8;
      let edgeLength = BASE_EDGE_LEN;
      for (let i = 0; i < 3 && (r.height > target * 1.05 || r.width > maxW * 1.05); i++) {
        edgeLength = Math.max(MIN_EDGE, edgeLength * Math.min(target / r.height, maxW / r.width, 1));
        r = renderDiagram(d, { katex: config.katex, scale: config.scale, edgeLength });
        if (edgeLength <= MIN_EDGE) break;
      }
    }
    if (d.name) rendered.set(d.name, r);
    renderedAll.push(r);
  }

  const ownerDoc = container.ownerDocument;
  for (let i = 0; i < model.diagrams.length; i++) {
    const d = model.diagrams[i]!;
    if (d.name && referenced.has(d.name)) continue;
    const div = ownerDoc.createElement('div');
    div.className = 'feynmark-diagram';
    div.innerHTML = renderedAll[i]!.svg;
    container.appendChild(div);
  }
  for (const eq of model.equations) {
    renderEquationInto(container, eq, rendered, katex);
  }
}

/** Build a mermaid-style inline error box. */
function errorBox(doc: Document, err: unknown, source: string): HTMLElement {
  const div = doc.createElement('div');
  div.className = 'feynmark-error';
  const msg = err instanceof Error ? err.message : String(err);
  let text = `feynmark: ${msg}`;
  if (err instanceof FeynmarkError) {
    const ex = err.excerpt() ?? (err.loc ? source.split(/\r\n|\r|\n/)[err.loc.line - 1] : undefined);
    if (ex) text += `\n\n${ex}`;
  }
  div.textContent = text;
  return div;
}

/**
 * Scan the document (mermaid's `run`): find feynman code blocks and replace
 * each with its rendered diagrams/equations. Render errors become inline
 * error boxes; nothing throws out of this function.
 */
export function run(options: { nodes?: Iterable<Element>; document?: Document } = {}): void {
  const doc = options.document ?? (typeof document !== 'undefined' ? document : undefined);
  if (!doc) return;
  ensureStyles(doc);

  const selectors = [...DEFAULT_SELECTORS, ...config.selectors];
  const nodes = options.nodes ?? doc.querySelectorAll(selectors.join(','));

  for (const node of nodes) {
    if (node.getAttribute('data-feynmark-processed')) continue;
    // For `pre > code`, replace the whole <pre>.
    const host = node.tagName === 'CODE' && node.parentElement?.tagName === 'PRE' ? node.parentElement : node;
    const source = node.textContent ?? '';
    const container = doc.createElement('div');
    container.className = 'feynmark-container';
    container.setAttribute('data-feynmark-processed', 'true');
    try {
      renderInto(container, source);
    } catch (err) {
      container.textContent = '';
      container.appendChild(errorBox(doc, err, source));
    }
    host.replaceWith(container);
  }
}
