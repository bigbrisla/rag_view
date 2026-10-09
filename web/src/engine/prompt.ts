/** Prompt template for grounded QA. Mirrors pipeline/src/ragview/prompt.py. */

export const TEMPLATE_ID = 'grounded-qa-v1'
export const SYSTEM =
  'You answer questions about space exploration using only the numbered sources below. ' +
  'Cite every claim with its source number, like [1]. ' +
  "If the sources do not contain the answer, say that you don't know."

export interface Source {
  n: number
  title: string
  text: string
}

export function renderSources(sources: Source[]): string {
  if (!sources.length) return 'Sources:\n\n(none)'
  return 'Sources:\n\n' + sources.map((s) => `[${s.n}] ${s.title}\n${s.text}`).join('\n\n')
}

export function renderQuestion(question: string): string {
  return `Question: ${question}`
}

export interface PromptParts {
  system: string
  context: string
  question: string
}

export function promptParts(question: string, sources: Source[]): PromptParts {
  return { system: SYSTEM, context: renderSources(sources), question: renderQuestion(question) }
}

export function joinPrompt(parts: PromptParts): string {
  return [parts.system, parts.context, parts.question].join('\n\n')
}
