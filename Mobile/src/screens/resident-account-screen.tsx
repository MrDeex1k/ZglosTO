import Constants from 'expo-constants';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MobileSessionState } from '@/auth/route-access';
import { useSession } from '@/auth/session-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import { useLocale } from '@/i18n/i18n-provider';

export function ResidentAccountScreen() {
  const runtime = useRuntimeConfig();
  const sessionContext = useSession();
  const { session } = sessionContext;

  if (
    runtime.status !== 'ready' ||
    session.status !== 'authenticated' ||
    session.role !== 'resident'
  ) {
    return null;
  }

  return (
    <ReadyResidentAccountScreen
      runtime={runtime}
      session={session}
      signOut={sessionContext.signOut}
    />
  );
}

function ReadyResidentAccountScreen({
  runtime,
  session,
  signOut,
}: {
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
  session: Extract<MobileSessionState, { status: 'authenticated' }>;
  signOut: () => Promise<void>;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  const logout = () => {
    setIsSigningOut(true);
    void signOut()
      .catch(() => undefined)
      .finally(() => {
        setIsSigningOut(false);
        router.replace('/');
      });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl gap-6 px-6 py-8">
        <View className="gap-3">
          <Text accessibilityRole="header" variant="title">
            {t(($) => $.mobile.account.title)}
          </Text>
        </View>

        <Card className="gap-3">
          <Text variant="heading">{session.name}</Text>
          <Text>{session.email}</Text>
          <Text className="text-muted">{t(($) => $.mobile.account.residentRole)}</Text>
          <Text className={session.emailVerified === true ? 'text-success' : 'text-muted'}>
            {session.emailVerified === true
              ? t(($) => $.mobile.account.emailVerified)
              : t(($) => $.mobile.account.emailUnverified)}
          </Text>
        </Card>

        <View className="gap-3">
          <Button onPress={() => router.push('/settings/language' as Href)} variant="secondary">
            {t(($) => $.mobile.account.language)}
          </Button>
          <Button onPress={() => router.push('/support/contact' as Href)} variant="secondary">
            {t(($) => $.mobile.account.contact)}
          </Button>
          <Button onPress={() => router.push('/legal' as Href)} variant="secondary">
            {t(($) => $.mobile.account.legal)}
          </Button>
        </View>

        <Card className="gap-2">
          <Text variant="heading">{t(($) => $.mobile.account.diagnostics)}</Text>
          <Text>{`${t(($) => $.mobile.account.appVersion)}: ${appVersion}`}</Text>
          <Text>{`${t(($) => $.mobile.account.configVersion)}: ${runtime.response.configVersion}`}</Text>
          <Text>{`${t(($) => $.mobile.account.environment)}: ${runtime.environment.appEnvironment}`}</Text>
          <Text>{`${t(($) => $.mobile.account.languageValue)}: ${locale}`}</Text>
        </Card>

        <Button disabled={isSigningOut} onPress={logout}>
          {isSigningOut ? t(($) => $.mobile.auth.signingOut) : t(($) => $.mobile.auth.signOut)}
        </Button>
        <Button onPress={() => router.replace('/resident')} variant="subtle">
          {t(($) => $.mobile.account.backToReports)}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
