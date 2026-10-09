<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AboutSection from '@/components/AboutSection.vue'
import AppHeader from '@/components/AppHeader.vue'
import EvalPanel from '@/components/EvalPanel.vue'
import FailureCases from '@/components/FailureCases.vue'
import ParamSliders from '@/components/ParamSliders.vue'
import PhaseRail from '@/components/PhaseRail.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import QuestionBar from '@/components/QuestionBar.vue'
import UnderTheHood from '@/components/UnderTheHood.vue'
import PhasePanel from '@/phases/PhasePanel.vue'
import { useApp } from '@/stores/app'
import { usePlayer } from '@/stores/player'
import StarMap from '@/viz/StarMap.vue'

const { t } = useI18n()
const app = useApp()
const player = usePlayer()
const hood = ref(false)
const stage = ref<HTMLElement>()

function onKey(ev: KeyboardEvent) {
  const el = ev.target as HTMLElement
  if (
    el.closest('input, textarea, select, [contenteditable]') ||
    ev.metaKey ||
    ev.ctrlKey ||
    ev.altKey
  )
    return
  if (ev.key === ' ' && !el.closest('button, a')) {
    ev.preventDefault()
    player.toggle()
  } else if (ev.key === 'ArrowRight') {
    player.stepForward()
  } else if (ev.key === 'ArrowLeft') {
    player.stepBack()
  } else if (ev.key === 'Escape') {
    hood.value = false
  }
}

function toStage() {
  stage.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  app.init()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div id="top" class="page">
    <AppHeader @hood="hood = true" />

    <section class="hero">
      <div class="intro">
        <i18n-t keypath="app.headline" tag="h1" scope="global">
          <template #watch
            ><em>{{ t('app.watch') }}</em></template
          >
        </i18n-t>
        <p class="lede">{{ t('app.lede', { docs: app.corpus?.docs.length ?? 47 }) }}</p>
      </div>
      <QuestionBar class="asker" />
      <details v-if="app.params" class="settings">
        <summary>{{ t('params.title') }}</summary>
        <ParamSliders />
      </details>
    </section>

    <section ref="stage" class="stage" :aria-busy="app.status !== 'ready'">
      <div class="map-col">
        <StarMap v-if="app.chunks && app.corpus" />
        <div v-else class="placeholder">
          {{
            app.status === 'error' ? t('status.error', { error: app.error }) : t('status.loading')
          }}
        </div>
      </div>
      <div class="panel-col card">
        <PhaseRail />
        <PhasePanel v-if="app.trace && app.chunks" :key="app.trace.id" :trace="app.trace" />
      </div>
      <div class="player-row card">
        <PlayerBar />
        <span class="mono muted shortcuts">{{ t('player.shortcuts') }}</span>
      </div>
    </section>

    <FailureCases v-if="app.curated" class="block" @ran="toStage" />
    <EvalPanel class="block" />
    <AboutSection />
    <UnderTheHood :open="hood" @close="hood = false" />
  </div>
</template>

<style scoped>
.page {
  max-width: 1360px;
  margin: 0 auto;
  padding: 0 24px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  grid-template-areas: 'intro asker' 'settings settings';
  column-gap: 48px;
  row-gap: 4px;
  align-items: end;
  padding: 12px 0 22px;
}

.intro {
  grid-area: intro;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.asker {
  grid-area: asker;
}

.settings {
  grid-area: settings;
  margin-top: 14px;
}

h1 {
  font-family: var(--font-display);
  font-size: clamp(36px, 4.6vw, 60px);
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.02em;
}

h1 :deep(em) {
  font-style: italic;
  color: var(--ink-2);
}

.lede {
  max-width: 62ch;
  margin: 0;
  color: var(--ink-2);
  font-size: 15px;
}

.settings {
  padding: 4px 0;
}

.settings summary {
  cursor: pointer;
  width: max-content;
  font-size: 13px;
  color: var(--ink-2);
}

.settings[open] summary {
  margin-bottom: 14px;
}

.stage {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(360px, 1fr);
  grid-template-rows: clamp(480px, calc(100vh - 400px), 820px) auto;
  gap: 12px;
  scroll-margin-top: 12px;
}

.map-col {
  min-height: 0;
}

.placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--muted);
}

.panel-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 14px 20px 20px;
  overflow-y: auto;
}

.player-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 16px;
}

.player-row > :first-child {
  flex: 1;
}

.shortcuts {
  font-size: 11px;
}

.block {
  padding: 72px 0 24px;
}

@media (max-width: 980px) {
  .hero {
    grid-template-columns: 1fr;
    grid-template-areas: 'intro' 'asker' 'settings';
    row-gap: 18px;
  }

  .stage {
    grid-template-columns: 1fr;
    grid-template-rows: 58vh auto auto;
  }

  .panel-col {
    overflow: visible;
  }

  .player-row {
    position: sticky;
    bottom: 8px;
    z-index: 5;
    grid-row: 2;
    box-shadow: var(--shadow);
  }

  .shortcuts {
    display: none;
  }
}

@media (max-width: 640px) {
  .page {
    padding: 0 16px;
  }

  .stage {
    grid-template-rows: 48vh auto auto;
  }
}
</style>
