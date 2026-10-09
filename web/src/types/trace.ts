/* Generated from shared/schema/trace.schema.json by json-schema-to-typescript. Do not edit: run npm run gen:types. */

export interface Trace {
  schema_version: '1'
  /**
   * Deterministic hash of question, params and corpus
   */
  id: string
  created_at: string
  source: 'live' | 'replay'
  engine: 'python' | 'browser'
  corpus: CorpusRef
  question: string
  params: Params
  events: (
    | ChunkingEvent
    | EmbeddingEvent
    | IndexingEvent
    | QueryEvent
    | RetrievalEvent
    | RerankEvent
    | PromptEvent
    | GenerationEvent
  )[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "CorpusRef".
 */
export interface CorpusRef {
  name: string
  /**
   * Content hash of the corpus
   */
  version: string
  n_docs: number
}
/**
 * User-controllable pipeline parameters.
 *
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "Params".
 */
export interface Params {
  /**
   * Max tokens per chunk
   */
  chunk_size: number
  /**
   * Max tokens shared by neighbouring chunks
   */
  overlap: number
  strategy: 'sentence' | 'fixed'
  top_k: number
  /**
   * Minimum cosine similarity
   */
  threshold: number
  rerank: boolean
  /**
   * Candidates given to the reranker
   */
  rerank_pool: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "ChunkingEvent".
 */
export interface ChunkingEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'chunking'
  /**
   * Chunk-set id, e.g. 'sentence-256-38'
   */
  preset: string
  /**
   * Loaded from build artifacts rather than computed now
   */
  precomputed: boolean
  strategy: 'sentence' | 'fixed'
  chunk_size: number
  overlap: number
  n_docs: number
  n_chunks: number
  avg_tokens: number
  /**
   * Document shown in the chunking view
   */
  focus_doc: string
  focus_chunks: ChunkSpan[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "ChunkSpan".
 */
export interface ChunkSpan {
  /**
   * Character offset in the document text (inclusive)
   */
  start: number
  /**
   * Character offset in the document text (exclusive)
   */
  end: number
  tokens: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "EmbeddingEvent".
 */
export interface EmbeddingEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'embedding'
  precomputed: boolean
  model: string
  dim: number
  pooling: 'cls' | 'mean'
  normalized: boolean
  n_vectors: number
  samples: VectorSample[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "VectorSample".
 */
export interface VectorSample {
  chunk: number
  /**
   * First dimensions of the vector
   */
  preview: number[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "IndexingEvent".
 */
export interface IndexingEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'indexing'
  index: 'exact-cosine'
  n_vectors: number
  dim: number
  bytes: number
  projection: ProjectionInfo
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "ProjectionInfo".
 */
export interface ProjectionInfo {
  method: 'umap'
  n_neighbors: number
  min_dist: number
  metric: 'cosine'
  /**
   * Preset the UMAP model was fitted on
   */
  fitted_on: string
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "QueryEvent".
 */
export interface QueryEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'query'
  text: string
  /**
   * WordPiece tokens fed to the embedding model
   */
  tokens: string[]
  preview: number[]
  position: Point
  /**
   * Chunks used to place the query in 2D
   */
  projection_neighbors: number[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "Point".
 */
export interface Point {
  x: number
  y: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "RetrievalEvent".
 */
export interface RetrievalEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'retrieval'
  metric: 'cosine'
  top_k: number
  threshold: number
  n_scanned: number
  candidates: Candidate[]
  /**
   * Chunks passed on (top-k above threshold)
   */
  selected: number[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "Candidate".
 */
export interface Candidate {
  chunk: number
  doc: string
  /**
   * Cosine similarity to the query
   */
  score: number
  rank: number
  above_threshold: boolean
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "RerankEvent".
 */
export interface RerankEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'rerank'
  enabled: boolean
  model: string | null
  items: RerankItem[]
  selected: number[]
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "RerankItem".
 */
export interface RerankItem {
  chunk: number
  retrieval_rank: number
  rerank_rank: number
  retrieval_score: number
  /**
   * Cross-encoder logit
   */
  rerank_score: number
  /**
   * sigmoid(rerank_score)
   */
  relevance: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "PromptEvent".
 */
export interface PromptEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'prompt'
  template: string
  context: PromptChunk[]
  text: string
  token_counts: TokenCounts
  tokenizer: string
  /**
   * Counts use the embedding tokenizer
   */
  approximate: boolean
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "PromptChunk".
 */
export interface PromptChunk {
  /**
   * 1-based source number used in citations
   */
  n: number
  chunk: number
  doc: string
  title: string
  tokens: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "TokenCounts".
 */
export interface TokenCounts {
  system: number
  context: number
  question: number
  total: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "GenerationEvent".
 */
export interface GenerationEvent {
  /**
   * Wall-clock time spent computing this phase
   */
  duration_ms: number
  phase: 'generation'
  generator: 'scripted' | 'extractive'
  simulated: boolean
  status: 'answered' | 'partial' | 'refused'
  tokens: AnswerToken[]
  citations: Citation[]
  /**
   * Topics the retrieved context did not cover
   */
  missing: string[]
  no_rag: NoRagAnswer | null
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "AnswerToken".
 */
export interface AnswerToken {
  text: string
  /**
   * Citation marker: source number
   */
  cite: number | null
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "Citation".
 */
export interface Citation {
  n: number
  chunk: number
  doc: string
  /**
   * Evidence span in the document
   */
  start: number
  end: number
}
/**
 * This interface was referenced by `Trace`'s JSON-Schema
 * via the `definition` "NoRagAnswer".
 */
export interface NoRagAnswer {
  text: string
  /**
   * Hand-written illustration, not model output
   */
  illustrative: boolean
}
