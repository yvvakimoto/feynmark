import type { DiagramModel, Edge, EdgeStyle, Vertex } from '../model/model';
import { buildEdgeGeometries } from '../layout/edges';
import { BASE_EDGE_LEN, layoutDiagram } from '../layout/layout';
import { ArcPath, norm, sub, type Path, type Vec2 } from '../layout/geometry';
import { arrowheadAt, momentumArrow } from './arrows';
import {
  DomLabelMeasurer,
  HeuristicLabelMeasurer,
  labelMarkup,
  resolveKatex,
  type KatexLike,
  type LabelMeasurer,
  type LabelSize,
} from './labels';
import {
  coilStroke,
  dashedStroke,
  dottedStroke,
  doubleStroke,
  plainStroke,
  waveStroke,
  type Stroke,
} from './strokes';
import { defs, metrics, nextUid, type Metrics } from './theme';
import { glyphExtent, glyphTrim, vertexGlyph } from './vertices';

export interface RenderOptions {
  /** KaTeX instance; null disables KaTeX (plain-text fallback). */
  katex?: KatexLike | null;
  measurer?: LabelMeasurer;
  /** Extra scale multiplied onto the diagram's own scale attribute. */
  scale?: number;
  /**
   * Target mean propagator length in px (default BASE_EDGE_LEN). Shrinks the
   * layout while keeping stroke weights and label sizes — used for compact
   * in-equation rendering.
   */
  edgeLength?: number;
}

export interface RenderedDiagram {
  svg: string;
  width: number;
  height: number;
  /** Math-axis anchor as a fraction of height from the top (for equations). */
  anchorFraction: number;
  name?: string;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

function strokeFor(style: EdgeStyle, path: Path, m: Metrics): Stroke {
  switch (style) {
    case 'photon':
    case 'boson':
      return waveStroke(path, m);
    case 'graviton':
      return waveStroke(path, m, true);
    case 'gluon':
      return coilStroke(path, m);
    case 'scalar':
    case 'charged scalar':
      return dashedStroke(path, m);
    case 'ghost':
      return dottedStroke(path, m);
    case 'double':
    case 'majorana':
    case 'anti majorana':
      return doubleStroke(path, m);
    default:
      return plainStroke(path);
  }
}

/** Lateral half-extent of the ink beyond the base path, per style. */
function strokeAmplitude(style: EdgeStyle, m: Metrics): number {
  switch (style) {
    case 'photon':
    case 'boson':
    case 'graviton':
      return m.waveAmplitude;
    case 'gluon':
      return m.coilAmplitude;
    case 'double':
    case 'majorana':
    case 'anti majorana':
      return m.doubleSep / 2;
    default:
      return 0;
  }
}

interface PlacedLabel {
  tex: string;
  cx: number;
  cy: number;
  size: LabelSize;
  cssClass: string;
  /** Unit direction the label may retreat along if it collides. */
  escape: Vec2;
}

/** Render one diagram model to a self-contained SVG string. */
export function renderDiagram(model: DiagramModel, opts: RenderOptions = {}): RenderedDiagram {
  const katex = resolveKatex(opts.katex);
  const measurer =
    opts.measurer ??
    (katex && typeof document !== 'undefined' ? new DomLabelMeasurer(katex) : new HeuristicLabelMeasurer());
  let m = metrics(model.options.scale * (opts.scale ?? 1));
  if (opts.edgeLength !== undefined && opts.edgeLength < BASE_EDGE_LEN) {
    // Compact (in-equation) rendering: trim the fixed overhead moderately so
    // small diagrams stay balanced — strokes keep their full weight. Wave and
    // coil periods shrink with the diagram so short photons/gluons still show
    // a few clear humps instead of one stretched wiggle.
    const f = Math.max(0.5, opts.edgeLength / BASE_EDGE_LEN);
    const fw = Math.max(0.65, f);
    m = {
      ...m,
      padding: m.padding * f,
      labelFontSize: m.labelFontSize * Math.max(0.85, f),
      labelSep: m.labelSep * Math.max(0.7, f),
      wavelength: m.wavelength * fw,
      coilWavelength: m.coilWavelength * fw,
      waveAmplitude: m.waveAmplitude * Math.max(0.85, f),
      coilAmplitude: m.coilAmplitude * Math.max(0.85, f),
    };
  }
  const layout = layoutDiagram(model, opts.edgeLength);
  const geoms = buildEdgeGeometries(model, layout);
  const uid = nextUid();

  const edgeParts: string[] = [];
  const overlayParts: string[] = [];
  const labels: PlacedLabel[] = [];
  const boundPts: Vec2[] = [];
  /** Sampled ink of propagators and momentum arrows (label avoidance). */
  const inkPts: Vec2[] = [];
  const pendingEdgeLabels: Array<{
    edge: Edge;
    drawPath: Path;
    momExtent?: { side: 1 | -1; extent: number };
  }> = [];

  for (const { edge, path } of geoms) {
    const vFrom = model.vertices.get(edge.from)!;
    const vTo = model.vertices.get(edge.to)!;
    const trim0 = glyphTrim(vFrom, m);
    const trim1 = glyphTrim(vTo, m);
    const drawPath =
      trim0 + trim1 > 0 && path.length > (trim0 + trim1) * 1.5
        ? path.slice(trim0, path.length - trim1)
        : path;

    const stroke = strokeFor(edge.style, drawPath, m);
    const sw = m.strokeWidth * (edge.width ?? 1) * (stroke.widthScale ?? 1);
    const color = edge.color ? escapeAttr(edge.color) : 'currentColor';
    // Inline styles (not presentation attributes) so host CSS — notably
    // KaTeX's `.katex svg path { stroke: none }` — cannot blank the strokes
    // when the SVG is embedded inside an equation.
    for (const d of stroke.ds) {
      edgeParts.push(
        `<path class="fm-edge fm-${edge.style.replace(/ /g, '-')}" d="${d}" ` +
          `style="fill:none;stroke:${color};stroke-width:${fmt(sw)}px;stroke-linecap:${stroke.linecap}` +
          (stroke.dasharray ? `;stroke-dasharray:${stroke.dasharray}` : '') +
          `"/>`,
      );
    }
    boundPts.push(...stroke.bounds);
    inkPts.push(...stroke.bounds);

    // Arrows sit on the trimmed draw path so they stay on the visible stroke.
    overlayParts.push(...edgeArrows(edge, drawPath, m, color));

    /** Outer extent of the momentum arrow + its label, per side (from the base path). */
    let momExtent: { side: 1 | -1; extent: number } | undefined;
    if (edge.momentum) {
      const mom = momentumArrow(drawPath, edge.momentum.side, edge.momentum.dir, m);
      overlayParts.push(
        `<path class="fm-momentum" d="${mom.d}" ` +
          `style="fill:none;stroke:${color};stroke-width:${fmt(m.strokeWidth * 0.85)}px;stroke-linecap:round"/>`,
        `<path class="fm-momentum" d="${mom.headD}" style="fill:${color};stroke:none"/>`,
      );
      boundPts.push(...mom.bounds);
      inkPts.push(...mom.bounds);
      const size = measurer.measure(edge.momentum.tex, m.labelFontSize);
      const proj = Math.abs(mom.labelNormal.x) * (size.width / 2) + Math.abs(mom.labelNormal.y) * (size.height / 2);
      const off = m.labelSep * 0.8 + proj;
      labels.push({
        tex: edge.momentum.tex,
        cx: mom.labelAnchor.x + mom.labelNormal.x * off,
        cy: mom.labelAnchor.y + mom.labelNormal.y * off,
        size,
        cssClass: 'fm-label fm-momentum-label',
        escape: mom.labelNormal,
      });
      momExtent = { side: edge.momentum.side, extent: m.momentumSep + off + proj };
    }

    if (edge.label) {
      pendingEdgeLabels.push({ edge, drawPath, momExtent });
    }
  }

  // Edge labels are placed after ALL ink is known, so a label whose requested
  // side is blocked (e.g. by a propagator leaving the shared vertex) can flip
  // to the free side instead of landing on a line.
  for (const { edge, drawPath, momExtent } of pendingEdgeLabels) {
    const label = edge.label!;
    const s = label.pos * drawPath.length;
    const p = drawPath.point(s);
    const n = drawPath.normal(s);
    const size = measurer.measure(label.tex, m.labelFontSize);

    const candidate = (side: 1 | -1): { cx: number; cy: number; dir: Vec2 } => {
      let dir = { x: side * n.x, y: side * n.y };
      // Tadpole loops: `label` reads as outside the loop, `label'` as inside,
      // regardless of the loop's travel orientation.
      if (edge.from === edge.to && drawPath instanceof ArcPath) {
        const c = drawPath.center;
        const out = norm({ x: p.x - c.x, y: p.y - c.y });
        dir = side === 1 ? out : { x: -out.x, y: -out.y };
      }
      const proj = Math.abs(dir.x) * (size.width / 2) + Math.abs(dir.y) * (size.height / 2);
      // A momentum arrow on the same side claims the near band: stack the
      // particle label outside it instead of on top of it.
      let base = m.labelSep + strokeAmplitude(edge.style, m);
      if (momExtent && momExtent.side === side) {
        base = Math.max(base, momExtent.extent + m.labelSep * 0.6);
      }
      const off = base + proj;
      return { cx: p.x + dir.x * off, cy: p.y + dir.y * off, dir };
    };

    let placed = candidate(label.side);
    const hits = countInkHits(placed.cx, placed.cy, size, inkPts, m);
    if (hits > 0) {
      const flipped = candidate(label.side === 1 ? -1 : 1);
      if (countInkHits(flipped.cx, flipped.cy, size, inkPts, m) === 0) placed = flipped;
    }
    labels.push({
      tex: label.tex,
      cx: placed.cx,
      cy: placed.cy,
      size,
      cssClass: 'fm-label fm-edge-label',
      escape: placed.dir,
    });
  }

  // Vertex glyphs and labels.
  const glyphParts: string[] = [];
  for (const v of model.vertices.values()) {
    const p = layout.positions.get(v.id)!;
    const g = vertexGlyph(v, p, m, uid);
    if (g) glyphParts.push(g);
    const ext = glyphExtent(v, m);
    if (ext > 0) {
      boundPts.push({ x: p.x - ext, y: p.y - ext }, { x: p.x + ext, y: p.y + ext });
    } else {
      boundPts.push(p);
    }
    if (v.label) {
      const dir = vertexLabelDir(model, v, layout.positions);
      const size = measurer.measure(v.label.tex, m.labelFontSize);
      const proj = Math.abs(dir.x) * (size.width / 2) + Math.abs(dir.y) * (size.height / 2);
      const off = m.labelSep + ext + proj;
      labels.push({
        tex: v.label.tex,
        cx: p.x + dir.x * off,
        cy: p.y + dir.y * off,
        size,
        cssClass: 'fm-vlabel',
        escape: dir,
      });
    }
  }

  resolveLabelCollisions(labels, m);
  resolveInkCollisions(labels, inkPts, m);
  resolveLabelCollisions(labels, m);

  const labelParts = labels.map((l) =>
    labelMarkup(l.tex, l.cx, l.cy, l.size, m.labelFontSize, katex, l.cssClass),
  );
  for (const l of labels) {
    boundPts.push(
      { x: l.cx - l.size.width / 2, y: l.cy - l.size.height / 2 },
      { x: l.cx + l.size.width / 2, y: l.cy + l.size.height / 2 },
    );
  }

  const box = bounds(boundPts, m.padding);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;

  // Math-axis anchor for equation embedding: an explicit `baseline` vertex,
  // else the mean height of the external legs (a propagator-with-insertions
  // term then sits with its LINE on the axis, not its bbox center), else the
  // bbox center.
  let anchorY: number;
  if (model.options.baseline) {
    anchorY = layout.positions.get(model.options.baseline)!.y;
  } else {
    let sum = 0;
    let count = 0;
    for (const v of model.vertices.values()) {
      if (v.external) {
        sum += layout.positions.get(v.id)!.y;
        count++;
      }
    }
    anchorY = count > 0 ? sum / count : (box.minY + box.maxY) / 2;
  }
  const anchorFraction = (anchorY - box.minY) / height;

  const title = model.name ? `<title>Feynman diagram: ${escapeAttr(model.name)}</title>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="feynmark" role="img" ` +
    `viewBox="${fmt(box.minX)} ${fmt(box.minY)} ${fmt(width)} ${fmt(height)}" ` +
    `width="${fmt(width)}" height="${fmt(height)}">` +
    title +
    defs(uid, m) +
    `<g class="fm-edges">${edgeParts.join('')}</g>` +
    `<g class="fm-overlays">${overlayParts.join('')}</g>` +
    `<g class="fm-vertices">${glyphParts.join('')}</g>` +
    `<g class="fm-labels">${labelParts.join('')}</g>` +
    `</svg>`;

  return { svg, width, height, anchorFraction, name: model.name };
}

function edgeArrows(edge: Edge, path: Path, m: Metrics, color: string): string[] {
  const arrow = (s: number, dir: 1 | -1): string => {
    const a = arrowheadAt(path, s, dir, m);
    return `<path class="fm-arrow" d="${a.d}" style="fill:${color};stroke:none"/>`;
  };
  const L = path.length;
  // Majorana styles imply two opposing arrows — unless `arrow=` overrides.
  if (!edge.arrowExplicit) {
    if (edge.style === 'majorana') return [arrow(0.32 * L, 1), arrow(0.68 * L, -1)];
    if (edge.style === 'anti majorana') return [arrow(0.32 * L, -1), arrow(0.68 * L, 1)];
  }
  switch (edge.arrow) {
    case 'forward':
      return [arrow(0.5 * L, 1)];
    case 'back':
      return [arrow(0.5 * L, -1)];
    case 'both':
      return [arrow(0.3 * L, 1), arrow(0.7 * L, 1)];
    default:
      return [];
  }
}

/** Outward direction for a vertex label: away from the mean neighbor. */
function vertexLabelDir(model: DiagramModel, v: Vertex, pos: Map<string, Vec2>): Vec2 {
  const p = pos.get(v.id)!;
  let dx = 0;
  let dy = 0;
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    const nb = e.from === v.id ? e.to : e.to === v.id ? e.from : undefined;
    if (!nb) continue;
    const u = norm(sub(pos.get(nb)!, p));
    dx += u.x;
    dy += u.y;
  }
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return { x: 0, y: -1 };
  return { x: -dx / l, y: -dy / l };
}

/**
 * Greedy label-collision resolution. Labels whose escape directions agree
 * (e.g. two labels below adjacent collinear segments) cannot separate along
 * that axis without one diving into its own line — slide those apart along
 * the perpendicular (the edge direction) instead. Labels with distinct
 * escapes push apart along them.
 */
function resolveLabelCollisions(labels: PlacedLabel[], m: Metrics): void {
  const gap = m.labelSep * 0.5;
  for (let pass = 0; pass < 5; pass++) {
    let any = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]!;
        const b = labels[j]!;
        const ox = Math.min(a.cx + a.size.width / 2, b.cx + b.size.width / 2) -
          Math.max(a.cx - a.size.width / 2, b.cx - b.size.width / 2);
        const oy = Math.min(a.cy + a.size.height / 2, b.cy + b.size.height / 2) -
          Math.max(a.cy - a.size.height / 2, b.cy - b.size.height / 2);
        if (ox <= 0 || oy <= 0) continue;
        any = true;

        const dot = a.escape.x * b.escape.x + a.escape.y * b.escape.y;
        if (dot > 0.5) {
          // Same-side neighbors: slide apart along the shared perpendicular.
          const tx = -b.escape.y;
          const ty = b.escape.x;
          // Overlap projected on the slide axis, resolved half by each label.
          const needed = (Math.abs(tx) * ox + Math.abs(ty) * oy) / 2 + gap;
          const sign = (b.cx - a.cx) * tx + (b.cy - a.cy) * ty >= 0 ? 1 : -1;
          a.cx -= sign * tx * needed;
          a.cy -= sign * ty * needed;
          b.cx += sign * tx * needed;
          b.cy += sign * ty * needed;
        } else {
          // Distinct escapes: each label retreats along its own outward axis.
          const needA = (Math.abs(a.escape.x) * ox + Math.abs(a.escape.y) * oy) / 2 + gap / 2;
          const needB = (Math.abs(b.escape.x) * ox + Math.abs(b.escape.y) * oy) / 2 + gap / 2;
          a.cx += a.escape.x * needA;
          a.cy += a.escape.y * needA;
          b.cx += b.escape.x * needB;
          b.cy += b.escape.y * needB;
        }
      }
    }
    if (!any) break;
  }
}

/** Count sampled ink points inside a label box (with a small margin). */
function countInkHits(cx: number, cy: number, size: LabelSize, ink: Vec2[], m: Metrics): number {
  const margin = m.strokeWidth * 1.6;
  const hw = size.width / 2 + margin;
  const hh = size.height / 2 + margin;
  let hits = 0;
  for (const p of ink) {
    if (Math.abs(p.x - cx) < hw && Math.abs(p.y - cy) < hh) hits++;
  }
  return hits;
}

/**
 * Nudge labels off propagator/momentum ink: while any sampled ink point sits
 * inside the (slightly expanded) label box, retreat along the label's escape
 * direction. Bounded and deterministic.
 */
function resolveInkCollisions(labels: PlacedLabel[], ink: Vec2[], m: Metrics): void {
  const margin = m.strokeWidth * 1.6;
  const step = m.labelSep * 0.6;
  for (const l of labels) {
    if (Math.hypot(l.escape.x, l.escape.y) < 1e-6) continue;
    for (let iter = 0; iter < 8; iter++) {
      const hw = l.size.width / 2 + margin;
      const hh = l.size.height / 2 + margin;
      let hit = false;
      for (const p of ink) {
        if (Math.abs(p.x - l.cx) < hw && Math.abs(p.y - l.cy) < hh) {
          hit = true;
          break;
        }
      }
      if (!hit) break;
      l.cx += l.escape.x * step;
      l.cy += l.escape.y * step;
    }
  }
}

function bounds(pts: Vec2[], pad: number): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    minX = minY = 0;
    maxX = maxY = 1;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
