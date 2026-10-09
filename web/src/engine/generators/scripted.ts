/**
 * ScriptedGenerator: hand-written answers for curated questions, split into
 * claims. A claim is stated only if all of its evidence spans are covered by
 * chunks that are actually in the prompt, so retrieval quality changes the
 * answer for real. Mirrors generate.scripted in Python.
 */
import type { Citation } from '@/types/trace'
import type { Claim, EvidenceSpan } from '../types'
import { type Answer, type ContextChunk, type Generator, refusal, sentenceTokens } from './types'

/** Context chunks overlapping the span, or null if they don't cover all of it. */
export function coveringChunks(ev: EvidenceSpan, context: ContextChunk[]): ContextChunk[] | null {
  const hits = context
    .filter((c) => c.doc === ev.doc && c.start < ev.end && c.end > ev.start)
    .sort((a, b) => a.start - b.start || a.n - b.n)
  let reach = ev.start
  for (const c of hits) {
    if (c.start > reach) break
    reach = Math.max(reach, c.end)
  }
  return reach >= ev.end ? hits : null
}

export function scripted(claims: Claim[], context: ContextChunk[]): Answer {
  const ans: Answer = { status: 'answered', tokens: [], citations: [], missing: [] }
  for (const claim of claims) {
    let cites: Citation[] = []
    for (const ev of claim.evidence) {
      const hits = coveringChunks(ev, context)
      if (hits === null) {
        cites = []
        break
      }
      cites.push(
        ...hits.map((c) => ({
          n: c.n,
          chunk: c.chunk,
          doc: c.doc,
          start: Math.max(ev.start, c.start),
          end: Math.min(ev.end, c.end),
        })),
      )
    }
    if (!cites.length) {
      ans.missing.push(claim.topic)
      continue
    }
    const numbers = [...new Set(cites.map((c) => c.n))].sort((a, b) => a - b)
    ans.tokens.push(...sentenceTokens(claim.text, numbers, !ans.tokens.length))
    ans.citations.push(...cites)
  }
  if (!ans.tokens.length) return refusal(ans.missing)
  if (ans.missing.length) {
    ans.status = 'partial'
    const gap = `The retrieved sources don't cover ${ans.missing.join(' or ')}.`
    ans.tokens.push(...sentenceTokens(gap, [], false))
  }
  return ans
}

export function scriptedGenerator(claims: Claim[]): Generator {
  return { name: 'scripted', generate: async ({ context }) => scripted(claims, context) }
}
