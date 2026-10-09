<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MAX_QUESTION, useApp } from '@/stores/app'

const { t } = useI18n()
const app = useApp()
const text = ref('')
watch(
  () => app.question,
  (q) => (text.value = q),
  { immediate: true },
)
const featured = computed(() => app.curated?.questions.filter((q) => q.featured) ?? [])
const busy = computed(() => app.status === 'running' || app.status === 'building')
const tooLong = computed(() => text.value.length > MAX_QUESTION)

function submit() {
  if (!busy.value && !tooLong.value) app.ask(text.value)
}

const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`
</script>

<template>
  <div class="ask">
    <form class="bar" @submit.prevent="submit">
      <input
        v-model="text"
        type="text"
        :placeholder="t('ask.placeholder')"
        :aria-label="t('ask.placeholder')"
        :maxlength="MAX_QUESTION + 20"
        enterkeyhint="search"
        @focus="app.loadModel('embed').catch(() => {})"
      />
      <button class="btn primary" type="submit" :disabled="busy || !text.trim() || tooLong">
        <span v-if="busy" class="spinner" aria-hidden="true" />{{ t('ask.button') }}
      </button>
    </form>
    <p v-if="tooLong" class="small warn">{{ t('ask.tooLong', { n: MAX_QUESTION }) }}</p>

    <div class="try">
      <span class="eyebrow">{{ t('ask.try') }}</span>
      <button
        v-for="q in featured"
        :key="q.id"
        class="chip"
        :disabled="busy"
        @click="app.ask(q.question, app.manifest!.defaults)"
      >
        {{ q.question }}
      </button>
    </div>

    <div class="status small">
      <span
        v-if="app.trace"
        class="chip mode"
        :title="app.trace.source === 'replay' ? t('ask.replayHint') : t('ask.liveHint')"
      >
        <i :class="app.trace.source" />{{
          app.trace.source === 'replay' ? t('ask.replayBadge') : t('ask.liveBadge')
        }}
      </span>
      <template v-for="w in ['embed', 'rerank'] as const" :key="w">
        <span v-if="app.models[w].state === 'loading'" class="muted mono">
          {{
            t('models.downloading', {
              name: t(`models.${w}`),
              done: mb(app.models[w].loaded),
              total: mb(app.models[w].total || 1),
            })
          }}
        </span>
        <span v-else-if="app.models[w].state === 'error'" class="warn">{{
          t('models.error', { error: app.error })
        }}</span>
      </template>
      <span v-if="app.status === 'error'" class="warn">{{
        t('status.error', { error: app.error })
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.ask {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bar {
  display: flex;
  gap: 8px;
  padding: 6px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.bar:focus-within {
  border-color: var(--ink-2);
}

input {
  flex: 1;
  min-width: 0;
  padding: 8px 14px;
  border: 0;
  background: transparent;
  font-size: 16px;
  outline: none;
}

.bar .btn {
  padding: 9px 20px;
  font-size: 14px;
}

.try {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.try .chip {
  cursor: pointer;
}

.try .chip:hover {
  border-color: var(--ink-2);
  color: var(--ink);
}

.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  min-height: 24px;
}

.small {
  margin: 0;
  font-size: 12px;
}

.mode i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}

.mode i.live {
  background: var(--status-good);
}

.warn {
  color: var(--status-critical);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
