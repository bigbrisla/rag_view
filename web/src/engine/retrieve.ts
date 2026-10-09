/**
 * Exact cosine search over unit vectors (cosine = dot product).
 * Mirrors pipeline/src/ragview/retrieval.py, including index tie-breaking.
 */
import { DIM } from './types'

export function scoreAll(vectors: Float32Array, query: Float32Array): Float32Array {
  const n = vectors.length / DIM
  const scores = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    const o = i * DIM
    for (let d = 0; d < DIM; d++) s += vectors[o + d] * query[d]
    scores[i] = s
  }
  return scores
}

/** Indices sorted by descending score, ties broken by index. */
export function rankDescending(scores: ArrayLike<number>): number[] {
  return Array.from({ length: scores.length }, (_, i) => i).sort(
    (a, b) => scores[b] - scores[a] || a - b,
  )
}

export function search(
  vectors: Float32Array,
  query: Float32Array,
  n: number,
): { indices: number[]; scores: number[]; all: Float32Array } {
  const all = scoreAll(vectors, query)
  const indices = rankDescending(all).slice(0, n)
  return { indices, scores: indices.map((i) => all[i]), all }
}
