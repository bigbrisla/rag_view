<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf } from '@/player/timeline'
import type { Trace } from '@/types/trace'
import VectorBarcode from '@/viz/VectorBarcode.vue'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const ev = computed(() => eventOf(props.trace, 'query'))
const shown = computed(() => Math.ceil(ev.value.tokens.length * Math.min(1, props.progress * 2.2)))
</script>

<template>
  <div class="query">
    <q class="question">{{ ev.text }}</q>
    <div>
      <p class="eyebrow">{{ t('query.tokens', { n: ev.tokens.length }) }}</p>
      <ul class="tokens">
        <li
          v-for="(tok, i) in ev.tokens"
          :key="i"
          class="mono"
          :class="{ on: i < shown, special: tok.startsWith('['), piece: tok.startsWith('##') }"
        >
          {{ tok }}
        </li>
      </ul>
    </div>
    <div class="card vec">
      <VectorBarcode
        :values="ev.preview"
        :reveal="Math.max(0, progress * 2 - 0.6)"
        :label="`${t('embedding.vector', { n: ev.preview.length, dim: 384 })} · ${t('query.time', { ms: Math.round(ev.duration_ms) })}`"
      />
    </div>
    <p class="mono muted small">
      2D ({{ ev.position.x.toFixed(3) }}, {{ ev.position.y.toFixed(3) }}) ·
      {{ ev.projection_neighbors.length }} neighbours
    </p>
  </div>
</template>

<style scoped>
.query {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question {
  font-family: var(--font-display);
  font-size: 24px;
  line-height: 1.25;
}

.tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.tokens li {
  padding: 3px 7px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-size: 12px;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 0.25s,
    transform 0.25s;
}

.tokens li.on {
  opacity: 1;
  transform: none;
}

.tokens li.special {
  color: var(--muted);
  border-style: dashed;
}

.tokens li.piece {
  border-left-color: transparent;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: -4px;
}

.vec {
  padding: 12px 14px;
}

.small {
  margin: 0;
  font-size: 11px;
}
</style>
