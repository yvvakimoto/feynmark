import type { EquationModel } from '../model/model';
import type { RenderedDiagram } from '../render/render';
import type { KatexLike } from '../render/labels';
import { FeynmarkError } from '../errors';

export interface KatexRenderCapable extends KatexLike {
  render?(tex: string, element: HTMLElement, options?: Record<string, unknown>): void;
}

const REF_RE = /@([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Render an equation block into `container`: diagrams become terms inside the
 * KaTeX-rendered math, centered on the math axis.
 *
 * Mechanism: each `@name` is replaced by `\vcenter{\htmlClass{slot}{\rule…}}`
 * — a box with the diagram's aspect ratio that KaTeX centers on the math
 * axis. After KaTeX renders, the invisible rule is overlaid with the actual
 * SVG, shifted so the diagram's anchor line sits on the axis. Replacing
 * content while keeping the rule preserves KaTeX's spacing exactly.
 */
export function renderEquationInto(
  container: HTMLElement,
  eq: EquationModel,
  diagrams: Map<string, RenderedDiagram>,
  katex: KatexRenderCapable | undefined,
): void {
  const doc = container.ownerDocument;
  if (!katex) {
    renderFallback(container, eq, diagrams);
    return;
  }

  // Diagrams embed at their natural pixel size (1:1 — stroke weights and
  // label sizes stay exactly as in standalone rendering); autoinit pre-renders
  // referenced diagrams compactly so that natural size fits eq.heightEm.
  let fontPx = 16;
  if (typeof getComputedStyle === 'function') {
    const fs = parseFloat(getComputedStyle(container).fontSize);
    if (Number.isFinite(fs) && fs > 0) fontPx = fs;
  }

  const slots = new Map<
    string,
    { rendered: RenderedDiagram; wEm: number; hEm: number; topEm: number }
  >();
  let slotIndex = 0;
  const tex = eq.tex.replace(REF_RE, (_, name: string) => {
    const rendered = diagrams.get(name);
    if (!rendered) throw new FeynmarkError(`equation references unknown diagram '@${name}'`);
    const hEm = rendered.height / fontPx;
    const wEm = rendered.width / fontPx;
    // The anchor line must land on the math axis. \vcenter centers the rule
    // box on the axis, so make the box tall enough to CONTAIN the diagram on
    // both sides of the axis (above: anchorFraction·h, below: the rest) —
    // shifting the SVG outside the box would get clipped and steal no line
    // height. The box is symmetric: 2 × the larger half.
    const aboveEm = rendered.anchorFraction * hEm;
    const halfEm = Math.max(aboveEm, hEm - aboveEm);
    const cls = `fm-slot-${slotIndex++}-${name}`;
    slots.set(cls, { rendered, wEm, hEm, topEm: halfEm - aboveEm });
    return `\\vcenter{\\htmlClass{${cls}}{\\rule{${wEm.toFixed(3)}em}{${(2 * halfEm).toFixed(3)}em}}}`;
  });

  const target = doc.createElement('div');
  target.className = 'feynmark-equation';
  const opts: Record<string, unknown> = {
    displayMode: eq.display,
    throwOnError: false,
    strict: false,
    trust: (ctx: { command: string }) => ctx.command === '\\htmlClass',
  };
  if (typeof katex.render === 'function') {
    katex.render(tex, target, opts);
  } else {
    target.innerHTML = katex.renderToString(tex, opts);
  }

  for (const [cls, { rendered, wEm, hEm, topEm }] of slots) {
    const slot = target.querySelector<HTMLElement>(`.${cls}`);
    if (!slot) continue;
    slot.style.position = 'relative';
    slot.style.display = 'inline-block';
    // Hide the sizing rule but keep it in flow so KaTeX metrics are intact.
    const rule = slot.querySelector<HTMLElement>('.rule');
    if (rule) rule.style.visibility = 'hidden';

    // The SVG sits fully INSIDE the axis-symmetric slot box, offset from its
    // top so the diagram's anchor line lands on the box center = math axis.
    // Nothing extends outside the box, so no ancestor overflow can clip it.
    const wrap = doc.createElement('span');
    wrap.style.cssText =
      `position:absolute;left:0;width:${wEm}em;height:${hEm}em;overflow:visible;` +
      `top:${topEm.toFixed(4)}em;`;
    // The SVG fills the wrap (sized in em so it tracks KaTeX font scaling).
    wrap.innerHTML = withSize(rendered.svg, '100%', '100%');
    slot.appendChild(wrap);
  }

  container.appendChild(target);
}

/** Override width/height attributes on a rendered SVG string. */
function withSize(svg: string, width: string, height: string): string {
  return svg.replace(/^(<svg[^>]*?) width="[^"]*" height="[^"]*"/, `$1 width="${width}" height="${height}"`);
}

/** No KaTeX: text with inline SVG terms, vertically centered. */
function renderFallback(
  container: HTMLElement,
  eq: EquationModel,
  diagrams: Map<string, RenderedDiagram>,
): void {
  const doc = container.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'feynmark-equation feynmark-equation-plain';
  wrap.style.cssText = 'display:flex;align-items:center;gap:0.4em;flex-wrap:wrap;font-style:italic;';
  let last = 0;
  for (const match of eq.tex.matchAll(REF_RE)) {
    const before = eq.tex.slice(last, match.index);
    if (before.trim()) wrap.appendChild(doc.createTextNode(before));
    const rendered = diagrams.get(match[1]!);
    if (rendered) {
      const span = doc.createElement('span');
      span.innerHTML = rendered.svg;
      span.style.display = 'inline-block';
      wrap.appendChild(span);
    }
    last = match.index! + match[0].length;
  }
  const tail = eq.tex.slice(last);
  if (tail.trim()) wrap.appendChild(doc.createTextNode(tail));
  container.appendChild(wrap);
}
