// Loads build artifacts from disk and wires the engine to transformers.js in Node.
import fs from 'node:fs'
import path from 'node:path'
import { chunkSetFromFiles, type PresetFile } from '@/engine/data'
import { loadEmbedder, loadReranker, type Embedder, type Reranker } from '@/engine/models'
import type { EngineDeps } from '@/engine/pipeline'
import type { ChunkSet, Corpus, Curated, Manifest } from '@/engine/types'

export const ROOT = path.resolve(__dirname, '../..')
export const DATA = path.join(ROOT, 'web/public/data')

export const readJSON = <T>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T

export const manifest = readJSON<Manifest>(path.join(DATA, 'manifest.json'))
export const corpus = readJSON<Corpus>(path.join(DATA, 'corpus.json'))
export const curated = readJSON<Curated>(path.join(DATA, 'curated.json'))
export const wordTokens = readJSON<Record<string, number>>(path.join(DATA, 'word-tokens.json'))

export function loadPreset(id: string): ChunkSet {
  const meta = readJSON<PresetFile>(path.join(DATA, 'presets', `${id}.json`))
  const buf = fs.readFileSync(path.join(DATA, 'presets', `${id}.f16`))
  return chunkSetFromFiles(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

let embedder: Promise<Embedder> | null = null
let reranker: Promise<Reranker> | null = null

export async function nodeDeps(): Promise<EngineDeps> {
  const e = await (embedder ??= loadEmbedder(manifest.models.embed.id))
  const r = await (reranker ??= loadReranker(manifest.models.rerank.id))
  return {
    corpus,
    curated: curated.questions,
    manifest,
    embed: (texts) => e.embed(texts),
    rerank: (q, ps) => r.rerank(q, ps),
    tokenize: async (t) => e.tokenize(t),
    countTokens: async (ts) => e.countTokens(ts),
  }
}
