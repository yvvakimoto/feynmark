import { FeynmarkError } from '../errors';
import type { Attr, AttrValue, BraceStmt, DiagramNode, DocumentNode, EquationNode } from '../dsl/ast';
import {
  EDGE_STYLES,
  defaultArrow,
  type ArrowMode,
  type Brace,
  type BraceShape,
  type BraceSide,
  type DiagramModel,
  type DocumentModel,
  type Edge,
  type EdgeStyle,
  type EquationModel,
  type LoopDir,
  type Vertex,
} from './model';

const STYLE_SET = new Set<string>(EDGE_STYLES);

/** Resolve a parsed document into validated semantic models. */
export function resolve(doc: DocumentNode, source?: string): DocumentModel {
  const diagrams: DiagramModel[] = [];
  const equations: EquationModel[] = [];
  const names = new Set<string>();

  for (const block of doc.blocks) {
    if (block.kind === 'diagram') {
      if (block.name) {
        if (names.has(block.name)) {
          throw new FeynmarkError(`duplicate diagram name '${block.name}'`, block.loc, source);
        }
        names.add(block.name);
      }
      diagrams.push(resolveDiagram(block, source));
    } else {
      equations.push(resolveEquation(block, source));
    }
  }

  const diagramNames = new Set(diagrams.filter((d) => d.name).map((d) => d.name!));
  for (const block of doc.blocks) {
    if (block.kind !== 'equation') continue;
    for (const m of block.tex.matchAll(REF_RE)) {
      if (!diagramNames.has(m[1]!)) {
        throw new FeynmarkError(`equation references unknown diagram '@${m[1]}'`, block.loc, source);
      }
    }
  }

  return { diagrams, equations };
}

function texValue(v: AttrValue | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'object') return v.tex;
  if (typeof v === 'string') return v;
  return String(v);
}

function numValue(v: AttrValue | undefined, key: string, loc: Attr['loc'], source?: string): number {
  if (typeof v !== 'number') throw new FeynmarkError(`attribute '${key}' expects a number`, loc, source);
  return v;
}

function resolveDiagram(node: DiagramNode, source?: string): DiagramModel {
  const model: DiagramModel = {
    name: node.name,
    vertices: new Map(),
    edges: [],
    braces: [],
    options: { direction: 'right', scale: 1 },
  };

  for (const attr of node.attrs) {
    switch (attr.key) {
      case 'direction': {
        const d = texValue(attr.value);
        if (d !== 'right' && d !== 'left' && d !== 'down' && d !== 'up') {
          throw new FeynmarkError(`direction must be right/left/down/up`, attr.loc, source);
        }
        model.options.direction = d;
        break;
      }
      case 'scale':
        model.options.scale = numValue(attr.value, 'scale', attr.loc, source);
        break;
      case 'baseline':
        model.options.baseline = texValue(attr.value);
        break;
      default:
        throw new FeynmarkError(`unknown diagram attribute '${attr.key}'`, attr.loc, source);
    }
  }

  const ensureVertex = (id: string): Vertex => {
    let v = model.vertices.get(id);
    if (!v) {
      v = { id, kind: 'point', blobFill: 'hatch' };
      model.vertices.set(id, v);
    }
    return v;
  };

  let inCount = 0;
  let outCount = 0;
  const braceStmts: BraceStmt[] = [];

  for (const stmt of node.stmts) {
    if (stmt.kind === 'decl') {
      for (const item of stmt.items) {
        const v = ensureVertex(item.name);
        if (v.external) {
          throw new FeynmarkError(`external leg '${item.name}' declared twice`, item.loc, source);
        }
        v.external = stmt.dir;
        v.externalIndex = stmt.dir === 'in' ? inCount++ : outCount++;
        if (item.label) v.label = { tex: item.label };
      }
    } else if (stmt.kind === 'vertex') {
      const v = ensureVertex(stmt.name);
      if (stmt.at) v.pin = stmt.at;
      applyVertexAttrs(v, stmt.attrs, source);
    } else if (stmt.kind === 'brace') {
      // Members are validated after every statement is in, so a bracket may
      // be written above the chains it gathers.
      braceStmts.push(stmt);
    } else {
      for (let i = 0; i < stmt.edges.length; i++) {
        const fromNode = stmt.nodes[i]!;
        const toNode = stmt.nodes[i + 1]!;
        const from = ensureVertex(fromNode.name);
        const to = ensureVertex(toNode.name);
        if (fromNode.at) from.pin = fromNode.at;
        if (toNode.at) to.pin = toNode.at;
        model.edges.push(resolveEdge(model.edges.length, from.id, to.id, stmt.edges[i]!, fromNode.loc, source));
      }
    }
  }

  for (const stmt of braceStmts) {
    model.braces.push(resolveBrace(stmt, model, source));
  }

  if (model.vertices.size === 0) {
    throw new FeynmarkError(`diagram${node.name ? ` '${node.name}'` : ''} is empty`, node.loc, source);
  }
  if (model.options.baseline && !model.vertices.has(model.options.baseline)) {
    throw new FeynmarkError(`baseline vertex '${model.options.baseline}' does not exist`, node.loc, source);
  }

  return model;
}

const BRACE_SIDES = new Set<string>(['left', 'right', 'top', 'bottom']);

/**
 * Resolve one `brace [...] a, b, c` statement. The side defaults to the edge
 * of the frame the members live on (`in` legs bracket on the left, `out` legs
 * on the right); a mixed or internal group defaults to `left`.
 */
function resolveBrace(stmt: BraceStmt, model: DiagramModel, source?: string): Brace {
  let side: BraceSide | undefined;
  let shape: BraceShape = 'brace';
  let label: { tex: string } | undefined;

  for (const attr of stmt.attrs) {
    if (BRACE_SIDES.has(attr.key)) {
      if (side) throw new FeynmarkError(`brace has two sides: '${side}' and '${attr.key}'`, attr.loc, source);
      side = attr.key as BraceSide;
      continue;
    }
    switch (attr.key) {
      case 'paren':
        shape = 'paren';
        break;
      case 'label': {
        const tex = texValue(attr.value);
        if (!tex) throw new FeynmarkError(`label expects a value`, attr.loc, source);
        label = { tex };
        break;
      }
      default:
        throw new FeynmarkError(`unknown brace attribute '${attr.key}'`, attr.loc, source);
    }
  }

  const seen = new Set<string>();
  for (const name of stmt.members) {
    const v = model.vertices.get(name);
    if (!v) {
      throw new FeynmarkError(
        `brace refers to unknown vertex '${name}' — a bracket gathers vertices that ` +
          `already appear in the diagram`,
        stmt.loc,
        source,
      );
    }
    if (seen.has(name)) {
      throw new FeynmarkError(`brace lists vertex '${name}' twice`, stmt.loc, source);
    }
    seen.add(name);
  }
  if (stmt.members.length < 2) {
    throw new FeynmarkError(`brace needs at least two vertices`, stmt.loc, source);
  }

  if (!side) {
    const dirs = new Set(stmt.members.map((n) => model.vertices.get(n)!.external));
    side = dirs.size === 1 && dirs.has('out') ? 'right' : 'left';
  }
  return { members: stmt.members, side, shape, label };
}

function applyVertexAttrs(v: Vertex, attrs: Attr[], source?: string): void {
  for (const attr of attrs) {
    switch (attr.key) {
      case 'dot':
        v.kind = 'dot';
        break;
      case 'blob': {
        v.kind = 'blob';
        const fill = texValue(attr.value);
        if (fill === 'shade') v.blobFill = 'shade';
        else if (fill !== undefined && fill !== 'hatch') {
          throw new FeynmarkError(`blob fill must be hatch or shade`, attr.loc, source);
        }
        break;
      }
      case 'cross':
        v.kind = 'cross';
        break;
      case 'square':
        v.kind = 'square';
        break;
      case 'label': {
        const tex = texValue(attr.value);
        if (!tex) throw new FeynmarkError(`label expects a value`, attr.loc, source);
        v.label = { tex };
        break;
      }
      case 'size':
        v.size = numValue(attr.value, 'size', attr.loc, source);
        break;
      default:
        throw new FeynmarkError(`unknown vertex attribute '${attr.key}'`, attr.loc, source);
    }
  }
}

/** Colors reach a style attribute; restrict to CSS color syntax characters. */
const COLOR_RE = /^[#\w(),.%\s-]+$/;

function resolveEdge(
  index: number,
  from: string,
  to: string,
  attrs: Attr[],
  loc: Attr['loc'],
  source?: string,
): Edge {
  let style: EdgeStyle | undefined;
  let arrow: ArrowMode | undefined;
  /** 'mom dir' / 'pos' modify momentum/label wherever they appear in the list. */
  let momDir: { dir: 1 | -1; loc: Attr['loc'] } | undefined;
  let labelPos: { pos: number; loc: Attr['loc'] } | undefined;
  const edge: Edge = { index, from, to, style: 'plain', arrow: 'none', tension: 1 };

  const bendValue = (attr: Attr, key: string): number => {
    const deg = attr.value === undefined ? 30 : numValue(attr.value, key, attr.loc, source);
    if (Math.abs(deg) >= 180) {
      throw new FeynmarkError(`'${key}' must be less than 180 degrees`, attr.loc, source);
    }
    return deg;
  };

  for (const attr of attrs) {
    if (STYLE_SET.has(attr.key)) {
      if (style) throw new FeynmarkError(`edge has two styles: '${style}' and '${attr.key}'`, attr.loc, source);
      style = attr.key as EdgeStyle;
      continue;
    }
    switch (attr.key) {
      case 'label':
      case 'edge label': {
        const tex = texValue(attr.value);
        if (!tex) throw new FeynmarkError(`label expects a value`, attr.loc, source);
        edge.label = { tex, side: attr.prime ? -1 : 1, pos: 0.5 };
        break;
      }
      case 'momentum': {
        const tex = texValue(attr.value);
        if (!tex) throw new FeynmarkError(`momentum expects a value`, attr.loc, source);
        edge.momentum = { tex, side: attr.prime ? 1 : -1, dir: 1 };
        break;
      }
      case 'mom dir': {
        const d = texValue(attr.value);
        if (d !== 'forward' && d !== 'back') {
          throw new FeynmarkError(`mom dir must be forward or back`, attr.loc, source);
        }
        momDir = { dir: d === 'forward' ? 1 : -1, loc: attr.loc };
        break;
      }
      case 'arrow': {
        const a = texValue(attr.value);
        if (a !== 'forward' && a !== 'back' && a !== 'none' && a !== 'both') {
          throw new FeynmarkError(`arrow must be forward/back/none/both`, attr.loc, source);
        }
        arrow = a;
        break;
      }
      case 'bend left':
        edge.bend = bendValue(attr, 'bend left');
        break;
      case 'bend right':
        edge.bend = -bendValue(attr, 'bend right');
        break;
      case 'quarter left':
        edge.bend = 45;
        break;
      case 'quarter right':
        edge.bend = -45;
        break;
      case 'half left':
        edge.bend = 90;
        break;
      case 'half right':
        edge.bend = -90;
        break;
      case 'loop': {
        const d = texValue(attr.value) ?? 'auto';
        if (d !== 'up' && d !== 'down' && d !== 'left' && d !== 'right' && d !== 'auto') {
          throw new FeynmarkError(`loop must be up/down/left/right`, attr.loc, source);
        }
        edge.loop = d as LoopDir;
        break;
      }
      case 'tension':
        edge.tension = numValue(attr.value, 'tension', attr.loc, source);
        if (edge.tension <= 0) throw new FeynmarkError(`tension must be positive`, attr.loc, source);
        break;
      case 'color': {
        const c = texValue(attr.value);
        if (!c) throw new FeynmarkError(`color expects a value`, attr.loc, source);
        if (!COLOR_RE.test(c)) throw new FeynmarkError(`invalid color '${c}'`, attr.loc, source);
        edge.color = c;
        break;
      }
      case 'width':
        edge.width = numValue(attr.value, 'width', attr.loc, source);
        break;
      case 'pos':
        labelPos = { pos: numValue(attr.value, 'pos', attr.loc, source), loc: attr.loc };
        break;
      default:
        throw new FeynmarkError(`unknown edge attribute '${attr.key}'`, attr.loc, source);
    }
  }

  if (momDir) {
    if (!edge.momentum) {
      throw new FeynmarkError(`'mom dir' requires 'momentum' on the same edge`, momDir.loc, source);
    }
    edge.momentum.dir = momDir.dir;
  }
  if (labelPos) {
    if (!edge.label) {
      throw new FeynmarkError(`'pos' requires 'label' on the same edge`, labelPos.loc, source);
    }
    edge.label.pos = labelPos.pos;
  }

  edge.style = style ?? 'plain';
  edge.arrow = arrow ?? defaultArrow(edge.style);
  edge.arrowExplicit = arrow !== undefined;

  if (from === to && !edge.loop) edge.loop = 'auto';
  if (edge.loop && from !== to) {
    throw new FeynmarkError(`'loop' is only valid on a self-edge (a -- a)`, loc, source);
  }
  return edge;
}

const REF_RE = /@([A-Za-z_][A-Za-z0-9_]*)/g;

function resolveEquation(node: EquationNode, source?: string): EquationModel {
  let heightEm = 5;
  let display = true;
  for (const attr of node.attrs) {
    switch (attr.key) {
      case 'height': {
        const v = attr.value;
        if (typeof v !== 'number' || !(v > 0)) {
          throw new FeynmarkError(`height must be a positive number (em)`, attr.loc, source);
        }
        heightEm = v;
        break;
      }
      case 'inline':
        display = false;
        break;
      default:
        throw new FeynmarkError(`unknown equation attribute '${attr.key}'`, attr.loc, source);
    }
  }

  const refs: string[] = [];
  for (const m of node.tex.matchAll(REF_RE)) refs.push(m[1]!);
  return { name: node.name, tex: node.tex, refs, heightEm, display };
}
