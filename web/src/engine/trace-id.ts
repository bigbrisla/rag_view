/**
 * Deterministic trace ids, identical to engine.trace_id in Python:
 * sha256(json.dumps([question, params, corpus_version], sort_keys=True))[:16].
 * Matching ids let the app reuse a recorded trace for the same question and params.
 */
import type { Params } from '@/types/trace'

const FLOAT_FIELDS = new Set(['threshold'])

/** A JSON encoder matching Python's json.dumps defaults (', ' / ': ', ensure_ascii). */
function pyDumps(value: unknown, key = ''): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    return FLOAT_FIELDS.has(key) && Number.isInteger(value) ? value.toFixed(1) : String(value)
  }
  if (typeof value === 'string') {
    return JSON.stringify(value).replace(
      /[\u007f-￿]/g,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    )
  }
  if (Array.isArray(value)) return '[' + value.map((v) => pyDumps(v)).join(', ') + ']'
  const obj = value as Record<string, unknown>
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((k) => `${pyDumps(k)}: ${pyDumps(obj[k], k)}`)
      .join(', ') +
    '}'
  )
}

export async function traceId(question: string, params: Params, version: string): Promise<string> {
  const data = new TextEncoder().encode(pyDumps([question, params, version]))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}
