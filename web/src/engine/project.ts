/**
 * Out-of-sample placement on the 2D map. Mirrors projection.place in Python:
 * UMAP's own initialisation for new points, i.e. a membership-weighted mean of
 * the 2D positions of the k nearest neighbours in embedding space.
 */
import { rankDescending, scoreAll } from './retrieve'

export const N_NEIGHBORS = 15

/** UMAP smooth-kNN memberships exp(-(d - rho) / sigma), with sum = log2(k). */
export function membershipWeights(distances: number[], k: number): number[] {
  const rho = Math.min(...distances)
  const target = Math.log2(k)
  let lo = 0
  let hi = Infinity
  let sigma = 1
  const weights = (s: number) => distances.map((d) => Math.exp(-Math.max(d - rho, 0) / s))
  for (let it = 0; it < 64; it++) {
    const psum = weights(sigma).reduce((a, b) => a + b, 0)
    if (Math.abs(psum - target) < 1e-5) break
    if (psum > target) {
      hi = sigma
      sigma = (lo + hi) / 2
    } else {
      lo = sigma
      sigma = hi === Infinity ? sigma * 2 : (lo + hi) / 2
    }
  }
  return weights(sigma)
}

export function place(
  query: Float32Array,
  vectors: Float32Array,
  xy: Float32Array,
  k = N_NEIGHBORS,
): { x: number; y: number; neighbors: number[] } {
  const sims = scoreAll(vectors, query)
  const neighbors = rankDescending(sims).slice(0, k)
  const w = membershipWeights(
    neighbors.map((i) => 1 - sims[i]),
    k,
  )
  let x = 0
  let y = 0
  let total = 0
  neighbors.forEach((i, j) => {
    x += w[j] * xy[2 * i]
    y += w[j] * xy[2 * i + 1]
    total += w[j]
  })
  return { x: x / total, y: y / total, neighbors }
}
