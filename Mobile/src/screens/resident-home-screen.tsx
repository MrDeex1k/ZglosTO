import type { CurrentIncidentListItemDto, PublicWhiteLabelConfig } from '@zglosto/contracts';
import { useQuery } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, type ListRenderItemInfo, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAuthenticatedFetch } from '@/api/authenticated-fetch';
import { createApiClient, type MobileFetch } from '@/api/client';
import type { MobileSessionState } from '@/auth/route-access';
import { useSession } from '@/auth/session-provider';
import { ResidentIncidentCard } from '@/components/incidents/resident-incident-card';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import { useNetworkAvailability } from '@/queries/network-state';
import { residentIncidentsQueryOptions } from '@/queries/resident-incidents';

interface ResidentListItem {
  config: PublicWhiteLabelConfig;
  incident: CurrentIncidentListItemDto;
}

function IncidentSeparator() {
  return <View className="h-4" />;
}

function renderIncidentItem({ item }: ListRenderItemInfo<ResidentListItem>) {
  return <ResidentIncidentCard config={item.config} incident={item.incident} />;
}

export function ResidentHomeScreen() {
  const runtime = useRuntimeConfig();
  const sessionContext = useSession();
  const { session } = sessionContext;
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (
    runtime.status !== 'ready' ||
    session.status !== 'authenticated' ||
    session.role !== 'resident'
  ) {
    return null;
  }

  return (
    <ReadyResidentHomeScreen
      isSigningOut={isSigningOut}
      onSigningOutChange={setIsSigningOut}
      runtime={runtime}
      session={session}
      sessionContext={sessionContext}
    />
  );
}

function ReadyResidentHomeScreen({
  isSigningOut,
  onSigningOutChange,
  runtime,
  session,
  sessionContext,
}: {
  isSigningOut: boolean;
  onSigningOutChange: (value: boolean) => void;
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
  session: Extract<MobileSessionState, { status: 'authenticated' }>;
  sessionContext: ReturnType<typeof useSession>;
}) {
  const { t } = useTranslation();
  const { sendVerificationEmail, signOut } = sessionContext;
  const networkAvailability = useNetworkAvailability();
  const [verificationState, setVerificationState] = useState<'error' | 'idle' | 'sending' | 'sent'>(
    'idle',
  );

  const authenticatedFetch = createAuthenticatedFetch({
    fetcher: expoFetch as MobileFetch,
    getCookie: sessionContext.getCookie,
    onForbidden: sessionContext.handleForbidden,
    onUnauthorized: sessionContext.handleUnauthorized,
  });
  const client = createApiClient({
    fetcher: authenticatedFetch,
    origin: runtime.environment.apiOrigin,
  });
  const query = useQuery(
    residentIncidentsQueryOptions({
      client,
      origin: runtime.environment.apiOrigin,
      userId: session.userId,
    }),
  );
  const incidents = (query.data ?? []).map((incident) => ({ config: runtime.config, incident }));
  const isOffline = networkAvailability === 'offline';
  const hasCachedData = query.data !== undefined;

  const logout = async () => {
    onSigningOutChange(true);
    try {
      await signOut();
    } catch {
      // Lokalny stan i SecureStore są czyszczone niezależnie od odpowiedzi serwera.
    }
    onSigningOutChange(false);
    router.replace('/');
  };

  const resendVerification = async () => {
    setVerificationState('sending');
    try {
      await sendVerificationEmail(session.email);
      setVerificationState('sent');
    } catch {
      setVerificationState('error');
    }
  };

  const header = (
    <View className="gap-6 pb-6 pt-4">
      <View className="gap-2">
        <Text accessibilityRole="header" variant="title">
          {t(($) => $.mobile.resident.greeting, { name: session.name })}
        </Text>
        <Text className="text-lg text-muted">{t(($) => $.mobile.resident.description)}</Text>
      </View>
      <Card className="gap-2">
        <Text variant="caption">{t(($) => $.mobile.auth.signedInAs)}</Text>
        <Text className="font-semibold">{session.email}</Text>
      </Card>
      {session.emailVerified === false ? (
        <Card accessibilityRole="alert" className="gap-3 border-amber-300 bg-amber-50">
          <Text className="font-semibold">{t(($) => $.mobile.emailVerificationNotice.title)}</Text>
          <Text className="text-muted">
            {t(($) => $.mobile.emailVerificationNotice.description)}
          </Text>
          {verificationState === 'sent' ? (
            <Text accessibilityLiveRegion="polite" className="text-success">
              {t(($) => $.mobile.emailVerificationNotice.sent)}
            </Text>
          ) : null}
          {verificationState === 'error' ? (
            <Text accessibilityLiveRegion="polite" className="text-danger">
              {t(($) => $.mobile.emailVerificationNotice.error)}
            </Text>
          ) : null}
          <Button
            disabled={verificationState === 'sending'}
            onPress={() => void resendVerification()}
            variant="secondary"
          >
            {verificationState === 'sending'
              ? t(($) => $.mobile.emailVerificationNotice.sending)
              : t(($) => $.mobile.emailVerificationNotice.resend)}
          </Button>
        </Card>
      ) : null}
      <Button onPress={() => router.push('/report/new' as Href)}>
        {t(($) => $.mobile.reportIncident.openForm)}
      </Button>
      <Button onPress={() => router.push('/account' as Href)} variant="secondary">
        {t(($) => $.mobile.account.open)}
      </Button>
      <Text accessibilityRole="header" variant="heading">
        {t(($) => $.mobile.resident.historyTitle)}
      </Text>
      {isOffline ? (
        <ConnectivityNotice hasCachedData={hasCachedData} variant="offline" />
      ) : query.isError && hasCachedData ? (
        <ConnectivityNotice
          hasCachedData
          onRetry={() => void query.refetch()}
          variant="refresh-error"
        />
      ) : null}
    </View>
  );

  const footer = (
    <View className="gap-3 pt-8">
      <Button disabled={isSigningOut} onPress={() => void logout()}>
        {isSigningOut ? t(($) => $.mobile.auth.signingOut) : t(($) => $.mobile.auth.signOut)}
      </Button>
      <Button onPress={() => router.replace('/')} variant="secondary">
        {t(($) => $.mobile.routes.backHome)}
      </Button>
    </View>
  );

  if (query.isPending) {
    if (isOffline || query.fetchStatus === 'paused') {
      return (
        <View className="flex-1 justify-center bg-canvas p-6">
          <StatePanel
            actionLabel={t(($) => $.mobile.connectivity.retry)}
            description={t(($) => $.mobile.connectivity.offlineDescription)}
            onAction={() => void query.refetch()}
            title={t(($) => $.mobile.connectivity.offlineTitle)}
          />
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <ActivityIndicator accessibilityLabel={t(($) => $.mobile.resident.loading)} />
        <Text className="text-center text-muted">{t(($) => $.mobile.resident.loading)}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <FlatList
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-3xl grow px-6 pb-10"
        contentInsetAdjustmentBehavior="automatic"
        data={incidents}
        ItemSeparatorComponent={IncidentSeparator}
        keyExtractor={(item) => item.incident.id_zgloszenia}
        ListEmptyComponent={
          query.isError ? (
            <StatePanel
              actionLabel={t(($) => $.mobile.resident.retry)}
              description={
                isOffline
                  ? t(($) => $.mobile.connectivity.offlineDescription)
                  : t(($) => $.mobile.resident.errorDescription)
              }
              onAction={() => void query.refetch()}
              title={
                isOffline
                  ? t(($) => $.mobile.connectivity.offlineTitle)
                  : t(($) => $.mobile.resident.errorTitle)
              }
            />
          ) : (
            <StatePanel
              description={t(($) => $.mobile.resident.emptyDescription)}
              title={t(($) => $.mobile.resident.emptyTitle)}
            />
          )
        }
        ListFooterComponent={footer}
        ListHeaderComponent={header}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        renderItem={renderIncidentItem}
      />
    </SafeAreaView>
  );
}
