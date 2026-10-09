<script setup lang="ts">
// A vector's first dimensions as signed bars around a baseline.
import { computed } from 'vue'

const props = defineProps<{ values: number[]; reveal?: number; label?: string }>()
const scale = computed(() => Math.max(0.12, ...props.values.map((v) => Math.abs(v))))
const shown = computed(() => Math.round((props.reveal ?? 1) * props.values.length))
</script>

<template>
  <figure class="barcode" :aria-label="label">
    <div class="bars">
      <span
        v-for="(v, i) in values"
        :key="i"
        class="bar"
        :class="{ neg: v < 0, on: i < shown }"
        :style="{ '--h': `${(Math.abs(v) / scale) * 50}%` }"
        :title="`dim ${i}: ${v.toFixed(4)}`"
      />
    </div>
    <figcaption v-if="label" class="mono muted">{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.barcode {
  margin: 0;
}

.bars {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  height: 64px;
  border-radius: 6px;
  background: linear-gradient(var(--border), var(--border)) center / 100% 1px no-repeat;
}

.bar {
  position: relative;
}

.bar::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 50%;
  height: 0;
  background: var(--ink-2);
  border-radius: 3px 3px 0 0;
  transition: height 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.bar.neg::before {
  bottom: auto;
  top: 50%;
  border-radius: 0 0 3px 3px;
}

.bar.on::before {
  height: var(--h);
}

figcaption {
  margin-top: 6px;
  font-size: 11px;
}
</style>
