/**
 * Generation is simulated in RAGView: no LLM is called. A Generator turns the
 * question and the retrieved context into answer tokens and citations. A real
 * LLM adapter would implement the same interface (stream tokens, map [n]
 * markers to sources) and slot into pipeline.ts unchanged.
 */
import type { AnswerToken, Citation, GenerationEvent } from '@/types/trace'

export interface ContextChunk {
  /** 1-based source number in the prompt */
  n: number
  chunk: number
  doc: string
  start: number
  end: number
}

export interface Answer {
  status: GenerationEvent['status']
  tokens: AnswerToken[]
  citations: Citation[]
  missing: string[]
}

export interface GeneratorInput {
  question: string
  queryVector: Float32Array
  context: ContextChunk[]
  texts: Record<string, string>
  threshold: number
  embed: (texts: string[]) => Promise<Float32Array[]>
}

export interface Generator {
  name: GenerationEvent['generator']
  generate(input: GeneratorInput): Promise<Answer>
}

export const REFUSAL = "I couldn't find the answer in the retrieved sources, so I won't guess."

/** Split a sentence into word tokens; citation markers go before the final period. */
export function sentenceTokens(text: string, cites: number[], first: boolean): AnswerToken[] {
  const words = text.split(' ')
  let tail = ''
  const last = words[words.length - 1]
  if (cites.length && last && '.!?'.includes(last[last.length - 1])) {
    words[words.length - 1] = last.slice(0, -1)
    tail = last[last.length - 1]
  }
  const tokens: AnswerToken[] = words.map((w, i) => ({
    text: first && i === 0 ? w : ' ' + w,
    cite: null,
  }))
  for (const n of cites) tokens.push({ text: '', cite: n })
  if (tail) tokens.push({ text: tail, cite: null })
  return tokens
}

export function refusal(missing: string[] = []): Answer {
  return { status: 'refused', tokens: sentenceTokens(REFUSAL, [], true), citations: [], missing }
}
