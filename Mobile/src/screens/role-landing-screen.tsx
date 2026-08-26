import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session-provider';
import { homeExperienceForSession } from '@/auth/route-access';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

import { PublicIncidentsScreen } from './public-incidents-screen';

export function RoleLandingScreen() {
  const sessionContext = useSession();
  const { session } = sessionContext;
  const { t } = useTranslation();
  const experience = homeExperienceForSession(session);

  if (experience === 'loading') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <ActivityIndicator accessibilityLabel={t(($) => $.mobile.auth.checkingSession)} />
        <Text className="text-center text-muted">{t(($) => $.mobile.auth.checkingSession)}</Text>
      </View>
    );
  }

  if (experience === 'session-unavailable') {
    return (
      <View className="flex-1 justify-center bg-canvas p-6">
        <StatePanel
          actionLabel={t(($) => $.mobile.auth.retrySession)}
          description={t(($) => $.mobile.auth.sessionUnavailableDescription)}
          onAction={() => void sessionContext.refreshSession().catch(() => undefined)}
          title={t(($) => $.mobile.auth.sessionUnavailableTitle)}
        />
      </View>
    );
  }

  if (experience === 'service') {
    return <Redirect href="/service" />;
  }

  if (experience === 'admin-unavailable') {
    return <AdminMobileUnavailableScreen />;
  }

  if (experience === 'unsupported') {
    return <UnsupportedMobileRoleScreen />;
  }

  return <PublicIncidentsScreen />;
}

function AdminMobileUnavailableScreen() {
  const { signOut } = useSession();
  const { t } = useTranslation();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const logout = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/');
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1 justify-center bg-canvas p-6"
      edges={['top', 'right', 'bottom', 'left']}
      testID="admin-mobile-unavailable"
    >
      <View className="mx-auto w-full max-w-xl gap-6">
        <View className="gap-3">
          <Text accessibilityRole="header" variant="title">
            {t(($) => $.mobile.adminUnavailable.title)}
          </Text>
          <Text className="text-lg leading-7 text-muted">
            {t(($) => $.mobile.adminUnavailable.description)}
          </Text>
        </View>

        <Card className="gap-2">
          <Text variant="heading">{t(($) => $.mobile.adminUnavailable.computerTitle)}</Text>
          <Text className="leading-6 text-muted">
            {t(($) => $.mobile.adminUnavailable.computerDescription)}
          </Text>
        </Card>

        <Button
          disabled={isSigningOut}
          onPress={() => void logout()}
          testID="admin-mobile-sign-out"
        >
          {isSigningOut ? t(($) => $.mobile.auth.signingOut) : t(($) => $.mobile.auth.signOut)}
        </Button>
      </View>
    </SafeAreaView>
  );
}

function UnsupportedMobileRoleScreen() {
  const { signOut } = useSession();
  const { t } = useTranslation();

  return (
    <View className="flex-1 justify-center bg-canvas p-6">
      <StatePanel
        actionLabel={t(($) => $.mobile.auth.signOut)}
        description={t(($) => $.mobile.auth.unsupportedRole)}
        onAction={() => void signOut().finally(() => router.replace('/'))}
        title={t(($) => $.mobile.auth.unsupportedRoleTitle)}
      />
    </View>
  );
}
