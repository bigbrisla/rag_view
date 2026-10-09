import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { beforeAll, describe, expect, it } from 'vitest'
import { tableCounter } from '@/engine/chunker'
import { chunkCorpus } from '@/engine/custom'
import { type EngineDeps, runPipeline } from '@/engine/pipeline'
import { membershipWeights, place } from '@/engine/project'
import { rankDescending, search } from '@/engine/retrieve'
import { traceId } from '@/engine/trace-id'
import type { Params, Trace } from '@/types/trace'
import {
  corpus,
  DATA,
  loadPreset,
  manifest,
  nodeDeps,
  readJSON,
  ROOT,
  wordTokens,
} from './node-deps'

// Recorded traces were produced on one machine; int8 matrix kernels give
// slightly different floats on other CPU architectures (up to about 0.015 in cosine),
// which can swap near-tied chunks and nudge a query's 2D placement.
const SCORE_TOL = 0.02
const POS_TOL = 0.06 // the map spans [-1, 1]

const ev = <P extends Trace['events'][number]['phase']>(t: Trace, phase: P) =>
  t.events.find((e) => e.phase === phase) as Extract<Trace['events'][number], { phase: P }>
const sameOrder = (x: number[], y: number[]) =>
  x.length === y.length && x.every((v, i) => v === y[i])

const schema = readJSON<object>(path.join(ROOT, 'shared/schema/trace.schema.json'))
const validate = new Ajv2020({ strict: false }).compile(schema)
const traceFiles = fs.readdirSync(path.join(DATA, 'traces')).filter((f) => f.endsWith('.json'))
const recorded = (f: string) => readJSON<Trace>(path.join(DATA, 'traces', f))

describe('recorded traces', () => {
  it.each(traceFiles)('%s validates against the JSON Schema', (f) => {
    expect(validate(recorded(f)), JSON.stringify(validate.errors)).toBe(true)
  })

  it('trace ids are computed exactly like Python', async () => {
    for (const f of traceFiles) {
      const t = recorded(f)
      expect(await traceId(t.question, t.params, t.corpus.version)).toBe(t.id)
    }
  })
})

describe('retrieval and projection', () => {
  it('ranks by score with index tie-breaking', () => {
    expect(rankDescending([0.5, 0.9, 0.5, 0.9])).toEqual([1, 3, 0, 2])
  })

  it('membership weights sum to log2(k)', () => {
    const d = Array.from({ length: 15 }, (_, i) => 0.1 + i * 0.03)
    const w = membershipWeights(d, 15)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(Math.log2(15), 4)
  })

  it('preset chunk boundaries match the browser chunker', () => {
    const preset = loadPreset('sentence-128-19')
    const rows = chunkCorpus(corpus, 'sentence', 128, 19, tableCounter(wordTokens))
    expect(rows.length).toBe(preset.n)
    rows.forEach((r, i) => {
      expect([r.doc, r.start, r.end, r.tokens]).toEqual([
        preset.doc[i],
        preset.start[i],
        preset.end[i],
        preset.tokens[i],
      ])
    })
  })
})

describe('browser engine vs Python reference', () => {
  let deps: EngineDeps
  beforeAll(async () => {
    deps = await nodeDeps()
  })

  it('retrieves the same chunks and places queries at the same spot', async () => {
    const fx = readJSON<{
      preset: string
      queries: { text: string; top: number[]; position: number[] }[]
    }>(path.join(ROOT, 'shared/fixtures/retrieval.json'))
    const preset = loadPreset(fx.preset)
    for (const q of fx.queries) {
      const [v] = await deps.embed([q.text])
      const got = search(preset.vectors, v, 10)
      // Same ranking up to near-ties: int8 kernels differ slightly across CPUs.
      q.top.forEach((chunk, rank) => {
        if (got.indices[rank] !== chunk) {
          expect(Math.abs(got.all[chunk] - got.scores[rank])).toBeLessThan(SCORE_TOL)
        }
      })
      const p = place(v, preset.vectors, preset.xy)
      expect(Math.hypot(p.x - q.position[0], p.y - q.position[1])).toBeLessThan(POS_TOL)
    }
  })

  it.each(traceFiles)('reproduces %s', async (f) => {
    const ref = recorded(f)
    const p: Params = ref.params
    const preset = loadPreset(`${p.strategy}-${p.chunk_size}-${p.overlap}`)
    const trace = await runPipeline(ref.question, p, preset, deps, 'replay')
    expect(validate(trace), JSON.stringify(validate.errors)).toBe(true)
    expect(trace.id).toBe(ref.id)
    expect(ev(trace, 'query').tokens).toEqual(ev(ref, 'query').tokens)

    // Scores of the same chunks agree; selections overlap almost entirely.
    const scores = new Map(ev(trace, 'retrieval').candidates.map((c) => [c.chunk, c.score]))
    for (const c of ev(ref, 'retrieval').candidates) {
      if (scores.has(c.chunk))
        expect(Math.abs(scores.get(c.chunk)! - c.score)).toBeLessThan(SCORE_TOL)
    }
    const a = new Set(ev(trace, 'rerank').selected)
    const b = new Set(ev(ref, 'rerank').selected)
    const common = [...a].filter((x) => b.has(x)).length
    expect(a.size + b.size === 0 ? 1 : common / Math.max(a.size, b.size)).toBeGreaterThanOrEqual(
      0.8,
    )

    // Where the final context is the same, prompt and answer must be identical.
    if (sameOrder(ev(trace, 'rerank').selected, ev(ref, 'rerank').selected)) {
      expect(ev(trace, 'prompt').text).toBe(ev(ref, 'prompt').text)
      expect(ev(trace, 'prompt').token_counts).toEqual(ev(ref, 'prompt').token_counts)
      expect(ev(trace, 'generation').tokens).toEqual(ev(ref, 'generation').tokens)
    }
    const pos = (t: Trace) => ev(t, 'query').position
    expect(Math.hypot(pos(trace).x - pos(ref).x, pos(trace).y - pos(ref).y)).toBeLessThan(POS_TOL)
  })

  it('manifest points at the preset UMAP was fitted on', () => {
    expect(manifest.presets.some((p) => p.id === manifest.projection.fitted_on)).toBe(true)
  })
})
