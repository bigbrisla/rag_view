<script setup lang="ts">
import gsap from 'gsap'
import { select } from 'd3-selection'
import { zoom as d3zoom, type ZoomBehavior, zoomIdentity } from 'd3-zoom'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import { usePlayer } from '@/stores/player'
import ShapeGlyph from './ShapeGlyph.vue'
import { CATEGORY_ORDER, CATEGORY_SHAPE, readTheme, StarMap } from './starmap'

const { t } = useI18n()
const app = useApp()
const player = usePlayer()

const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const renderer = shallowRef<StarMap>()
const user = shallowRef<{ k: number; x: number; y: number } | null>(null)
const hover = ref<number | null>(null)
const tip = ref({ x: 0, y: 0 })
let dirty = true
let zoomer: ZoomBehavior<HTMLCanvasElement, unknown> | null = null

const empty = computed(() => player.index === 0 && !app.buildPoints)

const hovered = computed(() => {
  const i = hover.value
  const cs = app.chunks
  if (i === null || !cs || !app.corpus) return null
  const doc = app.corpus.docs[cs.doc[i]]
  const text = doc.text.slice(cs.start[i], cs.end[i]).replace(/\s+/g, ' ')
  const cand = app.trace
    ? eventOf(app.trace, 'retrieval').candidates.find((c) => c.chunk === i)
    : undefined
  return {
    title: doc.title,
    category: doc.category,
    label: app.corpus.categories[doc.category],
    tokens: cs.tokens[i],
    index: i,
    snippet: text.length > 180 ? text.slice(0, 180) + '…' : text,
    score: cand?.score,
  }
})

function frame() {
  const r = renderer.value
  if (!r || !app.chunks || !app.corpus) return
  if (!dirty && !player.playing) return
  dirty = false
  r.draw({
    chunks: app.chunks,
    corpus: app.corpus,
    trace: app.trace,
    phase: player.index,
    progress: player.progress,
    highlight: app.highlight?.chunk ?? null,
    hover: hover.value,
    categoryFocus: app.categoryFocus,
    build: app.buildPoints,
    user: user.value,
  })
}

watch(
  () => [
    player.clock.t,
    app.trace,
    app.chunks,
    app.highlight,
    app.categoryFocus,
    app.buildPoints,
    hover.value,
    user.value,
  ],
  () => (dirty = true),
)

function refreshTheme() {
  if (!renderer.value) return
  renderer.value.theme = readTheme()
  dirty = true
}

let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null
const media = window.matchMedia('(prefers-color-scheme: dark)')

onMounted(() => {
  const el = canvas.value!
  renderer.value = new StarMap(el)
  ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    renderer.value!.resize(width, height, Math.min(2, window.devicePixelRatio || 1))
    dirty = true
  })
  ro.observe(wrap.value!)
  mo = new MutationObserver(refreshTheme)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  media.addEventListener('change', refreshTheme)

  zoomer = d3zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.8, 10])
    // Wheel zoom only with Ctrl/Cmd (trackpad pinch sets ctrlKey) so the page still scrolls.
    .filter((ev: Event) =>
      ev.type === 'wheel'
        ? (ev as WheelEvent).ctrlKey || (ev as WheelEvent).metaKey
        : !(ev as MouseEvent).button,
    )
    .on('zoom', (ev) => {
      if (!ev.sourceEvent) return
      user.value = { k: ev.transform.k, x: ev.transform.x, y: ev.transform.y }
    })
  const sel = select(el)
  sel.call(zoomer)
  // Start a gesture from wherever the automatic camera currently is.
  const sync = () => {
    if (user.value) return
    const c = renderer.value!.camera
    sel.property('__zoom', zoomIdentity.translate(c.x, c.y).scale(c.k))
  }
  el.addEventListener('pointerdown', sync, { capture: true })
  el.addEventListener('wheel', sync, { capture: true, passive: true })
  gsap.ticker.add(frame)
})

onBeforeUnmount(() => {
  gsap.ticker.remove(frame)
  ro?.disconnect()
  mo?.disconnect()
  media.removeEventListener('change', refreshTheme)
})

function resetView() {
  user.value = null
  if (canvas.value) select(canvas.value).property('__zoom', zoomIdentity)
}

function onMove(ev: PointerEvent) {
  const r = renderer.value
  if (!r || app.buildPoints || player.index < 1) return
  const rect = canvas.value!.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  hover.value = r.pick(x, y, 12)
  tip.value = { x, y }
}
</script>

<template>
  <div ref="wrap" class="map" :class="{ empty }">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="t('map.legend')"
      @pointermove="onMove"
      @pointerleave="hover = null"
    />
    <p v-if="empty" class="overlay">{{ t('map.empty') }}</p>
    <p v-if="app.status === 'building'" class="overlay building mono">
      {{
        t('status.building', {
          done: app.build.done,
          total: app.build.total,
          eta: app.build.done ? app.build.etaSeconds : '…',
        })
      }}
    </p>

    <div
      v-if="hovered"
      class="tip"
      :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
      :class="{ flip: tip.x > (renderer?.size.w ?? 0) * 0.6 }"
    >
      <div class="tip-head">
        <ShapeGlyph
          :shape="CATEGORY_SHAPE[hovered.category]"
          :color="`var(--cat-${hovered.category})`"
        />
        <strong>{{ hovered.title }}</strong>
      </div>
      <div class="mono muted">
        {{ t('map.chunk', { i: hovered.index, tokens: hovered.tokens }) }}
        <template v-if="hovered.score !== undefined">
          · cos {{ hovered.score.toFixed(3) }}</template
        >
      </div>
      <p>{{ hovered.snippet }}</p>
    </div>

    <ul class="legend" :aria-label="t('map.legend')">
      <li
        v-for="cat in CATEGORY_ORDER"
        :key="cat"
        tabindex="0"
        @mouseenter="app.categoryFocus = cat"
        @mouseleave="app.categoryFocus = null"
        @focusin="app.categoryFocus = cat"
        @focusout="app.categoryFocus = null"
      >
        <ShapeGlyph :shape="CATEGORY_SHAPE[cat]" :color="`var(--cat-${cat})`" />
        {{ app.corpus?.categories[cat] }}
      </li>
      <li class="query-key"><span class="qdot" />{{ t('map.query') }}</li>
    </ul>
    <button v-if="user" class="btn reset" @click="resetView">{{ t('map.reset') }}</button>
  </div>
</template>

<style scoped>
.map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-family: var(--font-display);
  font-style: italic;
  font-size: 22px;
  pointer-events: none;
}

.overlay.building {
  inset: 16px 0 auto;
  font-family: var(--font-mono);
  font-style: normal;
  font-size: 12px;
}

.tip {
  position: absolute;
  z-index: 3;
  width: 280px;
  transform: translate(14px, 14px);
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  font-size: 12.5px;
  pointer-events: none;
}

.tip.flip {
  transform: translate(calc(-100% - 14px), 14px);
}

.tip-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.tip p {
  margin: 6px 0 0;
  color: var(--ink-2);
  line-height: 1.45;
}

.legend {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 6px 10px;
  list-style: none;
  font-size: 12px;
  color: var(--ink-2);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  border-radius: var(--radius-sm);
  max-width: calc(100% - 24px);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}

.qdot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
  background: radial-gradient(circle, var(--ink) 0 2.4px, transparent 2.6px);
}

.reset {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--panel);
}
</style>
