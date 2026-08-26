// oxlint-disable-next-line import/no-unassigned-import
import '../../global.css';
// oxlint-disable-next-line import/no-unassigned-import
import '@/performance/runtime-clock';

import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'react-native';

import { canAccessPublicIncidents, canAccessRole } from '@/auth/route-access';
import { useSession } from '@/auth/session-provider';
import { useRuntimeConfig } from '@/config/runtime-config';
import { MobileProviders } from '@/providers/mobile-providers';
import {
  ConfigurationErrorScreen,
  ConfigurationLoadingScreen,
} from '@/screens/configuration-gate-screen';
import { ThemeProvider } from '@/theme/theme-provider';

function RootNavigator() {
  const runtime = useRuntimeConfig();
  const { session } = useSession();
  const { t } = useTranslation();

  if (runtime.status === 'loading') return <ConfigurationLoadingScreen />;
  if (runtime.status === 'error') return <ConfigurationErrorScreen state={runtime} />;

  return (
    <ThemeProvider config={runtime.config}>
      <StatusBar barStyle="dark-content" />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="open/incidents/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="auth/email-verified"
          options={{ title: t(($) => $.mobile.emailVerification.routeTitle) }}
        />
        <Stack.Screen
          name="+not-found"
          options={{ title: t(($) => $.mobile.routes.notFoundTitle) }}
        />
        <Stack.Protected guard={session.status !== 'authenticated'}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccessPublicIncidents(session)}>
          <Stack.Screen
            name="incidents/[id]"
            options={{ title: t(($) => $.mobile.incidentDetails.title) }}
          />
          <Stack.Screen
            name="report/new"
            options={{
              presentation: 'modal',
              title: t(($) => $.mobile.reportIncident.routeTitle),
            }}
          />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="support" options={{ headerShown: false }} />
          <Stack.Screen name="legal" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccessRole(session, 'resident')}>
          <Stack.Screen name="(resident)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={canAccessRole(session, 'service')}>
          <Stack.Screen name="(service)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <MobileProviders>
      <RootNavigator />
    </MobileProviders>
  );
}
