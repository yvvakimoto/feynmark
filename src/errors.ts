import type { Loc } from './dsl/ast';

/** Error with source position, thrown by the parser/resolver/layout. */
export class FeynmarkError extends Error {
  readonly loc?: Loc;
  readonly source?: string;

  constructor(message: string, loc?: Loc, source?: string) {
    super(loc ? `${message} (line ${loc.line}, col ${loc.col})` : message);
    this.name = 'FeynmarkError';
    this.loc = loc;
    this.source = source;
  }

  /** Short excerpt of the offending line with a caret marker. */
  excerpt(): string | undefined {
    if (!this.loc || !this.source) return undefined;
    const line = this.source.split(/\r\n|\r|\n/)[this.loc.line - 1];
    if (line === undefined) return undefined;
    return `${line}\n${' '.repeat(Math.max(0, this.loc.col - 1))}^`;
  }
}
