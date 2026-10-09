<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf, PHASES } from '@/player/timeline'
import { useApp } from '@/stores/app'
import { usePlayer } from '@/stores/player'
import type { Trace } from '@/types/trace'
import PhaseChunking from './PhaseChunking.vue'
import PhaseEmbedding from './PhaseEmbedding.vue'
import PhaseGeneration from './PhaseGeneration.vue'
import PhaseIndexing from './PhaseIndexing.vue'
import PhasePrompt from './PhasePrompt.vue'
import PhaseQuery from './PhaseQuery.vue'
import PhaseRerank from './PhaseRerank.vue'
import PhaseRetrieval from './PhaseRetrieval.vue'

const props = defineProps<{ trace: Trace }>()
const { t } = useI18n()
const app = useApp()
const player = usePlayer()

const components = [
  PhaseChunking,
  PhaseEmbedding,
  PhaseIndexing,
  PhaseQuery,
  PhaseRetrieval,
  PhaseRerank,
  PhasePrompt,
  PhaseGeneration,
]

const name = computed(() => PHASES[player.index])
const vars = computed(() => {
  const tr = props.trace
  const ch = eventOf(tr, 'chunking')
  const em = eventOf(tr, 'embedding')
  return {
    size: ch.chunk_size,
    overlap: ch.overlap,
    model: em.model.split('/').pop(),
    dim: em.dim,
    n: em.n_vectors,
    k: tr.params.top_k,
    threshold: tr.params.threshold.toFixed(2),
    docs: app.corpus?.docs.length,
  }
})
</script>

<template>
  <section class="panel" :aria-labelledby="`phase-${name}`">
    <header>
      <p class="eyebrow">
        {{ t('player.phase', { n: player.index + 1, total: PHASES.length }) }} ·
        {{ t(`phases.${name}.title`) }}
      </p>
      <h2 :id="`phase-${name}`">{{ t(`phases.${name}.kicker`) }}</h2>
      <p class="body">{{ t(`phases.${name}.body`, vars) }}</p>
    </header>
    <component :is="components[player.index]" :trace="trace" :progress="player.progress" />
    <p v-if="name !== 'rerank'" class="notice">{{ t(`phases.${name}.notice`, vars) }}</p>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

h2 {
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: 30px;
  line-height: 1.1;
  font-weight: 400;
}

.body {
  margin: 10px 0 0;
  color: var(--ink-2);
}

.notice {
  margin: auto 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--muted);
}
</style>
