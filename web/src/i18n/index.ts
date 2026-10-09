/**
 * Internationalisation. English is complete; Italian is a stub that falls
 * back to English key by key. To add a language, copy locales/en.json,
 * translate it and register it below.
 */
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import it from './locales/it.json'

export const LOCALES = { en: 'English', it: 'Italiano' } as const
export type Locale = keyof typeof LOCALES

function initialLocale(): Locale {
  const fromUrl = new URLSearchParams(location.search).get('lang')
  return fromUrl && fromUrl in LOCALES ? (fromUrl as Locale) : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, it },
  missingWarn: false,
  fallbackWarn: false,
})
