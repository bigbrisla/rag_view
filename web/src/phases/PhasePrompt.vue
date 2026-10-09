<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { chunkText } from '@/engine/pipeline'
import { SYSTEM } from '@/engine/prompt'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()
const ev = computed(() => eventOf(props.trace, 'prompt'))
const full = ref(false)
const tc = computed(() => ev.value.token_counts)
const reveal = (a: number) => props.progress >= a
const sourceAt = (i: number) => 0.18 + (i / Math.max(1, ev.value.context.length)) * 0.55
const snippet = (chunk: number) => {
  const s = chunkText(app.chunks!, chunk, app.corpus!).replace(/\s+/g, ' ')
  return s.length > 200 ? s.slice(0, 200) + '…' : s
}
const segs = computed(() => [
  { key: 'system', n: tc.value.system, color: 'var(--seg-system)' },
  { key: 'context', n: tc.value.context, color: 'var(--seg-context)' },
  { key: 'question', n: tc.value.question, color: 'var(--seg-question)' },
])
</script>

<template>
  <div class="prompt">
    <div class="tokenbar" role="img" :aria-label="t('prompt.total', { n: tc.total })">
      <span
        v-for="s in segs"
        :key="s.key"
        :style="{ flexGrow: s.n * Math.min(1, progress * 1.4), background: s.color }"
        :title="`${t(`prompt.${s.key}`)}: ${s.n}`"
      />
    </div>
    <ul class="legend mono">
      <li v-for="s in segs" :key="s.key">
        <i :style="{ background: s.color }" />{{ t(`prompt.${s.key}`) }} {{ s.n }}
      </li>
      <li class="total">{{ t('prompt.total', { n: tc.total.toLocaleString() }) }}</li>
    </ul>

    <div class="blocks">
      <section class="block" :class="{ on: reveal(0.05) }">
        <h3 class="eyebrow">{{ t('prompt.system') }} · {{ tc.system }}</h3>
        <p>{{ SYSTEM }}</p>
      </section>
      <section class="block sources" :class="{ on: reveal(0.15) }">
        <h3 class="eyebrow">{{ t('prompt.context') }} · {{ tc.context }}</h3>
        <p v-if="!ev.context.length" class="mono">(none)</p>
        <article
          v-for="(c, i) in ev.context"
          :key="c.chunk"
          class="src"
          :class="{ on: reveal(sourceAt(i)) }"
          @mouseenter="app.highlight = { chunk: c.chunk }"
          @mouseleave="app.highlight = null"
        >
          <header>
            <span class="n mono">[{{ c.n }}]</span> {{ c.title }}
            <span class="mono muted">{{ c.tokens }} tok</span>
          </header>
          <p>{{ snippet(c.chunk) }}</p>
        </article>
      </section>
      <section class="block" :class="{ on: reveal(0.8) }">
        <h3 class="eyebrow">{{ t('prompt.question') }} · {{ tc.question }}</h3>
        <p>{{ trace.question }}</p>
      </section>
    </div>
    <button class="btn" @click="full = !full">
      {{ full ? t('prompt.hide') : t('prompt.show') }}
    </button>
    <pre v-if="full" class="full mono">{{ ev.text }}</pre>
  </div>
</template>

<style scoped>
.prompt {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}

.tokenbar {
  display: flex;
  gap: 2px;
  height: 12px;
}

.tokenbar span {
  flex-basis: 0;
  min-width: 3px;
  border-radius: 3px;
  transition: flex-grow 0.3s;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11px;
  color: var(--ink-2);
}

.legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 2px;
}

.legend .total {
  margin-left: auto;
  color: var(--ink);
}

.blocks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
}

.block,
.src {
  opacity: 0.12;
  transition: opacity 0.4s;
}

.block.on,
.src.on {
  opacity: 1;
}

.block {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}

.block p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.sources {
  border-left: 3px solid var(--seg-context);
}

.src {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.src header {
  font-size: 13px;
  font-weight: 500;
}

.src p {
  font-size: 12.5px;
}

.n {
  font-weight: 600;
}

.btn {
  align-self: flex-start;
}

.full {
  max-height: 300px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  font-size: 11.5px;
  background: var(--panel-2);
  border-radius: var(--radius-sm);
}
</style>
