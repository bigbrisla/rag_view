<script setup lang="ts">
import { computed } from 'vue'
import type { Shape } from './starmap'

const props = defineProps<{ shape: Shape; color: string; size?: number }>()
const s = computed(() => props.size ?? 10)
const path = computed(() => {
  const c = 5
  switch (props.shape) {
    case 'circle':
      return 'M 9 5 A 4 4 0 1 1 1 5 A 4 4 0 1 1 9 5 Z'
    case 'square':
      return 'M 1.6 1.6 H 8.4 V 8.4 H 1.6 Z'
    case 'triangle':
      return 'M 5 0.6 L 9.4 8.4 L 0.6 8.4 Z'
    case 'diamond':
      return 'M 5 0 L 9.2 5 L 5 10 L 0.8 5 Z'
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? 2.1 : 4.9
        return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`
      })
      return `M ${pts.join(' L ')} Z`
    }
    default:
      return ''
  }
})
</script>

<template>
  <svg :width="s" :height="s" viewBox="0 0 10 10" aria-hidden="true">
    <path :d="path" :fill="color" />
  </svg>
</template>
