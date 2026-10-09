<script setup lang="ts">
/**
 * Pipeline settings. Chunking changes need an explicit "apply" (they may
 * trigger an in-browser index build); retrieval settings apply on their own.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { chunkCorpus } from '@/engine/custom'
import { overlapTokens, useApp } from '@/stores/app'

const props = defineProps<{ compact?: boolean }>()
const { t } = useI18n()
const app = useApp()
const p = computed(() => app.params!)

function setSize(v: number) {
  app.params = { ...p.value, chunk_size: v, overlap: overlapTokens(v, app.overlapPct) }
}
function setPct(v: number) {
  app.overlapPct = v
  app.params = { ...p.value, overlap: overlapTokens(p.value.chunk_size, v) }
}
function setStrategy(v: 'sentence' | 'fixed') {
  app.params = { ...p.value, strategy: v }
}

const applied = computed(() => app.trace?.params)
const chunkingChanged = computed(
  () =>
    !!applied.value &&
    (p.value.chunk_size !== applied.value.chunk_size ||
      p.value.overlap !== applied.value.overlap ||
      p.value.strategy !== applied.value.strategy),
)
const preset = computed(() => app.isPreset(p.value))
const customCount = computed(() =>
  preset.value || !chunkingChanged.value
    ? 0
    : chunkCorpus(app.corpus!, p.value.strategy, p.value.chunk_size, p.value.overlap, app.count)
        .length,
)

// Retrieval settings re-run immediately (cheap: the index is already built).
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [p.value.top_k, p.value.threshold, p.value.rerank] as const,
  (now) => {
    const a = applied.value
    if (props.compact || !a || chunkingChanged.value) return
    if (now[0] === a.top_k && now[1] === a.threshold && now[2] === a.rerank) return
    clearTimeout(timer)
    timer = setTimeout(() => app.rerun({ ...p.value }), 350)
  },
)

const sizeTicks = computed(() => app.manifest?.sizes ?? [])
</script>

<template>
  <div class="sliders" :class="{ compact }">
    <label class="field">
      <span class="label"
        >{{ t('params.chunkSize') }}
        <b class="mono">{{ t('params.tokens', { n: p.chunk_size }) }}</b></span
      >
      <input
        type="range"
        min="32"
        max="480"
        step="16"
        :value="p.chunk_size"
        list="size-ticks"
        @input="setSize(Number(($event.target as HTMLInputElement).value))"
      />
      <datalist id="size-ticks"><option v-for="s in sizeTicks" :key="s" :value="s" /></datalist>
    </label>
    <label class="field">
      <span class="label"
        >{{ t('params.overlap') }}
        <b class="mono">{{ app.overlapPct }}% · {{ t('params.tokens', { n: p.overlap }) }}</b></span
      >
      <input
        type="range"
        min="0"
        max="50"
        step="5"
        :value="app.overlapPct"
        @input="setPct(Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <div class="field">
      <span class="label">{{ t('params.strategy') }}</span>
      <div class="seg" role="radiogroup" :aria-label="t('params.strategy')">
        <button
          v-for="s in ['sentence', 'fixed'] as const"
          :key="s"
          role="radio"
          :aria-checked="p.strategy === s"
          :class="{ on: p.strategy === s }"
          @click="setStrategy(s)"
        >
          {{ t(`params.${s}`) }}
        </button>
      </div>
    </div>

    <template v-if="!compact">
      <label class="field">
        <span class="label"
          >{{ t('params.topK') }} <b class="mono">{{ p.top_k }}</b></span
        >
        <input
          type="range"
          min="1"
          max="10"
          :value="p.top_k"
          @input="app.params = { ...p, top_k: Number(($event.target as HTMLInputElement).value) }"
        />
      </label>
      <label class="field">
        <span class="label"
          >{{ t('params.threshold') }} <b class="mono">{{ p.threshold.toFixed(2) }}</b></span
        >
        <input
          type="range"
          min="0"
          max="0.9"
          step="0.05"
          :value="p.threshold"
          @input="
            app.params = { ...p, threshold: Number(($event.target as HTMLInputElement).value) }
          "
        />
      </label>
      <label class="field switch">
        <input
          type="checkbox"
          :checked="p.rerank"
          @change="app.params = { ...p, rerank: ($event.target as HTMLInputElement).checked }"
        />
        <span class="label">{{ t('params.rerank') }}</span>
        <span v-if="app.models.rerank.state !== 'ready'" class="muted small">{{
          t('params.rerankDownload', { size: '23 MB' })
        }}</span>
      </label>
      <div v-if="chunkingChanged" class="apply">
        <p v-if="!preset" class="muted small">
          {{ t('params.customNotice', { n: customCount.toLocaleString() }) }}
        </p>
        <button class="btn primary" @click="app.rerun({ ...p })">
          {{ preset ? t('chunking.apply') : t('params.build') }}
        </button>
      </div>
    </template>
    <p v-if="compact && chunkingChanged" class="muted small tag">
      {{ preset ? t('params.preset') : t('params.custom') }}
    </p>
  </div>
</template>

<style scoped>
.sliders {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px 20px;
  align-items: end;
}

.sliders.compact {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}

.label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink-2);
}

.label b {
  color: var(--ink);
  font-weight: 500;
}

input[type='range'] {
  width: 100%;
  accent-color: var(--ink);
}

.seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
}

.seg button {
  flex: 1;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 12px;
  color: var(--ink-2);
}

.seg button.on {
  background: var(--ink);
  color: var(--bg);
}

.switch {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
}

.switch input {
  accent-color: var(--ink);
  width: 16px;
  height: 16px;
}

.apply {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.small {
  margin: 0;
  font-size: 12px;
}

.tag {
  align-self: center;
}
</style>
