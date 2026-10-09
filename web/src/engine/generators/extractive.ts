/**
 * ExtractiveGenerator: for questions without a scripted answer, quote the
 * retrieved sentences most similar to the question, each with its source.
 * Mirrors generate.extractive in Python.
 */
import { splitSentences } from '../chunker'
import { rankDescending } from '../retrieve'
import { DIM } from '../types'
import { type Answer, type ContextChunk, type Generator, refusal, sentenceTokens } from './types'

export const EXTRACTIVE_LEAD = 'According to the sources:'
export const MAX_EXTRACTED = 3

const sentenceCache = new Map<string, [number, number][]>()

function sentencesOf(doc: string, text: string): [number, number][] {
  let s = sentenceCache.get(doc)
  if (!s) sentenceCache.set(doc, (s = splitSentences(text)))
  return s
}

export const extractiveGenerator: Generator = {
  name: 'extractive',
  async generate({ queryVector, context, texts, threshold, embed }): Promise<Answer> {
    const spans: [ContextChunk, number, number][] = []
    const seen = new Set<string>()
    for (const c of context) {
      let inside = sentencesOf(c.doc, texts[c.doc]).filter(([s, e]) => s >= c.start && e <= c.end)
      if (!inside.length) inside = [[c.start, c.end]]
      for (const [s, e] of inside) {
        const key = `${c.doc}:${s}:${e}`
        if (!seen.has(key)) {
          seen.add(key)
          spans.push([c, s, e])
        }
      }
    }
    if (!spans.length) return refusal()
    const vectors = await embed(spans.map(([c, s, e]) => texts[c.doc].slice(s, e)))
    const scores = vectors.map((v) => {
      let dot = 0
      for (let d = 0; d < DIM; d++) dot += v[d] * queryVector[d]
      return dot
    })
    const picked = rankDescending(scores)
      .filter((i) => scores[i] >= threshold)
      .slice(0, MAX_EXTRACTED)
    if (!picked.length) return refusal()
    const ans: Answer = {
      status: 'answered',
      tokens: sentenceTokens(EXTRACTIVE_LEAD, [], true),
      citations: [],
      missing: [],
    }
    for (const i of picked) {
      const [c, s, e] = spans[i]
      ans.tokens.push(
        ...sentenceTokens(texts[c.doc].slice(s, e).replaceAll('\n', ' '), [c.n], false),
      )
      ans.citations.push({ n: c.n, chunk: c.chunk, doc: c.doc, start: s, end: e })
    }
    return ans
  },
}
