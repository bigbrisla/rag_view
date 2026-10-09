<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'JsonTree' })
const props = defineProps<{ value: unknown; name?: string | number; depth?: number }>()
const { t } = useI18n()
const PAGE = 12
const depth = computed(() => props.depth ?? 0)
const open = ref(depth.value < 2)
const limit = ref(PAGE)

const kind = computed(() =>
  Array.isArray(props.value)
    ? 'array'
    : props.value !== null && typeof props.value === 'object'
      ? 'object'
      : 'leaf',
)
const entries = computed<[string | number, unknown][]>(() =>
  kind.value === 'array'
    ? (props.value as unknown[]).map((v, i) => [i, v])
    : Object.entries(props.value as Record<string, unknown>),
)
const inline = computed(
  () =>
    kind.value === 'array' &&
    entries.value.length <= 24 &&
    entries.value.every(([, v]) => typeof v === 'number'),
)
const summary = computed(() =>
  kind.value === 'array' ? `[${entries.value.length}]` : `{${entries.value.length}}`,
)
const leaf = computed(() => JSON.stringify(props.value))
const leafClass = computed(() => (props.value === null ? 'null' : typeof props.value))
</script>

<template>
  <div class="node">
    <template v-if="kind === 'leaf'">
      <span v-if="name !== undefined" class="key">{{ name }}:</span>
      <span :class="leafClass">{{ leaf.length > 400 ? leaf.slice(0, 400) + '…"' : leaf }}</span>
    </template>
    <template v-else-if="inline">
      <span v-if="name !== undefined" class="key">{{ name }}:</span>
      <span class="number">{{ leaf }}</span>
    </template>
    <template v-else>
      <button class="toggle" :aria-expanded="open" @click="open = !open">
        <span class="caret">{{ open ? '▾' : '▸' }}</span>
        <span v-if="name !== undefined" class="key">{{ name }}:</span>
        <span class="muted">{{ summary }}</span>
      </button>
      <div v-if="open" class="children">
        <JsonTree
          v-for="[k, v] in entries.slice(0, limit)"
          :key="k"
          :name="k"
          :value="v"
          :depth="depth + 1"
        />
        <button v-if="entries.length > limit" class="more" @click="limit += 50">
          {{ t('hood.expand', { n: entries.length - limit }) }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.node {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.children {
  padding-left: 14px;
  border-left: 1px solid var(--border);
  margin-left: 4px;
}

.toggle,
.more {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
}

.more {
  color: var(--muted);
  text-decoration: underline;
}

.caret {
  display: inline-block;
  width: 12px;
  color: var(--muted);
}

.key {
  margin-right: 6px;
  color: var(--ink-2);
}

.string {
  color: var(--cat-crewed);
}

.number {
  color: var(--cat-bodies);
}

.boolean,
.null {
  color: var(--cat-people);
}
</style>
