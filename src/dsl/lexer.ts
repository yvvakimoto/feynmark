import { FeynmarkError } from '../errors';
import type { Loc } from './ast';

export type TokenType =
  | 'ident'
  | 'number'
  | 'tex' // $...$
  | 'string' // "..."
  | 'punct' // { } [ ] ( ) , ; : = ' @
  | 'ddash' // --
  | 'newline'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  loc: Loc;
}

const PUNCT = new Set(['{', '}', '[', ']', '(', ')', ',', ';', ':', '=', "'", '@']);

/**
 * Incremental lexer. Emits `newline` tokens (statement separators);
 * the parser decides where they are significant. Supports raw balanced-brace
 * scanning for `equation { ... }` TeX bodies.
 */
export class Lexer {
  private readonly src: string;
  private pos = 0;
  private line = 1;
  private col = 1;

  constructor(src: string) {
    this.src = src;
  }

  private loc(): Loc {
    return { line: this.line, col: this.col };
  }

  private advance(n = 1): void {
    for (let i = 0; i < n && this.pos < this.src.length; i++) {
      if (this.src[this.pos] === '\n') {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  private peekChar(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  /** Skip spaces/tabs/CR and comments (% or // to end of line). Not newlines. */
  private skipBlanks(): void {
    for (;;) {
      const c = this.peekChar();
      if (c === ' ' || c === '\t' || c === '\r') {
        this.advance();
      } else if (c === '%' || (c === '/' && this.peekChar(1) === '/')) {
        while (this.pos < this.src.length && this.peekChar() !== '\n') this.advance();
      } else {
        return;
      }
    }
  }

  next(): Token {
    this.skipBlanks();
    const loc = this.loc();
    const c = this.peekChar();

    if (this.pos >= this.src.length) return { type: 'eof', value: '', loc };

    if (c === '\n') {
      this.advance();
      return { type: 'newline', value: '\n', loc };
    }

    if (c === '-' && this.peekChar(1) === '-') {
      this.advance(2);
      return { type: 'ddash', value: '--', loc };
    }

    if (c === '$') {
      this.advance();
      let tex = '';
      while (this.pos < this.src.length && this.peekChar() !== '$') {
        if (this.peekChar() === '\\' && this.peekChar(1) === '$') {
          tex += '\\$';
          this.advance(2);
        } else {
          tex += this.peekChar();
          this.advance();
        }
      }
      if (this.pos >= this.src.length) throw new FeynmarkError('unclosed $...$ math', loc, this.src);
      this.advance(); // closing $
      return { type: 'tex', value: tex, loc };
    }

    if (c === '"') {
      this.advance();
      let s = '';
      while (this.pos < this.src.length && this.peekChar() !== '"') {
        if (this.peekChar() === '\\' && this.peekChar(1) === '"') {
          s += '"';
          this.advance(2);
        } else {
          s += this.peekChar();
          this.advance();
        }
      }
      if (this.pos >= this.src.length) throw new FeynmarkError('unclosed string', loc, this.src);
      this.advance();
      return { type: 'string', value: s, loc };
    }

    if (PUNCT.has(c)) {
      this.advance();
      return { type: 'punct', value: c, loc };
    }

    if (/[0-9]/.test(c) || (c === '-' && /[0-9.]/.test(this.peekChar(1))) || (c === '.' && /[0-9]/.test(this.peekChar(1)))) {
      let s = '';
      if (c === '-') {
        s += '-';
        this.advance();
      }
      while (/[0-9.]/.test(this.peekChar())) {
        s += this.peekChar();
        this.advance();
      }
      const n = Number(s);
      if (!Number.isFinite(n)) throw new FeynmarkError(`invalid number '${s}'`, loc, this.src);
      return { type: 'number', value: s, loc };
    }

    if (/[A-Za-z_]/.test(c)) {
      let s = '';
      while (/[A-Za-z0-9_]/.test(this.peekChar())) {
        s += this.peekChar();
        this.advance();
      }
      return { type: 'ident', value: s, loc };
    }

    throw new FeynmarkError(`unexpected character '${c}'`, loc, this.src);
  }

  /**
   * Scan raw text until the brace depth returns to zero (the closing `}` of an
   * already-consumed `{`). Returns the raw text without the closing brace.
   * Respects \{ \} escapes so TeX groups nest correctly.
   */
  scanRawBalanced(): { text: string; loc: Loc } {
    const loc = this.loc();
    let depth = 1;
    let text = '';
    while (this.pos < this.src.length) {
      const c = this.peekChar();
      if (c === '\\') {
        text += c + this.peekChar(1);
        this.advance(2);
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') {
        depth--;
        if (depth === 0) {
          this.advance();
          return { text, loc };
        }
      }
      text += c;
      this.advance();
    }
    throw new FeynmarkError('unclosed equation block (missing })', loc, this.src);
  }
}
