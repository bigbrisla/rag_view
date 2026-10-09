<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApp } from '@/stores/app'

const { t } = useI18n()
const app = useApp()
const rows = computed(() => app.evalData?.rows ?? [])
const METRICS = ['hit@1', 'hit@3', 'hit@5', 'mrr@10'] as const
const best = computed(() =>
  Object.fromEntries(METRICS.map((m) => [m, Math.max(...rows.value.map((r) => r[m]))])),
)
</script>

<template>
  <section v-if="app.evalData" class="eval" aria-labelledby="eval-title">
    <h2 id="eval-title">{{ t('eval.title') }}</h2>
    <p class="lede">{{ t('eval.lede', { n: app.evalData.n_questions }) }}</p>
    <div class="table-wrap card">
      <table>
        <thead>
          <tr>
            <th scope="col">{{ t('eval.chunking') }}</th>
            <th scope="col">{{ t('eval.rerank') }}</th>
            <th scope="col" class="num">{{ t('eval.chunks') }}</th>
            <th v-for="m in METRICS" :key="m" scope="col" class="num">{{ m }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.preset + r.rerank">
            <th scope="row" class="mono">{{ r.preset }}</th>
            <td>{{ r.rerank ? t('eval.yes') : t('eval.no') }}</td>
            <td class="num mono">{{ r.n_chunks.toLocaleString() }}</td>
            <td
              v-for="m in METRICS"
              :key="m"
              class="num mono metric"
              :class="{ best: r[m] === best[m] }"
            >
              <span class="bar" :style="{ width: `${r[m] * 100}%` }" />
              <span class="v">{{ r[m].toFixed(2) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="note">{{ t('eval.note') }}</p>
  </section>
</template>

<style scoped>
h2 {
  font-family: var(--font-display);
  font-size: clamp(30px, 4vw, 42px);
  font-weight: 400;
}

.lede,
.note {
  max-width: 70ch;
  color: var(--ink-2);
}

.note {
  font-size: 13px;
  color: var(--muted);
}

.table-wrap {
  margin-top: 16px;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-weight: 400;
  white-space: nowrap;
}

thead th {
  color: var(--muted);
  font-size: 12px;
}

.num {
  text-align: right;
}

.metric {
  position: relative;
  min-width: 84px;
}

.bar {
  position: absolute;
  left: 14px;
  bottom: 6px;
  max-width: calc(100% - 28px);
  height: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--border-strong);
}

.best .bar {
  background: var(--ink);
}

.best .v {
  font-weight: 700;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}
</style>
