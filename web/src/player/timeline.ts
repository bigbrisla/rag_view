/** Phase order and how long each phase plays at 1x speed (seconds). */
import type { Trace } from '@/types/trace'

export const PHASES = [
  'chunking',
  'embedding',
  'indexing',
  'query',
  'retrieval',
  'rerank',
  'prompt',
  'generation',
] as const
export type PhaseName = (typeof PHASES)[number]

export type EventOf<P extends PhaseName> = Extract<Trace['events'][number], { phase: P }>

export function eventOf<P extends PhaseName>(trace: Trace, phase: P): EventOf<P> {
  const ev = trace.events.find((e) => e.phase === phase)
  if (!ev) throw new Error(`trace ${trace.id} has no ${phase} event`)
  return ev as EventOf<P>
}

export function phaseDurations(trace: Trace): number[] {
  const rerank = eventOf(trace, 'rerank')
  const gen = eventOf(trace, 'generation')
  const answerSeconds = Math.min(12, 1.2 + gen.tokens.length * 0.055)
  return PHASES.map(
    (p) =>
      ({
        chunking: 5,
        embedding: 4.5,
        indexing: 3.5,
        query: 3.5,
        retrieval: 4.5,
        rerank: rerank.enabled ? 4.5 : 2.2,
        prompt: 4.5,
        generation: answerSeconds,
      })[p],
  )
}

/** Normalised progress of `t` inside [a, b], clamped to [0, 1]. */
export function span(t: number, a: number, b: number): number {
  return Math.min(1, Math.max(0, (t - a) / (b - a)))
}
