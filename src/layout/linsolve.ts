import { FeynmarkError } from '../errors';

/**
 * Solve A x = b for a dense symmetric positive definite matrix A (row-major,
 * n x n) via Cholesky decomposition. Deterministic; sizes here are tiny.
 */
export function choleskySolve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  // Decompose A = L L^T (L lower-triangular, stored in place of a copy).
  const L = new Float64Array(A);
  for (let j = 0; j < n; j++) {
    let d = L[j * n + j]!;
    for (let k = 0; k < j; k++) d -= L[j * n + k]! ** 2;
    if (d <= 1e-12) {
      throw new FeynmarkError(
        'layout system is singular — every internal vertex must connect to an external leg or a pinned vertex',
      );
    }
    const dj = Math.sqrt(d);
    L[j * n + j] = dj;
    for (let i = j + 1; i < n; i++) {
      let s = L[i * n + j]!;
      for (let k = 0; k < j; k++) s -= L[i * n + k]! * L[j * n + k]!;
      L[i * n + j] = s / dj;
    }
  }
  // Forward substitution: L y = b
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[i * n + k]! * y[k]!;
    y[i] = s / L[i * n + i]!;
  }
  // Back substitution: L^T x = y
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k * n + i]! * x[k]!;
    x[i] = s / L[i * n + i]!;
  }
  return x;
}
