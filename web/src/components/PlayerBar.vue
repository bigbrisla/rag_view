<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PHASES } from '@/player/timeline'
import { usePlayer } from '@/stores/player'

const { t } = useI18n()
const player = usePlayer()
const track = ref<HTMLDivElement>()
const SPEEDS = [0.5, 1, 1.5, 2, 3]
const pct = computed(() => (player.clock.t / player.total) * 100)

function scrub(ev: PointerEvent) {
  const rect = track.value!.getBoundingClientRect()
  player.seek(((ev.clientX - rect.left) / rect.width) * player.total)
}

function drag(ev: PointerEvent) {
  if (ev.buttons !== 1) return
  scrub(ev)
}
</script>

<template>
  <div class="player">
    <div class="controls">
      <button
        class="icon-btn"
        :aria-label="t('player.back')"
        :title="t('player.back')"
        @click="player.stepBack()"
      >
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M4 3v10M13 3 6 8l7 5z"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="icon-btn play"
        :aria-label="player.playing ? t('player.pause') : t('player.play')"
        @click="player.toggle()"
      >
        <svg v-if="player.playing" viewBox="0 0 16 16" width="18" height="18">
          <rect x="3.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
          <rect x="9.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="18" height="18">
          <path
            d="M5 3v10l8-5z"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="icon-btn"
        :aria-label="t('player.forward')"
        :title="t('player.forward')"
        @click="player.stepForward()"
      >
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M12 3v10M3 3l7 5-7 5z"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div
      ref="track"
      class="track"
      role="slider"
      tabindex="0"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(player.total)"
      :aria-valuenow="Math.round(player.clock.t)"
      :aria-valuetext="t(`phases.${player.phase}.title`)"
      @pointerdown="scrub"
      @pointermove="drag"
    >
      <span
        v-for="(p, i) in PHASES"
        :key="p"
        class="seg"
        :style="{ flexGrow: player.durations[i] }"
        :class="{ done: i < player.index, now: i === player.index }"
      />
      <span class="head" :style="{ left: `${pct}%` }" />
    </div>

    <label class="speed">
      <span class="sr-only">{{ t('player.speed') }}</span>
      <select v-model.number="player.speed" class="mono">
        <option v-for="s in SPEEDS" :key="s" :value="s">{{ s }}×</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  gap: 14px;
}

.controls {
  display: flex;
  gap: 2px;
}

.play {
  width: 40px;
  height: 40px;
  background: var(--ink);
  color: var(--bg);
}

.play:hover {
  background: var(--ink);
  opacity: 0.9;
}

.track {
  position: relative;
  flex: 1;
  display: flex;
  gap: 3px;
  height: 22px;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.seg {
  flex-basis: 0;
  height: 4px;
  border-radius: 4px;
  background: var(--border-strong);
}

.seg.done {
  background: var(--ink-2);
}

.seg.now {
  background: var(--ink-2);
  opacity: 0.6;
}

.head {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--ink);
  box-shadow: 0 0 0 3px var(--panel);
}

.speed select {
  padding: 4px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel);
  font-size: 12px;
}
</style>
