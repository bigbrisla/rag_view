/**
 * Application state: build artifacts, the current trace and its chunk set,
 * pipeline settings, and the orchestration of a run (replay or live).
 */
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import { getCached, putCached } from '@/engine/cache'
import { type Strategy, tableCounter } from '@/engine/chunker'
import { ModelClient } from '@/engine/client'
import { buildChunkSet, chunkCorpus } from '@/engine/custom'
import { chunkSetFromFiles, type PresetFile } from '@/engine/data'
import { type EngineDeps, runPipeline } from '@/engine/pipeline'
import { traceId } from '@/engine/trace-id'
import {
  type ChunkSet,
  type Corpus,
  type Curated,
  type FailureCase,
  type Manifest,
  presetId,
} from '@/engine/types'
import type { Citation, Params, Trace } from '@/types/trace'
import { usePlayer } from './player'

export const MAX_QUESTION = 200

export interface EvalRow {
  preset: string
  rerank: boolean
  n_chunks: number
  'hit@1': number
  'hit@3': number
  'hit@5': number
  'mrr@10': number
}

export interface EvalData {
  n_questions: number
  rows: EvalRow[]
}

type ModelState = { state: 'idle' | 'loading' | 'ready' | 'error'; loaded: number; total: number }

const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(dataUrl(path))
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export function overlapTokens(size: number, pct: number): number {
  return Math.round((size * pct) / 100)
}

export const useApp = defineStore('app', () => {
  const manifest = shallowRef<Manifest | null>(null)
  const corpus = shallowRef<Corpus | null>(null)
  const curated = shallowRef<Curated | null>(null)
  const wordTokens = shallowRef<Record<string, number>>({})
  const evalData = shallowRef<EvalData | null>(null)

  const trace = shallowRef<Trace | null>(null)
  const chunks = shallowRef<ChunkSet | null>(null)
  /** Draft settings edited in the UI; `trace.params` are the ones that ran. */
  const params = ref<Params | null>(null)
  const overlapPct = ref(15)
  const question = ref('')

  const status = ref<'loading' | 'ready' | 'running' | 'building' | 'error'>('loading')
  const error = ref('')
  const build = reactive({ done: 0, total: 0, id: '', etaSeconds: 0 })
  const buildPoints = shallowRef<{ doc: Int32Array; xy: Float32Array; done: number } | null>(null)
  const models = reactive<Record<'embed' | 'rerank', ModelState>>({
    embed: { state: 'idle', loaded: 0, total: 0 },
    rerank: { state: 'idle', loaded: 0, total: 0 },
  })

  /** Chunk / citation currently highlighted from the side panel. */
  const highlight = shallowRef<{ chunk: number; citation?: Citation } | null>(null)
  const categoryFocus = ref<string | null>(null)

  const chunkSets = new Map<string, Promise<ChunkSet>>()
  let client: ModelClient | null = null

  const count = computed(() => tableCounter(wordTokens.value))
  const presetIds = computed(() => new Set(manifest.value?.presets.map((p) => p.id) ?? []))
  const failureCases = computed<FailureCase[]>(() => curated.value?.failure_cases ?? [])

  function isPreset(p: Pick<Params, 'strategy' | 'chunk_size' | 'overlap'>) {
    return presetIds.value.has(presetId(p.strategy, p.chunk_size, p.overlap))
  }

  function models_(): ModelClient {
    if (!client) {
      const m = manifest.value!.models
      client = new ModelClient({ embed: m.embed.id, rerank: m.rerank.id }, (which, p) => {
        models[which].loaded = p.loaded
        models[which].total = p.total
      })
    }
    return client
  }

  async function loadModel(which: 'embed' | 'rerank') {
    if (models[which].state === 'ready') return
    models[which].state = 'loading'
    try {
      await models_().load(which)
      models[which].state = 'ready'
    } catch (e) {
      models[which].state = 'error'
      throw e
    }
  }

  function deps(): EngineDeps {
    const c = models_()
    return {
      corpus: corpus.value!,
      curated: curated.value!.questions,
      manifest: manifest.value!,
      embed: (texts) => c.embed(texts),
      rerank: (q, ps) => c.rerank(q, ps),
      tokenize: (t) => c.tokenize(t),
      countTokens: (ts) => c.countTokens(ts),
    }
  }

  async function loadPreset(id: string): Promise<ChunkSet> {
    const [meta, buf] = await Promise.all([
      fetchJSON<PresetFile>(`presets/${id}.json`),
      fetch(dataUrl(`presets/${id}.f16`)).then((r) => {
        if (!r.ok) throw new Error(`presets/${id}.f16: HTTP ${r.status}`)
        return r.arrayBuffer()
      }),
    ])
    return chunkSetFromFiles(meta, buf)
  }

  /** Chunk set for these settings: a precomputed preset, or built in the browser. */
  function chunkSetFor(p: Pick<Params, 'strategy' | 'chunk_size' | 'overlap'>): Promise<ChunkSet> {
    const id = presetId(p.strategy, p.chunk_size, p.overlap)
    let cs = chunkSets.get(id)
    if (!cs) {
      cs = isPreset(p) ? loadPreset(id) : buildCustom(p.strategy, p.chunk_size, p.overlap)
      chunkSets.set(id, cs)
      cs.catch(() => chunkSets.delete(id))
    }
    return cs
  }

  async function buildCustom(strategy: Strategy, size: number, overlap: number) {
    const key = `${corpus.value!.version}:${manifest.value!.models.embed.id}:${presetId(strategy, size, overlap)}`
    const cached = await getCached(key)
    if (cached) return cached
    const reference = await chunkSetFor(parseId(manifest.value!.projection.fitted_on))
    await loadModel('embed')
    const rows = chunkCorpus(corpus.value!, strategy, size, overlap, count.value)
    const doc = Int32Array.from(rows, (r) => r.doc)
    status.value = 'building'
    Object.assign(build, {
      done: 0,
      total: rows.length,
      id: presetId(strategy, size, overlap),
      etaSeconds: 0,
    })
    const started = performance.now()
    buildPoints.value = { doc, xy: new Float32Array(rows.length * 2), done: 0 }
    const cs = await buildChunkSet(
      corpus.value!,
      { strategy, size, overlap },
      rows,
      (texts, onPartial) => models_().embed(texts, onPartial),
      reference,
      (done, xy) => {
        build.done = done
        const perChunk = (performance.now() - started) / 1000 / done
        build.etaSeconds = Math.round(perChunk * (rows.length - done))
        buildPoints.value = { doc, xy, done }
      },
    )
    buildPoints.value = null
    putCached(key, cs)
    return cs
  }

  function parseId(id: string): Pick<Params, 'strategy' | 'chunk_size' | 'overlap'> {
    const [strategy, size, overlap] = id.split('-')
    return { strategy: strategy as Strategy, chunk_size: Number(size), overlap: Number(overlap) }
  }

  async function init() {
    try {
      const [m, c, q, w] = await Promise.all([
        fetchJSON<Manifest>('manifest.json'),
        fetchJSON<Corpus>('corpus.json'),
        fetchJSON<Curated>('curated.json'),
        fetchJSON<Record<string, number>>('word-tokens.json'),
      ])
      manifest.value = m
      corpus.value = c
      curated.value = q
      wordTokens.value = w
      params.value = { ...m.defaults }
      fetchJSON<EvalData>('eval.json')
        .then((e) => (evalData.value = e))
        .catch(() => {})
      const first = m.traces.find((t) => t.id === 'q-voyager-interstellar') ?? m.traces[0]
      await show(await fetchJSON<Trace>(first.file), { autoplay: true })
    } catch (e) {
      fail(e)
    }
  }

  function fail(e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
    status.value = 'error'
    console.error(e)
  }

  /** Display a trace: load its chunk set, then hand it to the player. */
  async function show(t: Trace, opts: { autoplay?: boolean; at?: number } = {}) {
    status.value = 'running'
    const cs = await chunkSetFor(t.params)
    chunks.value = cs
    trace.value = t
    question.value = t.question
    params.value = { ...t.params }
    overlapPct.value = Math.round((t.params.overlap / t.params.chunk_size) * 20) * 5
    highlight.value = null
    status.value = 'ready'
    usePlayer().load(t, opts)
  }

  /** Run a question: reuse a recorded trace when one matches, else compute live. */
  async function ask(q: string, p: Params = params.value!, opts: { at?: number } = {}) {
    const text = q.trim().slice(0, MAX_QUESTION)
    if (!text || !corpus.value) return
    try {
      status.value = 'running'
      error.value = ''
      const id = await traceId(text, p, corpus.value.version)
      const recorded = manifest.value!.traces.find((t) => t.trace_id === id)
      if (recorded)
        return await show(await fetchJSON<Trace>(recorded.file), { autoplay: true, ...opts })
      const cs = await chunkSetFor(p)
      status.value = 'running'
      await loadModel('embed')
      if (p.rerank) await loadModel('rerank')
      const t = await runPipeline(text, p, cs, deps(), 'live')
      await show(t, { autoplay: true, ...opts })
    } catch (e) {
      fail(e)
    }
  }

  /** Re-run the current question with new settings, starting at the affected phase. */
  async function rerun(p: Params) {
    const prev = params.value
    const at =
      prev &&
      (prev.chunk_size !== p.chunk_size ||
        prev.overlap !== p.overlap ||
        prev.strategy !== p.strategy)
        ? 0
        : prev && prev.rerank !== p.rerank
          ? 5
          : 4
    await ask(question.value, p, { at })
  }

  async function runFailureCase(fc: FailureCase) {
    const q = curated.value!.questions.find((x) => x.id === fc.question)!
    await ask(q.question, { ...manifest.value!.defaults, ...fc.params })
  }

  async function importTrace(t: Trace) {
    try {
      await show(t, { autoplay: true })
    } catch (e) {
      fail(e)
    }
  }

  return {
    manifest,
    corpus,
    curated,
    wordTokens,
    evalData,
    trace,
    chunks,
    params,
    overlapPct,
    question,
    status,
    error,
    build,
    buildPoints,
    models,
    highlight,
    categoryFocus,
    count,
    failureCases,
    isPreset,
    init,
    ask,
    rerun,
    runFailureCase,
    importTrace,
    loadModel,
  }
})
