<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PHASES } from '@/player/timeline'
import { usePlayer } from '@/stores/player'

const { t } = useI18n()
const player = usePlayer()
</script>

<template>
  <nav class="rail" aria-label="Pipeline steps">
    <ol>
      <li v-for="(p, i) in PHASES" :key="p">
        <button
          :class="{ done: i < player.index, now: i === player.index }"
          :aria-current="i === player.index ? 'step' : undefined"
          @click="player.playPhase(i)"
        >
          <span class="n mono">{{ i + 1 }}</span>
          <span class="name">{{ t(`phases.${p}.title`) }}</span>
          <span
            class="fill"
            :style="{
              transform: `scaleX(${i < player.index ? 1 : i === player.index ? player.progress : 0})`,
            }"
          />
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
ol {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 2px 10px;
  border: 0;
  background: none;
  text-align: left;
  color: var(--muted);
  overflow: hidden;
}

button::after,
.fill {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--border-strong);
}

.fill {
  background: var(--ink);
  transform-origin: left;
}

button.now,
button.done {
  color: var(--ink);
}

.n {
  font-size: 10.5px;
  color: var(--muted);
}

.name {
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

@media (max-width: 720px) {
  .name {
    display: none;
  }

  button {
    align-items: center;
  }
}
</style>
