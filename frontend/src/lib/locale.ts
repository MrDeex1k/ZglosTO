import { DEFAULT_LOCALE, resolveSupportedLocale, type SupportedLocale } from '@zglosto/i18n';

interface I18nLanguageState {
  readonly language?: string;
  readonly resolvedLanguage?: string;
}

export function resolveI18nLocale(instance: I18nLanguageState): SupportedLocale {
  return resolveSupportedLocale([instance.language, instance.resolvedLanguage], DEFAULT_LOCALE);
}
