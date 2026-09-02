/**
 * Metric system: every visual dimension derives from one coherent scale so
 * proportions survive any `scale` setting. Values are px at scale = 1.
 */
export interface Metrics {
  strokeWidth: number;
  /** Full wavelength of photon/boson sine, px. */
  wavelength: number;
  waveAmplitude: number;
  /** Wavelength (pitch) of one gluon coil, px. */
  coilWavelength: number;
  coilAmplitude: number;
  /** Separation of the two lines of a `double`/`graviton` propagator. */
  doubleSep: number;
  arrowLength: number;
  dotRadius: number;
  blobRadius: number;
  crossRadius: number;
  squareHalf: number;
  labelSep: number;
  labelFontSize: number;
  momentumSep: number;
  dashPeriod: number;
  dotGap: number;
  padding: number;
}

export function metrics(scale: number): Metrics {
  const s = scale;
  return {
    strokeWidth: 1.25 * s,
    wavelength: 13.5 * s,
    waveAmplitude: 4.0 * s,
    coilWavelength: 11.5 * s,
    coilAmplitude: 3.5 * s,
    doubleSep: 2.6 * s,
    arrowLength: 8.5 * s,
    dotRadius: 2.4 * s,
    blobRadius: 13 * s,
    crossRadius: 6.5 * s,
    squareHalf: 5.5 * s,
    labelSep: 5.5 * s,
    labelFontSize: 15 * s,
    momentumSep: 12 * s,
    dashPeriod: 13 * s,
    dotGap: 6 * s,
    padding: 16 * s,
  };
}

let uid = 0;
/** Unique id suffix so several diagrams on one page never share defs ids. */
export function nextUid(): string {
  return `fm${(uid++).toString(36)}`;
}

/** SVG <defs> for one diagram (hatch pattern for blobs). */
export function defs(id: string, m: Metrics): string {
  const step = 4 * (m.strokeWidth / 1.25);
  return (
    `<defs>` +
    `<pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="${step}" height="${step}" patternTransform="rotate(-45)">` +
    `<line x1="0" y1="0" x2="0" y2="${step}" style="stroke:currentColor;stroke-width:${(m.strokeWidth * 0.7).toFixed(2)}px"/>` +
    `</pattern>` +
    `</defs>`
  );
}

/**
 * Optional stylesheet for host pages. The SVG itself is self-contained via
 * presentation attributes + currentColor; these classes allow overrides.
 */
export const STYLESHEET = `
.feynmark { color: var(--fm-color, currentColor); }
.feynmark .fm-label, .feynmark .fm-vlabel { color: var(--fm-label-color, currentColor); }
.feynmark-equation .katex-display { overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
.feynmark-error {
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 6px; padding: 10px 14px; white-space: pre-wrap;
}
@media (prefers-color-scheme: dark) {
  .feynmark-error { color: #fca5a5; background: #450a0a; border-color: #7f1d1d; }
}
`;
