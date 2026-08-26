import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import { useLocale } from '@/i18n/i18n-provider';

export function LegalScreen() {
  const runtime = useRuntimeConfig();
  const { locale } = useLocale();
  const { t } = useTranslation();

  if (runtime.status !== 'ready') return null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl gap-6 px-6 py-8">
        <View className="gap-2">
          <Text accessibilityRole="header" variant="title">
            {t(($) => $.mobile.legal.title)}
          </Text>
          <Text className="text-lg text-muted">{t(($) => $.mobile.legal.description)}</Text>
        </View>

        <Card className="gap-2">
          <Text variant="heading">{t(($) => $.mobile.legal.noticeTitle)}</Text>
          <Text>{runtime.config.localContent.legalNotice[locale]}</Text>
        </Card>

        {runtime.environment.appEnvironment === 'development' ? (
          <Card accessibilityRole="alert" className="gap-2 border-amber-300 bg-amber-50">
            <Text className="font-semibold">{t(($) => $.mobile.legal.documentsTitle)}</Text>
            <Text className="text-muted">{t(($) => $.mobile.legal.documentsPending)}</Text>
          </Card>
        ) : null}

        <Button onPress={() => router.push('/support/contact')} variant="secondary">
          {t(($) => $.mobile.legal.contact)}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
