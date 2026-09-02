import type { Vertex } from '../model/model';
import type { Vec2 } from '../layout/geometry';
import type { Metrics } from './theme';

const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Radius by which incident propagators are trimmed back at this vertex. */
export function glyphTrim(v: Vertex, m: Metrics): number {
  const s = v.size ?? 1;
  switch (v.kind) {
    case 'blob':
      return m.blobRadius * s;
    case 'cross':
      return m.crossRadius * s;
    case 'square':
      return m.squareHalf * s * 1.15;
    default:
      return 0; // point & dot: lines meet at the center, dot drawn on top
  }
}

/** Extent of the glyph ink for bounding-box purposes. */
export function glyphExtent(v: Vertex, m: Metrics): number {
  const s = v.size ?? 1;
  switch (v.kind) {
    case 'dot':
      return m.dotRadius * s;
    case 'blob':
      return m.blobRadius * s;
    case 'cross':
      return m.crossRadius * s;
    case 'square':
      return m.squareHalf * s * Math.SQRT2;
    default:
      return 0;
  }
}

/** SVG fragment for a vertex glyph, or '' for a bare point. */
export function vertexGlyph(v: Vertex, p: Vec2, m: Metrics, defsId: string): string {
  const s = v.size ?? 1;
  const sw = m.strokeWidth;
  switch (v.kind) {
    case 'point':
      return '';
    case 'dot': {
      const r = m.dotRadius * s;
      return `<circle class="fm-vertex fm-dot" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}" style="fill:currentColor;stroke:none"/>`;
    }
    case 'blob': {
      const r = m.blobRadius * s;
      const fill = v.blobFill === 'shade' ? 'rgba(128,128,128,0.45)' : `url(#${defsId}-hatch)`;
      return (
        `<circle class="fm-vertex fm-blob" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}" ` +
        `style="fill:${fill};stroke:currentColor;stroke-width:${fmt(sw)}px"/>`
      );
    }
    case 'cross': {
      const r = m.crossRadius * s;
      const k = r * Math.SQRT1_2;
      const st = `style="fill:none;stroke:currentColor;stroke-width:${fmt(sw)}px"`;
      return (
        `<g class="fm-vertex fm-cross">` +
        `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}" ${st}/>` +
        `<line x1="${fmt(p.x - k)}" y1="${fmt(p.y - k)}" x2="${fmt(p.x + k)}" y2="${fmt(p.y + k)}" ${st}/>` +
        `<line x1="${fmt(p.x - k)}" y1="${fmt(p.y + k)}" x2="${fmt(p.x + k)}" y2="${fmt(p.y - k)}" ${st}/>` +
        `</g>`
      );
    }
    case 'square': {
      const h = m.squareHalf * s;
      return (
        `<rect class="fm-vertex fm-square" x="${fmt(p.x - h)}" y="${fmt(p.y - h)}" ` +
        `width="${fmt(2 * h)}" height="${fmt(2 * h)}" style="fill:currentColor;stroke:none"/>`
      );
    }
  }
}
