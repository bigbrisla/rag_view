/**
 * Custom chunk sets: when the sliders leave the precomputed presets, the whole
 * corpus is re-chunked and re-embedded in the browser. New points are placed
 * on the map out-of-sample against the reference preset (see project.ts).
 * Mirrors build.make_chunkset(..., place_on=reference) in Python.
 */
import { chunkText, type Strategy, type TokenCounter } from './chunker'
import { roundToF16 } from './data'
import { place } from './project'
import { type ChunkSet, type Corpus, DIM, presetId } from './types'

export interface ChunkRow {
  doc: number
  start: number
  end: number
  tokens: number
}

export function chunkCorpus(
  corpus: Corpus,
  strategy: Strategy,
  size: number,
  overlap: number,
  count: TokenCounter,
): ChunkRow[] {
  const rows: ChunkRow[] = []
  corpus.docs.forEach((d, doc) => {
    for (const s of chunkText(d.text, size, overlap, strategy, count)) rows.push({ doc, ...s })
  })
  return rows
}

export async function buildChunkSet(
  corpus: Corpus,
  spec: { strategy: Strategy; size: number; overlap: number },
  rows: ChunkRow[],
  embed: (
    texts: string[],
    onPartial: (offset: number, v: Float32Array[]) => void,
  ) => Promise<Float32Array[]>,
  reference: ChunkSet,
  onProgress?: (done: number, xy: Float32Array) => void,
): Promise<ChunkSet> {
  const n = rows.length
  const vectors = new Float32Array(n * DIM)
  const xy = new Float32Array(n * 2)
  await embed(
    rows.map((r) => corpus.docs[r.doc].text.slice(r.start, r.end)),
    (offset, batch) => {
      batch.forEach((v, j) => {
        const i = offset + j
        // Round-trip through float16 like the build, so scores match presets.
        const q = roundToF16(v)
        vectors.set(q, i * DIM)
        const p = place(q, reference.vectors, reference.xy)
        xy[2 * i] = p.x
        xy[2 * i + 1] = p.y
      })
      onProgress?.(Math.min(n, offset + batch.length), xy)
    },
  )
  return {
    id: presetId(spec.strategy, spec.size, spec.overlap),
    strategy: spec.strategy,
    size: spec.size,
    overlap: spec.overlap,
    n,
    doc: Int32Array.from(rows, (r) => r.doc),
    start: Int32Array.from(rows, (r) => r.start),
    end: Int32Array.from(rows, (r) => r.end),
    tokens: Int32Array.from(rows, (r) => r.tokens),
    vectors,
    xy,
    precomputed: false,
  }
}
