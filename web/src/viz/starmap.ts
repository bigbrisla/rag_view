/**
 * Canvas renderer for the 2D map of the embedding space.
 *
 * `draw(scene)` is a pure function of the scene: which trace, which phase and
 * how far into it. Nothing is animated imperatively, so scrubbing backwards
 * or changing speed is free. A few thousand points render comfortably at 60fps.
 */
import gsap from 'gsap'
import type { ChunkSet, Corpus } from '@/engine/types'
import { eventOf } from '@/player/timeline'
import type { Trace } from '@/types/trace'

export const CATEGORY_ORDER = ['bodies', 'robotic', 'crewed', 'rockets', 'people'] as const
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star'
// Secondary encoding: five hues cannot all be told apart on a scatter, so each
// category also gets its own marker shape (and a direct label on the map).
export const CATEGORY_SHAPE: Record<string, Shape> = {
  bodies: 'circle',
  robotic: 'square',
  crewed: 'triangle',
  rockets: 'diamond',
  people: 'star',
}

export interface Scene {
  chunks: ChunkSet
  corpus: Corpus
  trace: Trace | null
  /** phase index 0..7 and progress 0..1 inside it */
  phase: number
  progress: number
  highlight: number | null
  hover: number | null
  categoryFocus: string | null
  build: { doc: Int32Array; xy: Float32Array; done: number } | null
  /** user camera (d3-zoom); null = automatic camera */
  user: { k: number; x: number; y: number } | null
}

interface Theme {
  surface: string
  ink: string
  ink2: string
  muted: string
  grid: string
  cats: Record<string, string>
}

const ease = {
  out: gsap.parseEase('power2.out'),
  inOut: gsap.parseEase('power2.inOut'),
  back: gsap.parseEase('back.out(2.2)'),
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const PHASE = {
  chunking: 0,
  embedding: 1,
  indexing: 2,
  query: 3,
  retrieval: 4,
  rerank: 5,
  prompt: 6,
  generation: 7,
}

export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    surface: v('--surface'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    muted: v('--muted'),
    grid: v('--grid'),
    cats: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, v(`--cat-${c}`)])),
  }
}

export function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  r: number,
) {
  switch (shape) {
    case 'circle':
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
      break
    case 'square':
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
      break
    case 'triangle':
      ctx.moveTo(x, y - r * 1.15)
      ctx.lineTo(x + r * 1.05, y + r * 0.75)
      ctx.lineTo(x - r * 1.05, y + r * 0.75)
      ctx.closePath()
      break
    case 'diamond':
      ctx.moveTo(x, y - r * 1.25)
      ctx.lineTo(x + r * 1.05, y)
      ctx.lineTo(x, y + r * 1.25)
      ctx.lineTo(x - r * 1.05, y)
      ctx.closePath()
      break
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.55 : r * 1.3
        if (i === 0) ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
        else ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
      }
      ctx.closePath()
      break
  }
}

export class StarMap {
  private ctx: CanvasRenderingContext2D
  private w = 1
  private h = 1
  private dpr = 1
  theme: Theme
  /** the transform used for the last frame (screen = k * base + t) */
  camera = { k: 1, x: 0, y: 0 }
  private screen = new Float32Array(0)
  private visible = new Uint8Array(0)
  private categoryCache = new WeakMap<ChunkSet, string[]>()
  private centroidCache = new WeakMap<ChunkSet, Map<string, [number, number]>>()

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.theme = readTheme()
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w
    this.h = h
    this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
  }

  get size() {
    return { w: this.w, h: this.h }
  }

  /** Data [-1, 1]^2 -> base screen coordinates (before the camera). */
  private base(x: number, y: number): [number, number] {
    const s = Math.min(this.w, this.h) * 0.46
    return [this.w / 2 + x * s, this.h / 2 - y * s]
  }

  private categories(cs: ChunkSet, corpus: Corpus): string[] {
    let c = this.categoryCache.get(cs)
    if (!c) {
      c = Array.from(cs.doc, (d) => corpus.docs[d].category)
      this.categoryCache.set(cs, c)
    }
    return c
  }

  private centroids(cs: ChunkSet, cats: string[]): Map<string, [number, number]> {
    let m = this.centroidCache.get(cs)
    if (!m) {
      m = new Map()
      for (const cat of CATEGORY_ORDER) {
        const xs: number[] = []
        const ys: number[] = []
        cats.forEach((c, i) => {
          if (c === cat) {
            xs.push(cs.xy[2 * i])
            ys.push(cs.xy[2 * i + 1])
          }
        })
        if (!xs.length) continue
        const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]
        m.set(cat, [med(xs), med(ys)])
      }
      this.centroidCache.set(cs, m)
    }
    return m
  }

  /** Camera that frames the query and its candidates during retrieval. */
  private autoCamera(scene: Scene): { k: number; x: number; y: number } {
    const id = { k: 1, x: 0, y: 0 }
    const { trace, phase, progress, chunks } = scene
    if (!trace || phase < PHASE.retrieval) return id
    const q = eventOf(trace, 'query').position
    const r = eventOf(trace, 'retrieval')
    const rr = eventOf(trace, 'rerank')
    const chosen = rr.selected.length ? rr.selected : r.candidates.slice(0, 5).map((c) => c.chunk)
    const focus = new Set(chosen)
    const pts: [number, number][] = [this.base(q.x, q.y)]
    for (const i of focus) pts.push(this.base(chunks.xy[2 * i], chunks.xy[2 * i + 1]))
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    const pad = Math.min(this.w, this.h) * 0.22
    const k = Math.max(
      1,
      Math.min(3.5, (this.w - 2 * pad) / (x1 - x0 || 1), (this.h - 2 * pad) / (y1 - y0 || 1)),
    )
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const target = { k, x: this.w / 2 - k * cx, y: this.h / 2 - k * cy }
    const t = phase === PHASE.retrieval ? ease.inOut(seg(progress, 0.05, 0.55)) : 1
    return { k: lerp(1, target.k, t), x: lerp(0, target.x, t), y: lerp(0, target.y, t) }
  }

  /** Screen position of point i in the last frame. */
  pointScreen(i: number): [number, number] {
    return [this.screen[2 * i], this.screen[2 * i + 1]]
  }

  /** Nearest visible point within `radius` px of (x, y), or null. */
  pick(x: number, y: number, radius = 10): number | null {
    let best: number | null = null
    let bestD = radius * radius
    for (let i = 0; i < this.visible.length; i++) {
      if (!this.visible[i]) continue
      const dx = this.screen[2 * i] - x
      const dy = this.screen[2 * i + 1] - y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  draw(scene: Scene) {
    const { ctx, theme } = this
    const { chunks, corpus, trace, phase, progress } = scene
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)

    const cam = scene.user ?? this.autoCamera(scene)
    this.camera = cam
    const project = (x: number, y: number): [number, number] => {
      const [bx, by] = this.base(x, y)
      return [cam.k * bx + cam.x, cam.k * by + cam.y]
    }

    this.drawGrid(project, cam.k)

    const n = chunks.n
    const cats = this.categories(chunks, corpus)
    if (this.screen.length !== 2 * n) {
      this.screen = new Float32Array(2 * n)
      this.visible = new Uint8Array(n)
    }

    // Phase-dependent sets taken from the trace.
    const retrieval = trace ? eventOf(trace, 'retrieval') : null
    const rerank = trace ? eventOf(trace, 'rerank') : null
    const candidates = new Set(retrieval?.candidates.map((c) => c.chunk) ?? [])
    const final = rerank?.selected ?? []
    const finalSet = new Set(final)

    const appear = (i: number) => {
      if (scene.build) return 1
      if (phase < PHASE.embedding) return 0
      if (phase > PHASE.embedding) return 1
      const start = (i / n) * 0.82
      return ease.back(seg(progress, start, start + 0.18))
    }
    const baseAlpha =
      phase <= PHASE.embedding
        ? 0.6
        : phase === PHASE.indexing
          ? lerp(0.6, 0.95, ease.out(progress))
          : 0.95
    const dim =
      phase < PHASE.retrieval ? 0 : phase === PHASE.retrieval ? ease.out(seg(progress, 0, 0.5)) : 1
    const pointR = 2.8 * (1 + 0.2 * Math.log2(cam.k))

    // Points, drawn per category so shapes and colours batch.
    const points = scene.build ?? { doc: chunks.doc, xy: chunks.xy, done: n }
    const buildCats = scene.build
      ? Array.from(scene.build.doc, (d) => corpus.docs[d].category)
      : cats
    for (const cat of CATEGORY_ORDER) {
      const shape = CATEGORY_SHAPE[cat]
      const focusDim = scene.categoryFocus && scene.categoryFocus !== cat ? 0.15 : 1
      ctx.fillStyle = theme.cats[cat]
      for (const layer of [0, 1]) {
        // layer 0: dimmed background points, layer 1: candidates on top
        ctx.beginPath()
        let any = false
        const alpha = layer === 0 ? baseAlpha * lerp(1, 0.3, dim) : baseAlpha
        for (let i = 0; i < points.done; i++) {
          if (buildCats[i] !== cat) continue
          const isCand = !scene.build && candidates.has(i)
          if ((layer === 1) !== isCand) continue
          const a = appear(i)
          const [sx, sy] = project(points.xy[2 * i], points.xy[2 * i + 1])
          if (!scene.build) {
            this.screen[2 * i] = sx
            this.screen[2 * i + 1] = sy
            this.visible[i] = a > 0.5 ? 1 : 0
          }
          if (a <= 0) continue
          shapePath(ctx, shape, sx, sy, pointR * a)
          any = true
        }
        if (any) {
          ctx.globalAlpha = alpha * focusDim
          ctx.fill()
        }
      }
    }
    ctx.globalAlpha = 1
    if (scene.build) return

    // Cluster labels: direct labels in text ink, with the category's marker.
    if (phase >= PHASE.indexing) {
      const a = phase === PHASE.indexing ? ease.out(seg(progress, 0.15, 0.7)) : lerp(1, 0.45, dim)
      const cents = this.centroids(chunks, cats)
      ctx.font = `500 12px ${getComputedStyle(document.documentElement).getPropertyValue('--font-sans')}`
      ctx.textBaseline = 'middle'
      for (const [cat, [x, y]] of cents) {
        const [sx, sy] = project(x, y)
        const label = corpus.categories[cat] ?? cat
        const tw = ctx.measureText(label).width
        const lx = sx - tw / 2
        const focusDim = scene.categoryFocus && scene.categoryFocus !== cat ? 0.3 : 1
        ctx.globalAlpha = a * focusDim
        ctx.fillStyle = theme.surface
        ctx.globalAlpha = a * focusDim * 0.75
        ctx.fillRect(lx - 18, sy - 10, tw + 26, 20)
        ctx.globalAlpha = a * focusDim
        ctx.fillStyle = theme.cats[cat]
        ctx.beginPath()
        shapePath(ctx, CATEGORY_SHAPE[cat], lx - 9, sy, 3.6)
        ctx.fill()
        ctx.fillStyle = theme.ink2
        ctx.fillText(label, lx, sy + 0.5)
      }
      ctx.globalAlpha = 1
    }

    if (!trace || phase < PHASE.query) return
    const query = eventOf(trace, 'query')
    const [qx, qy] = project(query.position.x, query.position.y)

    // Projection neighbours: faint links showing how the query was placed.
    const linkA =
      phase === PHASE.query
        ? ease.out(seg(progress, 0.6, 0.85))
        : phase === PHASE.retrieval
          ? 1 - seg(progress, 0, 0.25)
          : 0
    if (linkA > 0) {
      ctx.strokeStyle = theme.ink2
      ctx.lineWidth = 0.8
      ctx.globalAlpha = 0.3 * linkA
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      for (const i of query.projection_neighbors) {
        ctx.moveTo(qx, qy)
        ctx.lineTo(this.screen[2 * i], this.screen[2 * i + 1])
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // Retrieval lines, drawn in rank order.
    if (phase >= PHASE.retrieval && retrieval && rerank) {
      const cands = retrieval.candidates
      const selected = new Set(retrieval.selected)
      const fadeOthers =
        phase >= PHASE.prompt
          ? 1
          : phase === PHASE.rerank && rerank.enabled
            ? seg(progress, 0.4, 1)
            : 0
      cands.forEach((c, k) => {
        const start = phase === PHASE.retrieval ? (k / cands.length) * 0.55 : -1
        const grow = phase === PHASE.retrieval ? ease.out(seg(progress, start, start + 0.18)) : 1
        if (grow <= 0) return
        const inFinal = finalSet.has(c.chunk)
        const keep = inFinal ? 1 : 1 - fadeOthers
        if (keep <= 0) return
        const [px, py] = this.pointScreen(c.chunk)
        const ex = qx + (px - qx) * grow
        const ey = qy + (py - qy) * grow
        const sel = selected.has(c.chunk)
        ctx.strokeStyle = sel ? theme.ink : theme.muted
        ctx.globalAlpha = (sel ? 0.35 + 0.55 * clamp01((c.score - 0.4) / 0.45) : 0.4) * keep
        ctx.lineWidth = sel ? 1.6 : 1
        ctx.setLineDash(sel ? [] : [3, 4])
        ctx.beginPath()
        ctx.moveTo(qx, qy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      })
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // Rings around candidates, and score / rank labels.
      const labelA = phase === PHASE.retrieval ? ease.out(seg(progress, 0.6, 0.9)) : 1
      ctx.font = `500 10.5px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono')}`
      ctx.textBaseline = 'middle'
      this.placed = [[qx - 12, qy - 12, qx + 12, qy + 12]]
      const showNumbers = phase >= PHASE.prompt
      const shown = showNumbers
        ? final
        : phase === PHASE.rerank && rerank.enabled
          ? final
          : retrieval.selected
      shown.forEach((chunk, k) => {
        const [px, py] = this.pointScreen(chunk)
        const c = cands.find((x) => x.chunk === chunk)
        let label: string
        if (showNumbers) label = `[${k + 1}]`
        else if (phase === PHASE.rerank && rerank.enabled) {
          const it = rerank.items.find((x) => x.chunk === chunk)!
          label = progress < 0.45 ? `#${it.retrieval_rank}` : `#${it.rerank_rank}`
        } else label = c ? c.score.toFixed(2) : ''
        this.badge(px, py, label, labelA, showNumbers)
      })
    }

    // Highlight from the side panel (hovered citation or list row).
    const hl = scene.highlight ?? scene.hover
    if (hl !== null && hl < n) {
      const [hx, hy] = this.pointScreen(hl)
      ctx.strokeStyle = theme.ink
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(hx, hy, 9, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Generation: cited points pulse as their marker streams in.
    if (phase === PHASE.generation) {
      const gen = eventOf(trace, 'generation')
      const shownTokens = Math.floor(gen.tokens.length * progress)
      gen.tokens.forEach((tok, j) => {
        if (tok.cite == null || j >= shownTokens) return
        const age = (shownTokens - j) / Math.max(8, gen.tokens.length * 0.15)
        if (age > 1) return
        const chunk = final[tok.cite - 1]
        if (chunk === undefined) return
        const [px, py] = this.pointScreen(chunk)
        ctx.strokeStyle = theme.ink
        ctx.globalAlpha = 1 - age
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(px, py, 6 + age * 22, 0, Math.PI * 2)
        ctx.stroke()
      })
      ctx.globalAlpha = 1
    }

    this.drawQuery(qx, qy, phase === PHASE.query ? progress : 1)
  }

  /** Screen rectangles already taken by labels in this frame. */
  private placed: [number, number, number, number][] = []

  /** First candidate position for a w x h label near (x, y) that overlaps nothing placed. */
  private placeLabel(x: number, y: number, w: number, h: number): [number, number] {
    const options: [number, number][] = [
      [x + 10, y - h - 2],
      [x + 10, y + 2],
      [x - 10 - w, y - h - 2],
      [x - 10 - w, y + 2],
      [x - w / 2, y - h - 10],
      [x - w / 2, y + 10],
      [x + 18, y - h / 2],
      [x - 18 - w, y - h / 2],
    ]
    const free = ([bx, by]: [number, number]) =>
      this.placed.every(([a, b, c, d]) => bx + w < a || bx > c || by + h < b || by > d)
    const pick = options.find(free) ?? options[0]
    this.placed.push([pick[0], pick[1], pick[0] + w, pick[1] + h])
    return pick
  }

  private badge(x: number, y: number, label: string, alpha: number, strong: boolean) {
    const { ctx, theme } = this
    if (!label || alpha <= 0) return
    const tw = ctx.measureText(label).width
    const [left, top] = this.placeLabel(x, y, tw + 8, 16)
    const bx = left + 4
    const by = top + 8
    ctx.globalAlpha = alpha
    ctx.fillStyle = strong ? theme.ink : theme.surface
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(bx - 4, by - 8, tw + 8, 16, 8)
    ctx.fill()
    if (!strong) ctx.stroke()
    ctx.fillStyle = strong ? theme.surface : theme.ink
    ctx.fillText(label, bx, by + 0.5)
    ctx.beginPath()
    ctx.arc(x, y, 5.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  /** The question: a comet that flies in, lands and pulses. */
  private drawQuery(qx: number, qy: number, p: number) {
    const { ctx, theme } = this
    const fly = ease.inOut(seg(p, 0, 0.55))
    const sx = this.w * 0.06
    const sy = this.h * 0.08
    // Curved path: quadratic Bezier with a control point above the line.
    const cx = (sx + qx) / 2
    const cy = Math.min(sy, qy) - this.h * 0.12
    const at = (t: number): [number, number] => [
      (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t * t * qx,
      (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t * t * qy,
    ]
    if (fly < 1) {
      for (let k = 12; k >= 0; k--) {
        const t = fly - k * 0.025
        if (t <= 0) continue
        const [x, y] = at(t)
        ctx.globalAlpha = (1 - k / 13) * 0.6
        ctx.fillStyle = theme.ink
        ctx.beginPath()
        ctx.arc(x, y, 4.5 * (1 - k / 14), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      return
    }
    // Landed: pulse rings, then the steady marker.
    const pulse = seg(p, 0.55, 1)
    if (pulse > 0 && pulse < 1) {
      for (const offset of [0, 0.3]) {
        const q = clamp01(pulse * 1.3 - offset)
        if (q <= 0 || q >= 1) continue
        ctx.strokeStyle = theme.ink
        ctx.globalAlpha = (1 - q) * 0.7
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(qx, qy, 8 + q * 40, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = theme.surface
    ctx.beginPath()
    ctx.arc(qx, qy, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = theme.ink
    ctx.beginPath()
    ctx.arc(qx, qy, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawGrid(project: (x: number, y: number) => [number, number], k: number) {
    const { ctx, theme } = this
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    const step = k > 2 ? 0.125 : 0.25
    for (let v = -1.5; v <= 1.5001; v += step) {
      const [x0, y0] = project(v, -1.5)
      const [x1, y1] = project(v, 1.5)
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      const [a0, b0] = project(-1.5, v)
      const [a1, b1] = project(1.5, v)
      ctx.moveTo(a0, b0)
      ctx.lineTo(a1, b1)
    }
    ctx.stroke()
  }
}
