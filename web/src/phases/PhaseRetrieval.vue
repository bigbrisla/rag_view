<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()
const ev = computed(() => eventOf(props.trace, 'retrieval'))
const rows = computed(() => ev.value.candidates.slice(0, Math.max(10, ev.value.top_k)))
const selected = computed(() => new Set(ev.value.selected))
const shown = computed(() => Math.ceil(rows.value.length * Math.min(1, props.progress * 1.7)))

// Scores of this model live roughly in [0.3, 0.95]; the axis shows that band.
const LO = 0.3
const HI = 0.95
const x = (s: number) => `${Math.max(0, Math.min(1, (s - LO) / (HI - LO))) * 100}%`
const title = (doc: string) => app.corpus!.docs.find((d) => d.id === doc)!.title
const state = (c: (typeof rows.value)[number]) =>
  selected.value.has(c.chunk) ? 'selected' : !c.above_threshold ? 'below' : 'beyond'
</script>

<template>
  <div class="retrieval">
    <p class="mono muted small">
      {{
        t('retrieval.scanned', { n: ev.n_scanned.toLocaleString(), ms: ev.duration_ms.toFixed(2) })
      }}
      · <span class="thr-key">┊</span> {{ t('params.threshold') }} {{ ev.threshold.toFixed(2) }}
    </p>
    <div class="scale" :style="{ '--thr': x(ev.threshold) }">
      <ol class="rows">
        <li
          v-for="(c, i) in rows"
          :key="c.chunk"
          :class="[state(c), { on: i < shown }]"
          @mouseenter="app.highlight = { chunk: c.chunk }"
          @mouseleave="app.highlight = null"
        >
          <span class="rank mono">{{ c.rank }}</span>
          <span class="name">{{ title(c.doc) }}</span>
          <span class="track"><span class="bar" :style="{ width: x(c.score) }" /></span>
          <span class="score mono">{{ c.score.toFixed(3) }}</span>
          <span class="tag">{{
            state(c) === 'selected'
              ? t('retrieval.selected')
              : state(c) === 'below'
                ? t('retrieval.below')
                : t('retrieval.beyond', { k: ev.top_k })
          }}</span>
        </li>
      </ol>
    </div>
    <p v-if="!ev.selected.length" class="warn">⚠ {{ t('retrieval.none') }}</p>
  </div>
</template>

<style scoped>
.retrieval {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.small {
  margin: 0;
  font-size: 11px;
}

.scale {
  position: relative;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1.2fr) minmax(60px, 1fr) 46px;
  grid-template-areas: 'rank name track score' 'rank tag track score';
  align-items: center;
  column-gap: 10px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  opacity: 0;
  transform: translateX(-6px);
  transition:
    opacity 0.3s,
    transform 0.3s;
}

.rows li.on {
  opacity: 1;
  transform: none;
}

.rows li:hover {
  background: var(--wash);
}

.rank {
  grid-area: rank;
  color: var(--muted);
}

.name {
  grid-area: name;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  grid-area: tag;
  font-size: 11px;
  color: var(--muted);
}

.selected .tag {
  color: var(--ink);
}

.selected .tag::before {
  content: '● ';
}

.track {
  grid-area: track;
  position: relative;
  height: 8px;
}

.bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 0 4px 4px 0;
  background: var(--muted);
}

.selected .bar {
  background: var(--ink);
}

.below .name,
.below .score {
  color: var(--muted);
}

.score {
  grid-area: score;
  text-align: right;
}

.track::after {
  content: '';
  position: absolute;
  top: -4px;
  bottom: -4px;
  left: var(--thr);
  border-left: 1px dashed var(--ink-2);
}

.thr-key {
  color: var(--ink-2);
}

.warn {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--status-warning);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
</style>
