<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { eventOf } from '@/player/timeline'
import { useApp } from '@/stores/app'
import type { Trace } from '@/types/trace'
import ShapeGlyph from '@/viz/ShapeGlyph.vue'
import { CATEGORY_ORDER, CATEGORY_SHAPE } from '@/viz/starmap'

const props = defineProps<{ trace: Trace; progress: number }>()
const { t } = useI18n()
const app = useApp()
const ev = computed(() => eventOf(props.trace, 'indexing'))
const grow = computed(() => Math.min(1, props.progress * 1.6))

const counts = computed(() => {
  const cs = app.chunks!
  const out: Record<string, number> = {}
  for (let i = 0; i < cs.n; i++) {
    const c = app.corpus!.docs[cs.doc[i]].category
    out[c] = (out[c] ?? 0) + 1
  }
  return out
})
const maxCount = computed(() => Math.max(...Object.values(counts.value)))
const cssColor = (cat: string) => `var(--cat-${cat})`
</script>

<template>
  <div class="indexing">
    <dl class="tiles">
      <div class="tile card">
        <dt>{{ t('indexing.vectors') }}</dt>
        <dd>{{ Math.round(ev.n_vectors * grow).toLocaleString() }}</dd>
      </div>
      <div class="tile card">
        <dt>{{ t('indexing.dims') }}</dt>
        <dd>{{ ev.dim }}</dd>
      </div>
      <div class="tile card">
        <dt>{{ t('indexing.size') }}</dt>
        <dd>{{ ((ev.bytes / 1e6) * grow).toFixed(2) }} <small>MB</small></dd>
      </div>
      <div class="tile card">
        <dt>{{ t('indexing.search') }}</dt>
        <dd class="small">{{ t('indexing.exact') }}</dd>
      </div>
    </dl>
    <table class="cats">
      <tbody>
        <tr
          v-for="cat in CATEGORY_ORDER"
          :key="cat"
          @mouseenter="app.categoryFocus = cat"
          @mouseleave="app.categoryFocus = null"
        >
          <th scope="row">
            <ShapeGlyph :shape="CATEGORY_SHAPE[cat]" :color="cssColor(cat)" />
            {{ app.corpus!.categories[cat] }}
          </th>
          <td class="bar-cell">
            <span
              class="bar"
              :style="{
                width: `${((counts[cat] ?? 0) / maxCount) * 100 * grow}%`,
                background: cssColor(cat),
              }"
            />
          </td>
          <td class="mono num">{{ counts[cat] ?? 0 }}</td>
        </tr>
      </tbody>
    </table>
    <p class="mono muted small">
      {{
        t('indexing.projection', {
          preset: ev.projection.fitted_on,
          neighbors: ev.projection.n_neighbors,
          dist: ev.projection.min_dist,
        })
      }}
    </p>
  </div>
</template>

<style scoped>
.indexing {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 0;
}

.tile {
  padding: 12px 14px;
}

dt {
  font-size: 12px;
  color: var(--muted);
}

dd {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-size: 30px;
  line-height: 1;
}

dd.small {
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.3;
}

.cats {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cats th {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 0;
  font-weight: 400;
  text-align: left;
  white-space: nowrap;
}

.bar-cell {
  width: 60%;
}

.bar {
  display: block;
  height: 8px;
  border-radius: 0 4px 4px 0;
}

.num {
  padding-left: 10px;
  text-align: right;
  color: var(--ink-2);
}

.small {
  margin: 0;
  font-size: 11px;
}
</style>
