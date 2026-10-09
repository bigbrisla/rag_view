<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApp } from '@/stores/app'
import { usePlayer } from '@/stores/player'
import type { Trace } from '@/types/trace'
import JsonTree from './JsonTree.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const app = useApp()
const player = usePlayer()
const tab = ref<'phase' | 'trace'>('phase')
const importError = ref('')
const file = ref<HTMLInputElement>()

const event = computed(() => app.trace?.events[player.index])

function download() {
  const tr = app.trace
  if (!tr) return
  const blob = new Blob([JSON.stringify(tr, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ragview-trace-${tr.id}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function load(ev: Event) {
  importError.value = ''
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const data = JSON.parse(await f.text())
    const [{ default: Ajv2020 }, { default: schema }] = await Promise.all([
      import('ajv/dist/2020'),
      import('@/types/trace.schema.json'),
    ])
    const validate = new Ajv2020({ strict: false }).compile(schema)
    if (!validate(data))
      throw new Error(validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('; '))
    await app.importTrace(data as unknown as Trace)
    emit('close')
  } catch (e) {
    importError.value = t('hood.invalid', { error: e instanceof Error ? e.message : String(e) })
  } finally {
    if (file.value) file.value.value = ''
  }
}
</script>

<template>
  <Transition name="drawer">
    <aside
      v-if="open"
      class="drawer"
      role="dialog"
      :aria-label="t('hood.title')"
      @keydown.esc="emit('close')"
    >
      <header>
        <h2>{{ t('hood.title') }}</h2>
        <button class="icon-btn" aria-label="Close" @click="emit('close')">✕</button>
      </header>
      <p v-if="app.trace" class="mono muted small">
        {{
          t('hood.schema', {
            v: app.trace.schema_version,
            engine: app.trace.engine,
            source: app.trace.source,
          })
        }}
        · id {{ app.trace.id }}
      </p>
      <div class="tabs" role="tablist">
        <button
          role="tab"
          :aria-selected="tab === 'phase'"
          :class="{ on: tab === 'phase' }"
          @click="tab = 'phase'"
        >
          {{ t('hood.phase') }} · {{ t(`phases.${player.phase}.title`) }}
        </button>
        <button
          role="tab"
          :aria-selected="tab === 'trace'"
          :class="{ on: tab === 'trace' }"
          @click="tab = 'trace'"
        >
          {{ t('hood.trace') }}
        </button>
      </div>
      <div class="body">
        <JsonTree
          v-if="tab === 'phase' && event"
          :key="`${app.trace?.id}-${player.index}`"
          :value="event"
        />
        <JsonTree v-else-if="app.trace" :key="app.trace.id" :value="app.trace" />
      </div>
      <footer>
        <button class="btn" @click="download">{{ t('hood.download') }}</button>
        <label class="btn">
          {{ t('hood.import') }}
          <input
            ref="file"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            @change="load"
          />
        </label>
        <p v-if="importError" class="error small">{{ importError }}</p>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.drawer {
  position: fixed;
  z-index: 20;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(520px, 100vw);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 18px 14px;
  background: var(--panel);
  border-left: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h2 {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 400;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}

.tabs button {
  padding: 6px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  font-size: 13px;
  color: var(--muted);
}

.tabs button.on {
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.body {
  flex: 1;
  overflow: auto;
  padding: 4px 2px;
}

footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.small {
  margin: 0;
  font-size: 11.5px;
}

.error {
  flex-basis: 100%;
  color: var(--status-critical);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.25s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
