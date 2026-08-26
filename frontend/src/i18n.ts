import {
  createI18n,
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type SupportedLocale,
} from '@zglosto/i18n';

import { applyWhiteLabelDocumentConfig } from './config/white-label';
import { resolveI18nLocale } from './lib/locale';

const LOCALE_STORAGE_KEY = 'zglosto.locale';
const storedLocale =
  typeof window === 'undefined' ? null : window.localStorage.getItem(LOCALE_STORAGE_KEY);
const browserLanguages = typeof window === 'undefined' ? [] : window.navigator.languages;
const initialLocale = resolveSupportedLocale([storedLocale, ...browserLanguages], DEFAULT_LOCALE);

export const i18n = await createI18n(initialLocale);
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale;
  applyWhiteLabelDocumentConfig(initialLocale);
}

export function getCurrentLocale(): SupportedLocale {
  return resolveI18nLocale(i18n);
}

export async function changeLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    applyWhiteLabelDocumentConfig(locale);
  }
}
