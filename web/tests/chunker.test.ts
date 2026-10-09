import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chunkText, pack, splitSentences, tableCounter } from '@/engine/chunker'
import { corpus, readJSON, ROOT, wordTokens } from './node-deps'

interface Fixture {
  sentences: Record<string, [number, number][]>
  chunks: {
    doc: string
    strategy: 'sentence' | 'fixed'
    size: number
    overlap: number
    spans: number[][]
  }[]
}
const fixture = readJSON<Fixture>(path.join(ROOT, 'shared/fixtures/chunking.json'))
const text = (id: string) => corpus.docs.find((d) => d.id === id)!.text
const count = tableCounter(wordTokens)

describe('chunker parity with Python', () => {
  it.each(Object.keys(fixture.sentences))('splits sentences of %s identically', (doc) => {
    expect(splitSentences(text(doc))).toEqual(fixture.sentences[doc])
  })

  it.each(fixture.chunks.map((c) => [`${c.doc} ${c.strategy}-${c.size}-${c.overlap}`, c] as const))(
    'chunks %s identically',
    (_, c) => {
      const spans = chunkText(text(c.doc), c.size, c.overlap, c.strategy, count)
      expect(spans.map((s) => [s.start, s.end, s.tokens])).toEqual(c.spans)
    },
  )
})

describe('chunker behaviour', () => {
  it('respects abbreviations and initials', () => {
    const t = 'Dr. Smith met J. F. Kennedy in the U.S. capital. It rained. Then 3 people left!'
    expect(splitSentences(t).map(([s, e]) => t.slice(s, e))).toEqual([
      'Dr. Smith met J. F. Kennedy in the U.S. capital.',
      'It rained.',
      'Then 3 people left!',
    ])
  })

  it('packs with bounded overlap and always progresses', () => {
    const units = [3, 3, 3, 3, 3, 3].map((t, i) => ({ start: i * 10, end: i * 10 + 9, tokens: t }))
    expect(pack(units, 7, 3).map((c) => c.start)).toEqual([0, 10, 20, 30, 40])
    expect(pack([{ start: 0, end: 5, tokens: 10 }], 4, 3)).toHaveLength(1)
  })

  it('rejects invalid parameters', () => {
    expect(() => chunkText('abc', 10, 10, 'sentence', () => 1)).toThrow()
  })
})
