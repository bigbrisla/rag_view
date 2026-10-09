/**
 * Browser RAG engine: runs one question through the pipeline and returns a
 * Trace. Mirrors pipeline/src/ragview/engine.py; both emit the same schema.
 *
 * Model calls are injected (`EngineDeps`) so the same code runs against the
 * Web Worker in the app and against transformers.js directly in tests.
 */
import type {
  Candidate,
  ChunkingEvent,
  EmbeddingEvent,
  GenerationEvent,
  IndexingEvent,
  Params,
  PromptEvent,
  QueryEvent,
  RerankEvent,
  RerankItem,
  RetrievalEvent,
  Trace,
} from '@/types/trace'
import { extractiveGenerator } from './generators/extractive'
import { scriptedGenerator } from './generators/scripted'
import type { ContextChunk, Generator } from './generators/types'
import { place } from './project'
import { joinPrompt, promptParts, TEMPLATE_ID, type Source } from './prompt'
import { rankDescending, search } from './retrieve'
import { traceId } from './trace-id'
import { type ChunkSet, type Corpus, type CuratedQuestion, DIM, type Manifest } from './types'

export const PREVIEW_DIMS = 16

export interface EngineDeps {
  corpus: Corpus
  curated: CuratedQuestion[]
  manifest: Pick<Manifest, 'models' | 'projection'>
  embed(texts: string[]): Promise<Float32Array[]>
  rerank(query: string, passages: string[]): Promise<Float32Array>
  /** WordPiece tokens including [CLS] / [SEP] */
  tokenize(text: string): Promise<string[]>
  countTokens(texts: string[]): Promise<number[]>
}

const r = (x: number, nd = 4) => Math.round(x * 10 ** nd) / 10 ** nd
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

export function normalizeQuestion(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s?!.]+$/, '')
}

export function findCurated(question: string, curated: CuratedQuestion[]) {
  const key = normalizeQuestion(question)
  return curated.find((q) => normalizeQuestion(q.question) === key) ?? null
}

export function chunkText(chunks: ChunkSet, i: number, corpus: Corpus): string {
  return corpus.docs[chunks.doc[i]].text.slice(chunks.start[i], chunks.end[i])
}

export async function runPipeline(
  question: string,
  params: Params,
  chunks: ChunkSet,
  deps: EngineDeps,
  source: Trace['source'] = 'live',
): Promise<Trace> {
  const { corpus } = deps
  const docs = corpus.docs
  const texts = Object.fromEntries(docs.map((d) => [d.id, d.text]))
  const clock = () => performance.now()

  // 4. Query embedding and 2D placement (computed first: later phases depend on it).
  let t = clock()
  const [qvec] = await deps.embed([question])
  const position = place(qvec, chunks.vectors, chunks.xy, deps.manifest.projection.n_neighbors)
  const queryTokens = await deps.tokenize(question)
  const queryMs = clock() - t

  // 5. Retrieval: exact cosine over every chunk.
  t = clock()
  const pool = params.rerank ? Math.max(params.top_k, params.rerank_pool) : params.top_k
  const { indices, scores } = search(chunks.vectors, qvec, pool)
  const candidates: Candidate[] = indices.map((i, k) => ({
    chunk: i,
    doc: docs[chunks.doc[i]].id,
    score: r(scores[k]),
    rank: k + 1,
    above_threshold: scores[k] >= params.threshold,
  }))
  const passing = candidates.filter((c) => c.above_threshold).map((c) => c.chunk)
  const selected = params.rerank
    ? passing
    : candidates
        .slice(0, params.top_k)
        .filter((c) => c.above_threshold)
        .map((c) => c.chunk)
  const retrievalMs = clock() - t

  // 6. Optional cross-encoder reranking of the passing candidates.
  t = clock()
  let items: RerankItem[] = []
  let final = selected
  if (params.rerank && selected.length) {
    const raw = await deps.rerank(
      question,
      selected.map((i) => chunkText(chunks, i, corpus)),
    )
    const order = rankDescending(raw)
    const rankOf = new Map(order.map((o, k) => [o, k + 1]))
    const byChunk = new Map(candidates.map((c) => [c.chunk, c]))
    items = selected.map((ch, j) => ({
      chunk: ch,
      retrieval_rank: byChunk.get(ch)!.rank,
      rerank_rank: rankOf.get(j)!,
      retrieval_score: byChunk.get(ch)!.score,
      rerank_score: r(raw[j]),
      relevance: r(sigmoid(raw[j])),
    }))
    final = order.slice(0, params.top_k).map((o) => selected[o])
  }
  const rerankMs = clock() - t

  // 7. Prompt assembly.
  t = clock()
  const context: ContextChunk[] = final.map((ch, k) => ({
    n: k + 1,
    chunk: ch,
    doc: docs[chunks.doc[ch]].id,
    start: chunks.start[ch],
    end: chunks.end[ch],
  }))
  const sources: Source[] = context.map((c) => ({
    n: c.n,
    title: docs[chunks.doc[c.chunk]].title,
    text: chunkText(chunks, c.chunk, corpus),
  }))
  const parts = promptParts(question, sources)
  const [system, contextTokens, questionTokens] = await deps.countTokens([
    parts.system,
    parts.context,
    parts.question,
  ])
  const promptMs = clock() - t

  // 8. Simulated generation.
  t = clock()
  const curated = findCurated(question, deps.curated)
  const generator: Generator = curated ? scriptedGenerator(curated.claims) : extractiveGenerator
  const answer = await generator.generate({
    question,
    queryVector: qvec,
    context,
    texts,
    threshold: params.threshold,
    embed: deps.embed,
  })
  const generationMs = clock() - t

  // 1. The chunking view focuses on the document holding the best match.
  const focus = chunks.doc[final.length ? final[0] : indices[0]]
  const inDoc: number[] = []
  for (let i = 0; i < chunks.n; i++) if (chunks.doc[i] === focus) inDoc.push(i)
  let tokenSum = 0
  for (let i = 0; i < chunks.n; i++) tokenSum += chunks.tokens[i]

  const preview = (v: Float32Array, o = 0) =>
    Array.from(v.subarray(o, o + PREVIEW_DIMS), (x) => r(x))

  const events: Trace['events'] = [
    {
      phase: 'chunking',
      duration_ms: 0,
      preset: chunks.id,
      precomputed: chunks.precomputed,
      strategy: chunks.strategy,
      chunk_size: chunks.size,
      overlap: chunks.overlap,
      n_docs: docs.length,
      n_chunks: chunks.n,
      avg_tokens: r(tokenSum / chunks.n, 1),
      focus_doc: docs[focus].id,
      focus_chunks: inDoc.map((i) => ({
        start: chunks.start[i],
        end: chunks.end[i],
        tokens: chunks.tokens[i],
      })),
    } satisfies ChunkingEvent,
    {
      phase: 'embedding',
      duration_ms: 0,
      precomputed: chunks.precomputed,
      model: deps.manifest.models.embed.id,
      dim: DIM,
      pooling: 'cls',
      normalized: true,
      n_vectors: chunks.n,
      samples: (final.length ? final : [indices[0]]).map((i) => ({
        chunk: i,
        preview: preview(chunks.vectors, i * DIM),
      })),
    } satisfies EmbeddingEvent,
    {
      phase: 'indexing',
      duration_ms: 0,
      index: 'exact-cosine',
      n_vectors: chunks.n,
      dim: DIM,
      bytes: chunks.n * DIM * 2,
      projection: {
        method: 'umap',
        n_neighbors: deps.manifest.projection.n_neighbors,
        min_dist: deps.manifest.projection.min_dist,
        metric: 'cosine',
        fitted_on: deps.manifest.projection.fitted_on,
      },
    } satisfies IndexingEvent,
    {
      phase: 'query',
      duration_ms: r(queryMs, 2),
      text: question,
      tokens: queryTokens,
      preview: preview(qvec),
      position: { x: r(position.x), y: r(position.y) },
      projection_neighbors: position.neighbors,
    } satisfies QueryEvent,
    {
      phase: 'retrieval',
      duration_ms: r(retrievalMs, 2),
      metric: 'cosine',
      top_k: params.top_k,
      threshold: params.threshold,
      n_scanned: chunks.n,
      candidates,
      selected,
    } satisfies RetrievalEvent,
    {
      phase: 'rerank',
      duration_ms: r(rerankMs, 2),
      enabled: params.rerank,
      model: params.rerank ? deps.manifest.models.rerank.id : null,
      items,
      selected: final,
    } satisfies RerankEvent,
    {
      phase: 'prompt',
      duration_ms: r(promptMs, 2),
      template: TEMPLATE_ID,
      context: context.map((c, k) => ({
        n: c.n,
        chunk: c.chunk,
        doc: c.doc,
        title: sources[k].title,
        tokens: chunks.tokens[c.chunk],
      })),
      text: joinPrompt(parts),
      token_counts: {
        system,
        context: contextTokens,
        question: questionTokens,
        total: system + contextTokens + questionTokens,
      },
      tokenizer: deps.manifest.models.embed.id,
      approximate: true,
    } satisfies PromptEvent,
    {
      phase: 'generation',
      duration_ms: r(generationMs, 2),
      generator: generator.name,
      simulated: true,
      status: answer.status,
      tokens: answer.tokens,
      citations: answer.citations,
      missing: answer.missing,
      no_rag: curated ? { text: curated.no_rag, illustrative: true } : null,
    } satisfies GenerationEvent,
  ]

  return {
    schema_version: '1',
    id: await traceId(question, params, corpus.version),
    created_at: new Date().toISOString().replace(/\.\d+Z$/, '+00:00'),
    source,
    engine: 'browser',
    corpus: { name: corpus.name, version: corpus.version, n_docs: docs.length },
    question,
    params,
    events,
  }
}
