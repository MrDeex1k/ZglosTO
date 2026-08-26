import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeSupportedLocale, type SupportedLocale } from '@zglosto/i18n';

import { STORAGE_KEYS } from './keys';

export async function readLocalePreference(): Promise<SupportedLocale | null> {
  return normalizeSupportedLocale(await AsyncStorage.getItem(STORAGE_KEYS.locale));
}

export async function writeLocalePreference(locale: SupportedLocale): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.locale, locale);
}
