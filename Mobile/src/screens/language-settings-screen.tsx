import { View, SafeAreaView } from '@/components/ui/native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NativeChoice } from '@/components/ui/native-choice';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useLocale } from '@/i18n/i18n-provider';

export function LanguageSettingsScreen() {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();
  const [state, setState] = useState<'error' | 'idle' | 'saving' | 'saved'>('idle');

  const changeLocale = (nextLocale: 'en' | 'pl-PL') => {
    if (nextLocale === locale || state === 'saving') return;
    setState('saving');
    void setLocale(nextLocale)
      .then(() => {
        setState('saved');
        return undefined;
      })
      .catch(() => {
        setState('error');
      });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right', 'bottom']}>
      <View className="mx-auto w-full max-w-xl flex-1 gap-6 px-6 py-8">
        <View className="gap-2">
          <Text accessibilityRole="header" variant="title">
            {t(($) => $.mobile.languageSettings.title)}
          </Text>
          <Text className="text-lg text-muted">
            {t(($) => $.mobile.languageSettings.description)}
          </Text>
        </View>

        <Card>
          <NativeChoice
            disabled={state === 'saving'}
            label={t(($) => $.mobile.languageSettings.title)}
            onSelect={changeLocale}
            options={[
              { label: t(($) => $.common.polish), value: 'pl-PL' },
              { label: t(($) => $.common.english), value: 'en' },
            ]}
            selected={locale}
          />
        </Card>

        {state === 'saved' ? (
          <Text accessibilityLiveRegion="polite" className="text-success">
            {t(($) => $.mobile.languageSettings.saved)}
          </Text>
        ) : null}
        {state === 'error' ? (
          <Text accessibilityLiveRegion="polite" className="text-danger">
            {t(($) => $.mobile.languageSettings.error)}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
