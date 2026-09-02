/** Resolved, validated semantic model of one diagram. */

export const EDGE_STYLES = [
  'plain',
  'fermion',
  'anti fermion',
  'scalar',
  'charged scalar',
  'ghost',
  'photon',
  'boson',
  'gluon',
  'double',
  'majorana',
  'anti majorana',
  'graviton',
] as const;

export type EdgeStyle = (typeof EDGE_STYLES)[number];

export type ArrowMode = 'forward' | 'back' | 'none' | 'both';

export type VertexKind = 'point' | 'dot' | 'blob' | 'cross' | 'square';

export interface VertexLabel {
  tex: string;
}

export interface Vertex {
  id: string;
  kind: VertexKind;
  blobFill: 'hatch' | 'shade';
  label?: VertexLabel;
  external?: 'in' | 'out';
  /** Explicit pin in abstract layout coordinates (unit-square-ish). */
  pin?: { x: number; y: number };
  /** Declaration order among externals of the same direction. */
  externalIndex?: number;
  size?: number;
}

export interface EdgeLabel {
  tex: string;
  /** +1 = left of travel direction, -1 = right. */
  side: 1 | -1;
  /** Position along the edge, 0..1 (default 0.5). */
  pos: number;
}

export interface EdgeMomentum {
  tex: string;
  side: 1 | -1;
  /** +1 = along edge direction, -1 = reversed. */
  dir: 1 | -1;
}

export type LoopDir = 'up' | 'down' | 'left' | 'right' | 'auto';

export interface Edge {
  index: number;
  from: string;
  to: string;
  style: EdgeStyle;
  arrow: ArrowMode;
  /** True when `arrow=` was written explicitly (overrides style defaults, majorana included). */
  arrowExplicit?: boolean;
  label?: EdgeLabel;
  momentum?: EdgeMomentum;
  /** Signed bend in degrees; positive bends left of travel. */
  bend?: number;
  /** Present iff from === to (tadpole). */
  loop?: LoopDir;
  tension: number;
  color?: string;
  width?: number;
}

export interface DiagramOptions {
  direction: 'right' | 'left' | 'down' | 'up';
  scale: number;
  /** Vertex id whose y becomes the math axis when embedded in an equation. */
  baseline?: string;
}

export interface DiagramModel {
  name?: string;
  vertices: Map<string, Vertex>;
  edges: Edge[];
  options: DiagramOptions;
}

export interface EquationModel {
  name?: string;
  tex: string;
  /** Diagram names referenced via @name, in order of appearance. */
  refs: string[];
  /** Embedded diagram height in em. */
  heightEm: number;
  display: boolean;
}

export interface DocumentModel {
  diagrams: DiagramModel[];
  equations: EquationModel[];
}

/** Default arrow mode implied by a style. */
export function defaultArrow(style: EdgeStyle): ArrowMode {
  switch (style) {
    case 'fermion':
    case 'charged scalar':
      return 'forward';
    case 'anti fermion':
      return 'back';
    default:
      return 'none';
  }
}
