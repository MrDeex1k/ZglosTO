import {
  createI18n,
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type SupportedLocale,
} from '@zglosto/i18n';
import { getLocales } from 'expo-localization';
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { readLocalePreference, writeLocalePreference } from '@/storage/preferences';

interface LocaleContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function MobileI18nProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { instance: Awaited<ReturnType<typeof createI18n>>; locale: SupportedLocale; status: 'ready' }
  >({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function initialize() {
      const storedLocale = await readLocalePreference();
      const deviceLocales = getLocales().flatMap((locale) => [
        locale.languageTag,
        locale.languageCode,
      ]);
      const locale = storedLocale ?? resolveSupportedLocale(deviceLocales, DEFAULT_LOCALE);
      const instance = await createI18n(locale);
      if (active) setState({ instance, locale, status: 'ready' });
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  const value: LocaleContextValue | null =
    state.status !== 'ready'
      ? null
      : {
          locale: state.locale,
          setLocale: async (locale) => {
            await state.instance.changeLanguage(locale);
            await writeLocalePreference(locale);
            setState({ instance: state.instance, locale, status: 'ready' });
          },
        };

  if (state.status !== 'ready' || value === null) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator accessibilityLabel="Loading language" />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={state.instance}>
      {/* oxlint-disable-next-line react/jsx-no-constructed-context-values -- React Compiler stabilizes the context value. */}
      <LocaleContext value={value}>{children}</LocaleContext>
    </I18nextProvider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext);
  if (value === null) throw new Error('useLocale must be used inside MobileI18nProvider.');
  return value;
}
