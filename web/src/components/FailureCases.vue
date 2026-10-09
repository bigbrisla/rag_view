<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useApp } from '@/stores/app'

const emit = defineEmits<{ ran: [] }>()
const { t } = useI18n()
const app = useApp()

const question = (id: string) => app.curated!.questions.find((q) => q.id === id)!.question
const settings = (p: Record<string, unknown>) =>
  Object.entries(p)
    .map(([k, v]) => `${k.replace('_', ' ')} ${v === true ? 'on' : v}`)
    .join(' · ')

async function run(id: string) {
  const fc = app.failureCases.find((f) => f.id === id)!
  emit('ran')
  await app.runFailureCase(fc)
}
</script>

<template>
  <section class="failures" aria-labelledby="failures-title">
    <h2 id="failures-title">{{ t('failure.title') }}</h2>
    <p class="lede">{{ t('failure.lede') }}</p>
    <div class="grid">
      <article v-for="(fc, i) in app.failureCases" :key="fc.id" class="card case">
        <span class="eyebrow">0{{ i + 1 }}</span>
        <h3>{{ fc.title }}</h3>
        <q>{{ question(fc.question) }}</q>
        <p v-if="Object.keys(fc.params).length" class="mono muted small">
          {{ settings(fc.params) }}
        </p>
        <p class="lesson">{{ fc.lesson }}</p>
        <button
          class="btn"
          :disabled="app.status === 'running' || app.status === 'building'"
          @click="run(fc.id)"
        >
          {{ t('failure.run') }} →
        </button>
      </article>
    </div>
  </section>
</template>

<style scoped>
h2 {
  font-family: var(--font-display);
  font-size: clamp(30px, 4vw, 42px);
  font-weight: 400;
}

.lede {
  max-width: 62ch;
  color: var(--ink-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.case {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
}

h3 {
  font-size: 18px;
}

q {
  font-family: var(--font-display);
  font-size: 18px;
  line-height: 1.3;
}

.lesson {
  flex: 1;
  margin: 0;
  font-size: 13.5px;
  color: var(--ink-2);
}

.small {
  margin: 0;
  font-size: 11.5px;
}

.btn {
  align-self: flex-start;
}
</style>
