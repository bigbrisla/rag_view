/**
 * Token-aware chunking. Mirrors pipeline/src/ragview/chunking.py line by line;
 * tests/chunker.test.ts checks both against shared/fixtures/chunking.json.
 *
 * Text is segmented into units (sentences or words) with WordPiece token counts,
 * then packed greedily into chunks of at most `size` tokens; consecutive chunks
 * share up to `overlap` tokens of trailing units. Chunks never cut a word.
 */

export type Strategy = 'sentence' | 'fixed'
export type TokenCounter = (word: string) => number

export interface Span {
  start: number
  end: number
  tokens: number
}

const ABBREVIATIONS = new Set(
  (
    'mr mrs ms dr prof sr jr st vs etc e.g i.e no nos inc ltd co corp approx ' +
    'fig figs mt ft gen col lt capt sgt cmdr adm gov sen rep u.s u.k u.n ' +
    'jan feb aug sep sept oct nov dec ca c'
  ).split(' '),
)

const PARAGRAPH = /[^\n]+(?:\n(?!\n)[^\n]+)*/g
const WORD = /\S+/g
const SENTENCE_END = /[.!?]+["'”’)\]]*\s+/g
const SENTENCE_START = /[A-ZÀ-Þ0-9"'“‘([]/
const WORD_LEAD = /^["'“‘([]+/
const LETTER = /^\p{L}$/u

/** [start, end) character spans of sentences; paragraphs are hard breaks. */
export function splitSentences(text: string): [number, number][] {
  const spans: [number, number][] = []
  for (const para of text.matchAll(PARAGRAPH)) {
    const base = para.index
    const body = para[0]
    let start = 0
    for (const m of body.matchAll(SENTENCE_END)) {
      const next = m.index + m[0].length
      if (next >= body.length || !SENTENCE_START.test(body[next])) continue
      const punctEnd = m.index + m[0].trimEnd().length
      if (body[m.index] === '.' && isAbbreviation(body, start, m.index)) continue
      spans.push([base + start, base + punctEnd])
      start = next
    }
    const end = body.trimEnd().length
    if (start < end) spans.push([base + start, base + end])
  }
  return spans
}

function rfind(body: string, ch: string, from: number, to: number): number {
  // Python's str.rfind(ch, from, to): last index i with from <= i < to, else -1.
  if (to - 1 < 0) return -1
  const i = body.lastIndexOf(ch, to - 1)
  return i >= from ? i : -1
}

function isAbbreviation(body: string, sentenceStart: number, dot: number): boolean {
  const ws = Math.max(rfind(body, ' ', sentenceStart, dot), rfind(body, '\n', sentenceStart, dot))
  const word = body
    .slice(ws + 1, dot)
    .replace(WORD_LEAD, '')
    .toLowerCase()
  return ABBREVIATIONS.has(word) || LETTER.test(word)
}

export function wordUnits(text: string, start: number, end: number, count: TokenCounter): Span[] {
  const out: Span[] = []
  for (const m of text.slice(start, end).matchAll(WORD)) {
    out.push({ start: start + m.index, end: start + m.index + m[0].length, tokens: count(m[0]) })
  }
  return out
}

export function makeUnits(
  text: string,
  strategy: Strategy,
  size: number,
  count: TokenCounter,
): Span[] {
  if (strategy === 'fixed') return wordUnits(text, 0, text.length, count)
  const units: Span[] = []
  for (const [s, e] of splitSentences(text)) {
    const words = wordUnits(text, s, e, count)
    const total = words.reduce((a, w) => a + w.tokens, 0)
    if (total <= size) units.push({ start: s, end: e, tokens: total })
    // Over-long sentence: fall back to word windows of at most `size` tokens.
    else units.push(...pack(words, size, 0))
  }
  return units
}

/** Greedily pack units into chunks of <= size tokens with <= overlap shared tokens. */
export function pack(units: Span[], size: number, overlap: number): Span[] {
  const chunks: Span[] = []
  const n = units.length
  let i = 0
  while (i < n) {
    let j = i
    let tokens = 0
    while (j < n && (j === i || tokens + units[j].tokens <= size)) {
      tokens += units[j].tokens
      j++
    }
    chunks.push({ start: units[i].start, end: units[j - 1].end, tokens })
    if (j >= n) break
    let k = j
    let shared = 0
    while (k - 1 > i && shared + units[k - 1].tokens <= overlap) {
      shared += units[k - 1].tokens
      k--
    }
    i = k
  }
  return chunks
}

export function chunkText(
  text: string,
  size: number,
  overlap: number,
  strategy: Strategy,
  count: TokenCounter,
): Span[] {
  if (size < 1 || overlap < 0 || overlap >= size) {
    throw new Error('require size >= 1 and 0 <= overlap < size')
  }
  return pack(makeUnits(text, strategy, size, count), size, overlap)
}

/** Token counter backed by the build's word -> WordPiece count table. */
export function tableCounter(table: Record<string, number>): TokenCounter {
  return (word) => {
    const n = table[word]
    if (n === undefined) throw new Error(`no token count for ${JSON.stringify(word)}`)
    return n
  }
}
