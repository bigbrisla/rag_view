<script setup lang="ts">
// Phase 1: the focus document, chunked live with the draft settings.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { chunkText, type Span } from '@/engine/chunker'
import { eventOf } from '@/player/timeline'
import { overlapTokens, useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'
import ParamSliders from '@/components/ParamSliders.vue'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()

const ev = computed(() => eventOf(props.trace, 'chunking'))
const doc = computed(() => app.corpus!.docs.find((d) => d.id === ev.value.focus_doc)!)
const draft = computed(() => app.params!)
const differs = computed(
  () =>
    draft.value.chunk_size !== props.trace.params.chunk_size ||
    draft.value.overlap !== props.trace.params.overlap ||
    draft.value.strategy !== props.trace.params.strategy,
)

const spans = computed<Span[]>(() => {
  if (!differs.value) return ev.value.focus_chunks
  const p = draft.value
  return chunkText(
    doc.value.text,
    p.chunk_size,
    overlapTokens(p.chunk_size, app.overlapPct),
    p.strategy,
    app.count,
  )
})

// Chunks are revealed one by one while the phase plays; a draft preview shows all at once.
const revealed = computed(() =>
  differs.value
    ? spans.value.length
    : Math.ceil(spans.value.length * Math.min(1, props.progress * 1.25)),
)

interface Segment {
  text: string
  cls: string
  title?: string
  marker?: number
}

const segments = computed<Segment[]>(() => {
  const text = doc.value.text
  const visible = spans.value.slice(0, revealed.value)
  const cuts = new Set<number>([0, text.length])
  for (const s of visible) {
    cuts.add(s.start)
    cuts.add(s.end)
  }
  const points = [...cuts].sort((a, b) => a - b)
  const starts = new Map(visible.map((s, i) => [s.start, i]))
  const out: Segment[] = []
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const cover: number[] = []
    visible.forEach((s, i) => {
      if (s.start <= a && s.end >= b) cover.push(i)
    })
    const cls = cover.length === 0 ? '' : cover.length > 1 ? 'overlap' : cover[0] % 2 ? 'b' : 'a'
    const title = cover.map((i) => `#${i + 1} · ${visible[i].tokens} tok`).join(' + ')
    out.push({
      text: text.slice(a, b),
      cls,
      title,
      marker: starts.has(a) ? starts.get(a)! + 1 : undefined,
    })
  }
  return out
})

const avg = computed(() =>
  Math.round(spans.value.reduce((s, c) => s + c.tokens, 0) / Math.max(1, spans.value.length)),
)
</script>

<template>
  <div class="chunking">
    <ParamSliders compact />
    <p v-if="differs" class="differs">
      {{ t('chunking.differs', { size: trace.params.chunk_size, overlap: trace.params.overlap }) }}
      <button
        class="btn primary"
        @click="
          app.rerun({
            ...app.params!,
            overlap: overlapTokens(app.params!.chunk_size, app.overlapPct),
          })
        "
      >
        {{ t('chunking.apply') }}
      </button>
    </p>
    <div class="doc card">
      <div class="doc-head">
        <a :href="doc.url" target="_blank" rel="noopener">{{ doc.title }}</a>
        <span class="mono muted"
          >{{ t('chunking.inDoc', { n: spans.length }) }} · avg {{ avg }} tok</span
        >
      </div>
      <div class="text">
        <template v-for="(s, i) in segments" :key="i"
          ><sup v-if="s.marker" class="marker mono">{{ s.marker }}</sup
          ><span :class="s.cls" :title="s.title">{{ s.text }}</span></template
        >
      </div>
    </div>
    <p class="mono muted small">
      {{ t('chunking.corpus', { n: ev.n_chunks, docs: ev.n_docs, avg: ev.avg_tokens }) }} ·
      {{ t('chunking.legend') }}
    </p>
  </div>
</template>

<style scoped>
.chunking {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.differs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
}

.doc {
  padding: 14px 16px;
}

.doc-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  font-weight: 500;
}

.text {
  max-height: 360px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--ink-2);
}

.text span.a {
  background: var(--chunk-a);
  color: var(--ink);
}

.text span.b {
  background: var(--chunk-b);
  color: var(--ink);
}

.text span.overlap {
  color: var(--ink);
  background: repeating-linear-gradient(135deg, var(--chunk-overlap) 0 3px, transparent 3px 7px);
  box-shadow: inset 0 -1.5px 0 var(--chunk-edge);
}

.marker {
  margin-right: 2px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--ink);
  color: var(--bg);
  font-size: 9.5px;
}

.small {
  margin: 0;
  font-size: 11px;
}
</style>
