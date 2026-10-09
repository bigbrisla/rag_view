<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { chunkText } from '@/engine/pipeline'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'
import VectorBarcode from '@/viz/VectorBarcode.vue'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()
const ev = computed(() => eventOf(props.trace, 'embedding'))
const sample = computed(() => ev.value.samples[0])
const text = computed(() => {
  const s = chunkText(app.chunks!, sample.value.chunk, app.corpus!).replace(/\s+/g, ' ')
  return s.length > 260 ? s.slice(0, 260) + '…' : s
})
const title = computed(() => app.corpus!.docs[app.chunks!.doc[sample.value.chunk]].title)
const done = computed(() =>
  Math.min(ev.value.n_vectors, Math.floor(ev.value.n_vectors * props.progress * 1.05)),
)
</script>

<template>
  <div class="embedding">
    <div class="flow">
      <blockquote class="card chunk">
        <span class="eyebrow">{{ title }}</span>
        <p>{{ text }}</p>
      </blockquote>
      <div class="model mono" aria-hidden="true">
        <span>↓</span>
        <span class="box"
          >{{ ev.model.split('/').pop() }} · {{ ev.pooling.toUpperCase() }} pooling · L2</span
        >
        <span>↓</span>
      </div>
      <div class="card vec">
        <VectorBarcode
          :values="sample.preview"
          :reveal="Math.min(1, progress * 2)"
          :label="t('embedding.vector', { n: sample.preview.length, dim: ev.dim })"
        />
        <p class="mono numbers">
          [{{
            sample.preview
              .slice(0, 6)
              .map((v) => v.toFixed(3))
              .join(', ')
          }}, … ]
        </p>
      </div>
    </div>
    <div class="meter">
      <div class="track">
        <div class="fill" :style="{ width: `${(done / ev.n_vectors) * 100}%` }" />
      </div>
      <span class="mono">{{ t('embedding.count', { done, total: ev.n_vectors }) }}</span>
    </div>
    <span class="chip">{{
      ev.precomputed ? t('embedding.precomputed') : t('embedding.live')
    }}</span>
  </div>
</template>

<style scoped>
.embedding {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
}

.flow {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.chunk {
  margin: 0;
  padding: 12px 14px;
}

.chunk p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.model {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11.5px;
  color: var(--muted);
}

.box {
  padding: 5px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  color: var(--ink);
}

.vec {
  padding: 12px 14px;
}

.numbers {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.meter {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  font-size: 12px;
}

.track {
  flex: 1;
  height: 4px;
  border-radius: 4px;
  background: var(--border);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--ink);
}
</style>
