<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()
const ev = computed(() => eventOf(props.trace, 'generation'))
const prompt = computed(() => eventOf(props.trace, 'prompt'))
const shown = computed(() =>
  Math.min(ev.value.tokens.length, Math.ceil(ev.value.tokens.length * props.progress * 1.06)),
)
const done = computed(() => shown.value >= ev.value.tokens.length)
const active = ref<number | null>(null)

const STATUS = {
  answered: { icon: '✓', cls: 'good' },
  partial: { icon: '◐', cls: 'warning' },
  refused: { icon: '⊘', cls: 'critical' },
} as const

function focus(n: number | null) {
  active.value = n
  if (n === null) return (app.highlight = null)
  const src = prompt.value.context.find((c) => c.n === n)
  if (src) app.highlight = { chunk: src.chunk }
}

/** The cited chunk's text, split into plain and evidence segments. */
const evidence = computed(() => {
  const n = active.value
  if (n === null) return null
  const src = prompt.value.context.find((c) => c.n === n)
  if (!src) return null
  const cs = app.chunks!
  const doc = app.corpus!.docs[cs.doc[src.chunk]]
  const start = cs.start[src.chunk]
  const end = cs.end[src.chunk]
  const marks = ev.value.citations
    .filter((c) => c.n === n)
    .map((c) => [c.start - start, c.end - start] as const)
    .sort((a, b) => a[0] - b[0])
  const text = doc.text.slice(start, end)
  const parts: { text: string; mark: boolean }[] = []
  let at = 0
  for (const [a, b] of marks) {
    if (a > at) parts.push({ text: text.slice(at, a), mark: false })
    parts.push({ text: text.slice(Math.max(a, at), b), mark: true })
    at = Math.max(at, b)
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false })
  return { n, title: doc.title, parts }
})

const citedCount = computed(() => new Set(ev.value.citations.map((c) => c.n)).size)
</script>

<template>
  <div class="generation">
    <div class="badges">
      <span class="status" :class="STATUS[ev.status].cls">
        <span aria-hidden="true">{{ STATUS[ev.status].icon }}</span>
        {{ t(`generation.${ev.status}`) }}
      </span>
      <span class="chip" :title="t('phases.generation.notice')"
        >⚙ {{ t('generation.simulated') }} · {{ ev.generator }}</span
      >
      <span class="chip">{{
        citedCount ? t('generation.sources', citedCount) : t('generation.noSources')
      }}</span>
    </div>

    <div class="compare" :class="{ two: done }">
      <article class="answer card">
        <h3 class="eyebrow">{{ t('generation.withRag') }}</h3>
        <p class="text" aria-live="polite">
          <template v-for="(tok, i) in ev.tokens.slice(0, shown)" :key="i">
            <button
              v-if="tok.cite !== null"
              class="cite mono"
              :class="{ active: active === tok.cite }"
              @mouseenter="focus(tok.cite)"
              @focus="focus(tok.cite)"
              @mouseleave="focus(null)"
              @blur="focus(null)"
            >
              {{ tok.cite }}
            </button>
            <template v-else>{{ tok.text }}</template>
          </template>
          <span v-if="!done" class="caret" aria-hidden="true" />
        </p>
        <p v-if="done && ev.missing.length" class="missing">
          {{ t('generation.missing', { topics: ev.missing.join(' · ') }) }}
        </p>
      </article>

      <article v-if="done" class="answer card norag">
        <h3 class="eyebrow">{{ t('generation.withoutRag') }}</h3>
        <template v-if="ev.no_rag">
          <p class="text">{{ ev.no_rag.text }}</p>
          <p class="note">{{ t('generation.illustrative') }}</p>
        </template>
        <p v-else class="note">{{ t('generation.noRagUnavailable') }}</p>
      </article>
    </div>

    <aside v-if="evidence" class="evidence card">
      <h3 class="eyebrow">
        {{ t('generation.evidence', { n: evidence.n, title: evidence.title }) }}
      </h3>
      <p>
        <template v-for="(p, i) in evidence.parts" :key="i"
          ><mark v-if="p.mark">{{ p.text }}</mark
          ><template v-else>{{ p.text }}</template></template
        >
      </p>
    </aside>
  </div>
</template>

<style scoped>
.generation {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid currentColor;
}

.status.good {
  color: var(--status-good);
}

.status.warning {
  color: var(--status-warning);
}

.status.critical {
  color: var(--status-critical);
}

.compare {
  display: grid;
  gap: 10px;
}

.answer {
  padding: 14px 16px;
}

.text {
  margin: 6px 0 0;
  font-size: 15.5px;
  line-height: 1.65;
}

.cite {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  margin: 0 1px;
  padding: 0 4px;
  border: 1px solid var(--ink-2);
  border-radius: 5px;
  background: transparent;
  font-size: 10.5px;
  vertical-align: 2px;
}

.cite:hover,
.cite.active {
  background: var(--ink);
  color: var(--bg);
}

.caret {
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--ink);
  animation: blink 1s steps(2) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.missing {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.norag {
  border-style: dashed;
}

.norag .text {
  color: var(--ink-2);
}

.note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.evidence {
  padding: 12px 14px;
}

.evidence p {
  margin: 6px 0 0;
  max-height: 180px;
  overflow-y: auto;
  font-size: 13px;
  color: var(--ink-2);
}

mark {
  background: var(--chunk-b);
  color: var(--ink);
  box-shadow: inset 0 -1.5px 0 var(--chunk-edge);
}
</style>
