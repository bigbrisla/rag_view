<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { REPO_URL } from '@/config'

const emit = defineEmits<{ hood: [] }>()
const { t } = useI18n()
const theme = ref<'dark' | 'light'>('dark')

function current(): 'dark' | 'light' {
  const set = document.documentElement.dataset.theme
  if (set === 'dark' || set === 'light') return set
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

onMounted(() => {
  try {
    const saved = localStorage.getItem('ragview-theme')
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved
  } catch {
    /* storage unavailable: follow the OS */
  }
  theme.value = current()
})

function toggle() {
  theme.value = current() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  try {
    localStorage.setItem('ragview-theme', theme.value)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <header class="header">
    <a class="brand" href="#top">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <ellipse
          cx="16"
          cy="16"
          rx="13"
          ry="6.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          transform="rotate(-22 16 16)"
        />
        <circle cx="16" cy="16" r="4.2" fill="currentColor" />
        <circle cx="27.2" cy="11.4" r="2" fill="currentColor" />
      </svg>
      <span class="name">{{ t('app.name') }}</span>
      <span class="tagline">{{ t('app.tagline') }}</span>
    </a>
    <nav>
      <button class="btn" @click="emit('hood')">
        {{ t('app.underTheHood') }} <span class="mono" aria-hidden="true">{ }</span>
      </button>
      <button class="icon-btn" :aria-label="t('app.theme')" :title="t('app.theme')" @click="toggle">
        <svg v-if="theme === 'dark'" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" fill="currentColor" />
          <g stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <path
              d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
            />
          </g>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="currentColor" />
        </svg>
      </button>
      <a
        v-if="REPO_URL"
        class="icon-btn"
        :href="REPO_URL"
        target="_blank"
        rel="noopener"
        :aria-label="t('app.github')"
        :title="t('app.github')"
      >
        <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
      </a>
    </nav>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  min-width: 0;
}

.name {
  font-family: var(--font-display);
  font-size: 24px;
  line-height: 1;
}

.tagline {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .tagline {
    display: none;
  }
}
</style>
