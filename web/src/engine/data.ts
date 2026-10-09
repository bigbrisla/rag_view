/** Decoding of build artifacts (pure functions: shared by the app and Node tests). */
import { type ChunkSet, DIM } from './types'

export interface PresetFile {
  id: string
  strategy: ChunkSet['strategy']
  chunk_size: number
  overlap: number
  n_chunks: number
  /** flat [doc, start, end, tokens, ...] */
  chunks: number[]
  /** flat [x, y, ...] */
  xy: number[]
}

let F16_TABLE: Float32Array | null = null

/** Lookup table from IEEE 754 half-precision bit patterns to float32. */
function f16Table(): Float32Array {
  if (F16_TABLE) return F16_TABLE
  const t = new Float32Array(65536)
  for (let h = 0; h < 65536; h++) {
    const sign = h & 0x8000 ? -1 : 1
    const exp = (h >> 10) & 0x1f
    const frac = h & 0x3ff
    t[h] =
      exp === 0
        ? sign * 2 ** -14 * (frac / 1024)
        : exp === 31
          ? frac
            ? NaN
            : sign * Infinity
          : sign * 2 ** (exp - 15) * (1 + frac / 1024)
  }
  return (F16_TABLE = t)
}

export function decodeF16(buffer: ArrayBuffer): Float32Array {
  const bits = new Uint16Array(buffer)
  const table = f16Table()
  const out = new Float32Array(bits.length)
  for (let i = 0; i < bits.length; i++) out[i] = table[bits[i]]
  return out
}

/** Round float32 vectors to float16 precision, as stored by the build. */
export function roundToF16(v: Float32Array): Float32Array {
  // Math.fround-style emulation: encode then decode through the same table.
  const out = new Float32Array(v.length)
  const table = f16Table()
  for (let i = 0; i < v.length; i++) out[i] = table[f32ToF16Bits(v[i])]
  return out
}

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)

/** float32 -> float16 bits with round-to-nearest-even (matches numpy's astype). */
export function f32ToF16Bits(value: number): number {
  f32[0] = value
  const x = u32[0]
  const sign = (x >>> 16) & 0x8000
  const exp = (x >>> 23) & 0xff
  let mant = x & 0x7fffff
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0)
  let e = exp - 127 + 15
  if (e >= 31) return sign | 0x7c00
  if (e <= 0) {
    if (e < -10) return sign
    mant |= 0x800000
    const shift = 14 - e
    const half = 1 << (shift - 1)
    let m = mant >>> shift
    const rest = mant & ((1 << shift) - 1)
    if (rest > half || (rest === half && m & 1)) m++
    return sign | m
  }
  let m = mant >>> 13
  const rest = mant & 0x1fff
  if (rest > 0x1000 || (rest === 0x1000 && m & 1)) {
    m++
    if (m === 0x400) {
      m = 0
      e++
      if (e >= 31) return sign | 0x7c00
    }
  }
  return sign | (e << 10) | m
}

export function chunkSetFromFiles(meta: PresetFile, vectors: ArrayBuffer): ChunkSet {
  const n = meta.n_chunks
  const doc = new Int32Array(n)
  const start = new Int32Array(n)
  const end = new Int32Array(n)
  const tokens = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    doc[i] = meta.chunks[4 * i]
    start[i] = meta.chunks[4 * i + 1]
    end[i] = meta.chunks[4 * i + 2]
    tokens[i] = meta.chunks[4 * i + 3]
  }
  const vec = decodeF16(vectors)
  if (vec.length !== n * DIM) throw new Error(`preset ${meta.id}: expected ${n}x${DIM} vectors`)
  return {
    id: meta.id,
    strategy: meta.strategy,
    size: meta.chunk_size,
    overlap: meta.overlap,
    n,
    doc,
    start,
    end,
    tokens,
    vectors: vec,
    xy: Float32Array.from(meta.xy),
    precomputed: true,
  }
}
