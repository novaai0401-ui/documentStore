/**
 * Tiny vector math for retrieval — dot product, cosine similarity, L2
 * normalisation and top-k ranking. Pure and dependency-free.
 */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1, 1]; 0 when either vector is all-zero. */
export function cosine(a: number[], b: number[]): number {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

/** Return a unit-length copy (all-zero stays all-zero). */
export function normalize(a: number[]): number[] {
  const n = norm(a);
  return n === 0 ? a.slice() : a.map((x) => x / n);
}

export interface Ranked { index: number; score: number }

/** The `k` highest-cosine items to `query`, best first. */
export function topK(query: number[], items: number[][], k: number): Ranked[] {
  const scored = items.map((v, index) => ({ index, score: cosine(query, v) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, k));
}
