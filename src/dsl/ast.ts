/** Source location for error reporting. */
export interface Loc {
  line: number; // 1-based
  col: number; // 1-based
}

export interface AttrValueTex {
  kind: 'tex';
  tex: string;
}

export type AttrValue = string | number | AttrValueTex;

export interface Attr {
  key: string; // multi-word keys joined by single spaces, e.g. "bend left"
  prime: boolean; // label' / momentum'
  value?: AttrValue;
  loc: Loc;
}

export interface ChainNode {
  name: string;
  at?: { x: number; y: number };
  loc: Loc;
}

export interface ChainStmt {
  kind: 'chain';
  nodes: ChainNode[];
  /** edges[i] is the attr list between nodes[i] and nodes[i+1] */
  edges: Attr[][];
  loc: Loc;
}

export interface DeclItem {
  name: string;
  label?: string; // TeX
  loc: Loc;
}

export interface DeclStmt {
  kind: 'decl';
  dir: 'in' | 'out';
  items: DeclItem[];
  loc: Loc;
}

export interface VertexStmt {
  kind: 'vertex';
  name: string;
  attrs: Attr[];
  at?: { x: number; y: number };
  loc: Loc;
}

export type Stmt = ChainStmt | DeclStmt | VertexStmt;

export interface DiagramNode {
  kind: 'diagram';
  name?: string;
  attrs: Attr[];
  stmts: Stmt[];
  loc: Loc;
}

export interface EquationNode {
  kind: 'equation';
  name?: string;
  attrs: Attr[];
  /** Raw TeX with @diagramName references. */
  tex: string;
  loc: Loc;
}

export type Block = DiagramNode | EquationNode;

export interface DocumentNode {
  blocks: Block[];
}
