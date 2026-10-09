<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { REPO_URL } from '@/config'

const { t } = useI18n()
const attribution = REPO_URL ? `${REPO_URL}/blob/main/corpus/ATTRIBUTION.md` : ''
</script>

<template>
  <footer class="about">
    <div>
      <h2>{{ t('about.title') }}</h2>
      <p>{{ t('about.body') }}</p>
    </div>
    <ul class="links small">
      <li>
        <a
          href="https://en.wikipedia.org/wiki/Wikipedia:Text_of_the_Creative_Commons_Attribution-ShareAlike_4.0_International_License"
          target="_blank"
          rel="noopener"
          >CC BY-SA 4.0</a
        >
      </li>
      <li v-if="attribution">
        <a :href="attribution" target="_blank" rel="noopener">{{ t('about.credits') }}</a>
      </li>
      <li v-if="REPO_URL">
        <a :href="REPO_URL" target="_blank" rel="noopener">{{ t('about.code') }}</a>
      </li>
    </ul>
  </footer>
</template>

<style scoped>
.about {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 24px;
  padding: 32px 0 48px;
  border-top: 1px solid var(--border);
}

h2 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 400;
}

p {
  max-width: 70ch;
  color: var(--ink-2);
  font-size: 14px;
}

.links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--ink-2);
}

@media (max-width: 720px) {
  .about {
    grid-template-columns: 1fr;
  }
}
</style>
