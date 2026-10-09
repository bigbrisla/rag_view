// Engine-internal data types (build artifacts). Trace types are generated: see @/types/trace.
import type { Params } from '@/types/trace'

export interface Doc {
  id: string
  title: string
  url: string
  category: string
  text: string
}

export interface Corpus {
  name: string
  version: string
  categories: Record<string, string>
  docs: Doc[]
}

/** Every chunk of the corpus for one (strategy, size, overlap) setting. */
export interface ChunkSet {
  id: string
  strategy: Params['strategy']
  size: number
  overlap: number
  n: number
  doc: Int32Array
  start: Int32Array
  end: Int32Array
  tokens: Int32Array
  /** n x DIM unit vectors, row-major */
  vectors: Float32Array
  /** n x 2 map coordinates in [-1, 1] */
  xy: Float32Array
  precomputed: boolean
}

export interface PresetInfo {
  id: string
  strategy: Params['strategy']
  chunk_size: number
  overlap: number
  n_chunks: number
  bytes: number
}

export interface Manifest {
  schema_version: string
  corpus: { name: string; version: string; n_docs: number }
  models: {
    embed: { id: string; dim: number; pooling: 'cls'; file: string; max_length: number }
    rerank: { id: string; file: string }
  }
  projection: { method: 'umap'; n_neighbors: number; min_dist: number; fitted_on: string }
  defaults: Params
  sizes: number[]
  overlap_pct: number[]
  presets: PresetInfo[]
  traces: {
    id: string
    trace_id: string
    question: string
    params: Partial<Params>
    file: string
  }[]
}

export interface EvidenceSpan {
  doc: string
  start: number
  end: number
}

export interface Claim {
  topic: string
  text: string
  evidence: EvidenceSpan[]
}

export interface CuratedQuestion {
  id: string
  question: string
  featured: boolean
  no_rag: string
  no_rag_note: string
  claims: Claim[]
}

export interface FailureCase {
  id: string
  question: string
  params: Partial<Params>
  title: string
  lesson: string
}

export interface Curated {
  questions: CuratedQuestion[]
  failure_cases: FailureCase[]
}

export const DIM = 384

export function presetId(strategy: string, size: number, overlap: number): string {
  return `${strategy}-${size}-${overlap}`
}
