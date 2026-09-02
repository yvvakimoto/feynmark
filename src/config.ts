import type { KatexLike } from './render/labels';

export interface FeynmarkConfig {
  /** Auto-render on DOMContentLoaded (standalone bundle). Default true. */
  startOnLoad: boolean;
  /** KaTeX instance; undefined = auto-detect global, null = disable. */
  katex?: KatexLike | null;
  /** Global scale multiplier. */
  scale: number;
  /** Extra CSS selectors to scan in addition to the defaults. */
  selectors: string[];
}

export const config: FeynmarkConfig = {
  startOnLoad: true,
  scale: 1,
  selectors: [],
};

/** Merge user settings into the global config (mermaid-style initialize). */
export function initialize(partial: Partial<FeynmarkConfig>): void {
  Object.assign(config, partial);
}
