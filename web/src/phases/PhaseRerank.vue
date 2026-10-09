<script setup lang="ts">
import gsap from 'gsap'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()
const ev = computed(() => eventOf(props.trace, 'rerank'))
const ROW = 38
const move = gsap.parseEase('power3.inOut')
const m = computed(() => move(Math.min(1, Math.max(0, (props.progress - 0.2) / 0.5))))
const items = computed(() =>
  [...ev.value.items].sort((a, b) => a.retrieval_rank - b.retrieval_rank),
)
const k = computed(() => props.trace.params.top_k)
const title = (chunk: number) => app.corpus!.docs[app.chunks!.doc[chunk]].title

function enable() {
  app.rerun({ ...app.params!, rerank: true })
}
</script>

<template>
  <div class="rerank">
    <template v-if="ev.enabled">
      <div class="cols mono muted">
        <span>{{ t('rerank.before') }}</span>
        <span>{{ t('rerank.after') }} · {{ t('rerank.relevance') }}</span>
      </div>
      <ol class="list" :style="{ height: `${items.length * ROW}px` }">
        <li
          v-for="it in items"
          :key="it.chunk"
          :class="{ top: it.rerank_rank <= k && m > 0.5 }"
          :style="{
            transform: `translateY(${((it.retrieval_rank - 1) * (1 - m) + (it.rerank_rank - 1) * m) * ROW}px)`,
          }"
          @mouseenter="app.highlight = { chunk: it.chunk }"
          @mouseleave="app.highlight = null"
        >
          <span class="rank mono">{{ m < 0.5 ? it.retrieval_rank : it.rerank_rank }}</span>
          <span class="name">{{ title(it.chunk) }}</span>
          <span class="cos mono">{{ it.retrieval_score.toFixed(2) }}</span>
          <span class="track"
            ><span
              class="bar"
              :style="{ width: `${it.relevance * 100 * Math.min(1, progress * 3)}%` }"
          /></span>
          <span class="delta mono" :style="{ opacity: m }">
            {{
              it.retrieval_rank > it.rerank_rank
                ? `↑${it.retrieval_rank - it.rerank_rank}`
                : it.retrieval_rank < it.rerank_rank
                  ? `↓${it.rerank_rank - it.retrieval_rank}`
                  : '='
            }}
          </span>
        </li>
        <div class="cut" :style="{ top: `${k * ROW - 1}px`, opacity: m }">
          <span class="mono">top-{{ k }}</span>
        </div>
      </ol>
      <p class="mono muted small">{{ ev.model }} · {{ Math.round(ev.duration_ms) }} ms</p>
    </template>
    <div v-else class="off card">
      <p>{{ t('phases.rerank.off', { k: trace.params.top_k }) }}</p>
      <button class="btn" @click="enable">{{ t('phases.rerank.enable') }}</button>
      <p class="mono muted small">{{ t('params.rerankDownload', { size: '23 MB' }) }}</p>
    </div>
  </div>
</template>

<style scoped>
.cols {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 6px;
}

.list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.list li {
  position: absolute;
  inset: 0 0 auto;
  height: 38px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 36px 90px 32px;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--ink-2);
  will-change: transform;
}

.list li.top {
  color: var(--ink);
}

.rank,
.cos,
.delta {
  color: var(--muted);
  font-size: 11.5px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.bar {
  display: block;
  height: 100%;
  background: var(--ink-2);
}

.top .bar {
  background: var(--ink);
}

.cut {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1.5px dashed var(--ink);
}

.cut span {
  position: absolute;
  right: 0;
  top: -9px;
  padding: 0 6px;
  font-size: 10px;
  background: var(--panel);
}

.off {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.off p {
  margin: 0;
}

.small {
  margin: 8px 0 0;
  font-size: 11px;
}
</style>
