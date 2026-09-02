/**
 * Standalone (CDN) entry: exposes the API as the global `feynmark` and
 * auto-renders on DOMContentLoaded, mermaid-style.
 *
 *   <script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/feynmark/dist/feynmark.min.js"></script>
 */
import { config } from './config';
import { run } from './autoinit';

export * from './index';

function shouldAutostart(): boolean {
  if (!config.startOnLoad) return false;
  if (typeof document === 'undefined') return false;
  const script = document.currentScript;
  if (script?.hasAttribute('data-feynmark-no-autoinit')) return false;
  return true;
}

if (typeof document !== 'undefined' && shouldAutostart()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (config.startOnLoad) run();
    });
  } else {
    queueMicrotask(() => {
      if (config.startOnLoad) run();
    });
  }
}
