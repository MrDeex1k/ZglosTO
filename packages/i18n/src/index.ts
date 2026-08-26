import {
  DEFAULT_LOCALE,
  DEPLOYMENT_TIMEZONE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@zglosto/contracts';
import { createInstance, type i18n } from 'i18next';

import { resources, type TranslationCatalog } from './resources.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    enableSelector: true;
    resources: {
      translation: TranslationCatalog;
    };
  }
}

export { enTranslation, plPLTranslation, resources, type TranslationCatalog } from './resources.js';
export { DEFAULT_LOCALE, DEPLOYMENT_TIMEZONE, SUPPORTED_LOCALES, type SupportedLocale };

export function normalizeSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace('_', '-').toLowerCase();
  if (normalized === 'pl' || normalized.startsWith('pl-')) return 'pl-PL';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return null;
}

export function resolveSupportedLocale(
  candidates: readonly unknown[],
  fallback: SupportedLocale,
): SupportedLocale {
  for (const candidate of candidates) {
    const locale = normalizeSupportedLocale(candidate);
    if (locale !== null) return locale;
  }
  return fallback;
}

export async function createI18n(locale: SupportedLocale): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'translation',
    resources,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

export function formatDateTime(
  dateValue: string,
  locale: SupportedLocale,
  timezone: typeof DEPLOYMENT_TIMEZONE,
): string {
  if (/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(dateValue)) return dateValue;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);
}

export function formatNumber(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale).format(value);
}
