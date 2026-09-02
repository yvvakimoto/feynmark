import { FeynmarkError } from '../errors';
import type {
  Attr,
  AttrValue,
  Block,
  BraceStmt,
  ChainNode,
  ChainStmt,
  DeclItem,
  DeclStmt,
  DiagramNode,
  DocumentNode,
  EquationNode,
  Stmt,
  VertexStmt,
} from './ast';
import { Lexer, type Token } from './lexer';

/** Parse a feynmark document (one or more diagram/equation blocks). */
export function parse(source: string): DocumentNode {
  return new Parser(source).parseDocument();
}

class Parser {
  private readonly lexer: Lexer;
  private readonly src: string;
  private tok: Token;
  private ahead: Token | null = null;

  constructor(source: string) {
    this.src = source;
    this.lexer = new Lexer(source);
    this.tok = this.lexer.next();
  }

  private bump(): void {
    this.tok = this.ahead ?? this.lexer.next();
    this.ahead = null;
  }

  private peek(): Token {
    if (!this.ahead) this.ahead = this.lexer.next();
    return this.ahead;
  }

  private fail(msg: string): never {
    throw new FeynmarkError(msg, this.tok.loc, this.src);
  }

  private skipNewlines(): void {
    while (this.tok.type === 'newline') this.bump();
  }

  private expectPunct(p: string): void {
    if (this.tok.type !== 'punct' || this.tok.value !== p) {
      this.fail(`expected '${p}' but found ${describe(this.tok)}`);
    }
    this.bump();
  }

  private isPunct(p: string): boolean {
    return this.tok.type === 'punct' && this.tok.value === p;
  }

  parseDocument(): DocumentNode {
    const blocks: Block[] = [];
    this.skipNewlines();
    while (this.tok.type !== 'eof') {
      if (this.tok.type === 'ident' && this.tok.value === 'diagram') {
        blocks.push(this.parseDiagram());
      } else if (this.tok.type === 'ident' && this.tok.value === 'equation') {
        blocks.push(this.parseEquation());
      } else {
        this.fail(`expected 'diagram' or 'equation' but found ${describe(this.tok)}`);
      }
      this.skipNewlines();
    }
    if (blocks.length === 0) throw new FeynmarkError('empty document: expected at least one diagram');
    return { blocks };
  }

  private parseBlockHeader(): { name?: string; attrs: Attr[] } {
    let name: string | undefined;
    let attrs: Attr[] = [];
    if (this.tok.type === 'ident') {
      name = this.tok.value;
      this.bump();
    }
    if (this.isPunct('[')) attrs = this.parseAttrs();
    return { name, attrs };
  }

  private parseDiagram(): DiagramNode {
    const loc = this.tok.loc;
    this.bump(); // 'diagram'
    const { name, attrs } = this.parseBlockHeader();
    this.skipNewlines();
    this.expectPunct('{');
    const stmts: Stmt[] = [];
    for (;;) {
      this.skipNewlines();
      if (this.isPunct('}')) {
        this.bump();
        break;
      }
      if (this.tok.type === 'eof') this.fail('unclosed diagram block (missing })');
      stmts.push(this.parseStmt());
      // statement separator: newline, ';', or '}' next
      if (this.isPunct(';')) this.bump();
      else if (this.tok.type === 'newline') this.bump();
      else if (!this.isPunct('}')) this.fail(`expected end of statement but found ${describe(this.tok)}`);
    }
    return { kind: 'diagram', name, attrs, stmts, loc };
  }

  private parseEquation(): EquationNode {
    const loc = this.tok.loc;
    this.bump(); // 'equation'
    const { name, attrs } = this.parseBlockHeader();
    this.skipNewlines();
    if (!this.isPunct('{')) this.fail(`expected '{' but found ${describe(this.tok)}`);
    // Do NOT bump through the normal lexer: grab raw TeX after '{'. This is
    // only sound while no token has been peeked past the '{' — assert it.
    if (this.ahead) this.fail(`internal error: lookahead before raw equation body`);
    const { text } = this.lexer.scanRawBalanced();
    this.bump(); // load token after the closing '}'
    return { kind: 'equation', name, attrs, tex: text.trim(), loc };
  }

  private parseStmt(): Stmt {
    if (this.tok.type === 'ident' && (this.tok.value === 'in' || this.tok.value === 'out')) {
      // 'in'/'out' could in principle be a vertex name in a chain, but a decl
      // is only recognized when followed by an ident (never '--' or 'at').
      const nxt = this.peek();
      if (nxt.type === 'ident') return this.parseDecl();
    }
    if (this.tok.type === 'ident' && this.tok.value === 'vertex') {
      const nxt = this.peek();
      if (nxt.type === 'ident') return this.parseVertexDef();
    }
    if (this.tok.type === 'ident' && this.tok.value === 'brace') {
      // A chain would need '--' next, so 'brace' followed by a name or an
      // attribute list can only be a bracket statement.
      const nxt = this.peek();
      if (nxt.type === 'ident' || (nxt.type === 'punct' && nxt.value === '[')) return this.parseBrace();
    }
    return this.parseChain();
  }

  private parseDecl(): DeclStmt {
    const loc = this.tok.loc;
    const dir = this.tok.value as 'in' | 'out';
    this.bump();
    const items: DeclItem[] = [];
    for (;;) {
      if (this.tok.type !== 'ident') this.fail(`expected leg name but found ${describe(this.tok)}`);
      const item: DeclItem = { name: this.tok.value, loc: this.tok.loc };
      this.bump();
      if (this.isPunct(':')) {
        this.bump();
        const t: Token = this.tok;
        if (t.type === 'tex' || t.type === 'string') {
          item.label = t.value;
          this.bump();
        } else {
          this.fail(`expected $...$ label but found ${describe(t)}`);
        }
      }
      items.push(item);
      if (this.isPunct(',')) {
        this.bump();
        this.skipNewlines();
      } else break;
    }
    return { kind: 'decl', dir, items, loc };
  }

  private parseVertexDef(): VertexStmt {
    const loc = this.tok.loc;
    this.bump(); // 'vertex'
    if (this.tok.type !== 'ident') this.fail(`expected vertex name but found ${describe(this.tok)}`);
    const name = this.tok.value;
    this.bump();
    let attrs: Attr[] = [];
    if (this.isPunct('[')) attrs = this.parseAttrs();
    let at: { x: number; y: number } | undefined;
    if (this.tok.type === 'ident' && this.tok.value === 'at') {
      this.bump();
      at = this.parseCoord();
    }
    return { kind: 'vertex', name, attrs, at, loc };
  }

  private parseBrace(): BraceStmt {
    const loc = this.tok.loc;
    this.bump(); // 'brace'
    let attrs: Attr[] = [];
    if (this.isPunct('[')) attrs = this.parseAttrs();
    const members: string[] = [];
    for (;;) {
      if (this.tok.type !== 'ident') this.fail(`expected vertex name but found ${describe(this.tok)}`);
      members.push(this.tok.value);
      this.bump();
      if (this.isPunct(',')) {
        this.bump();
        this.skipNewlines();
      } else break;
    }
    return { kind: 'brace', attrs, members, loc };
  }

  private parseCoord(): { x: number; y: number } {
    this.expectPunct('(');
    if (this.tok.type !== 'number') this.fail(`expected number but found ${describe(this.tok)}`);
    const x = Number(this.tok.value);
    this.bump();
    this.expectPunct(',');
    if (this.tok.type !== 'number') this.fail(`expected number but found ${describe(this.tok)}`);
    const y = Number(this.tok.value);
    this.bump();
    this.expectPunct(')');
    return { x, y };
  }

  private parseChainNode(): ChainNode {
    if (this.tok.type !== 'ident') this.fail(`expected vertex name but found ${describe(this.tok)}`);
    const node: ChainNode = { name: this.tok.value, loc: this.tok.loc };
    this.bump();
    if (this.tok.type === 'ident' && this.tok.value === 'at') {
      this.bump();
      node.at = this.parseCoord();
    }
    return node;
  }

  private parseChain(): ChainStmt {
    const loc = this.tok.loc;
    const nodes: ChainNode[] = [this.parseChainNode()];
    const edges: Attr[][] = [];
    while (this.tok.type === 'ddash') {
      this.bump();
      this.skipNewlines(); // chains may wrap after '--'
      let attrs: Attr[] = [];
      if (this.isPunct('[')) {
        attrs = this.parseAttrs();
        this.skipNewlines();
      }
      edges.push(attrs);
      nodes.push(this.parseChainNode());
    }
    if (edges.length === 0) this.fail(`expected '--' after vertex '${nodes[0]!.name}'`);
    return { kind: 'chain', nodes, edges, loc };
  }

  /** Parse `[ attr, attr, ... ]`. Keys may be multi-word; `'` marks primes. */
  private parseAttrs(): Attr[] {
    this.expectPunct('[');
    const attrs: Attr[] = [];
    this.skipNewlines();
    if (this.isPunct(']')) {
      this.bump();
      return attrs;
    }
    for (;;) {
      this.skipNewlines();
      attrs.push(this.parseAttr());
      this.skipNewlines();
      if (this.isPunct(',')) {
        this.bump();
        continue;
      }
      if (this.isPunct(']')) {
        this.bump();
        return attrs;
      }
      this.fail(`expected ',' or ']' in attribute list but found ${describe(this.tok)}`);
    }
  }

  private parseAttr(): Attr {
    const loc = this.tok.loc;
    if (this.tok.type !== 'ident') this.fail(`expected attribute name but found ${describe(this.tok)}`);
    const words: string[] = [];
    while (this.tok.type === 'ident') {
      words.push(this.tok.value);
      this.bump();
    }
    let prime = false;
    if (this.isPunct("'")) {
      prime = true;
      this.bump();
    }
    const attr: Attr = { key: words.join(' '), prime, loc };
    if (this.isPunct('=')) {
      this.bump();
      attr.value = this.parseAttrValue();
    }
    return attr;
  }

  private parseAttrValue(): AttrValue {
    if (this.tok.type === 'number') {
      const n = Number(this.tok.value);
      this.bump();
      return n;
    }
    if (this.tok.type === 'tex') {
      const tex = this.tok.value;
      this.bump();
      return { kind: 'tex', tex };
    }
    if (this.tok.type === 'string') {
      const s = this.tok.value;
      this.bump();
      return s;
    }
    if (this.tok.type === 'ident') {
      const words: string[] = [];
      while (this.tok.type === 'ident') {
        words.push(this.tok.value);
        this.bump();
      }
      return words.join(' ');
    }
    this.fail(`expected attribute value but found ${describe(this.tok)}`);
  }
}

function describe(tok: Token): string {
  switch (tok.type) {
    case 'eof':
      return 'end of input';
    case 'newline':
      return 'end of line';
    case 'tex':
      return `$${tok.value}$`;
    default:
      return `'${tok.value}'`;
  }
}
