import type { CurrentResolvedIncidentDto } from '@zglosto/contracts';
import { useQuery } from '@tanstack/react-query';
import { Redirect, type Href, router } from 'expo-router';
import { ActivityIndicator, FlatList, type ListRenderItemInfo, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IncidentCard } from '@/components/incidents/incident-card';
import { canAccessPublicIncidents, publicRouteRedirectForSession } from '@/auth/route-access';
import { useSession } from '@/auth/session-provider';
import { routeForSession } from '@/auth/session-model';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { type RuntimeConfigState, useRuntimeConfig } from '@/config/runtime-config';
import { useLocale } from '@/i18n/i18n-provider';
import { useNetworkAvailability } from '@/queries/network-state';
import { publicIncidentsQueryOptions } from '@/queries/public-incidents';

function IncidentSeparator() {
  return <View className="h-4" />;
}

interface PublicIncidentListItem {
  config: Extract<RuntimeConfigState, { status: 'ready' }>['config'];
  incident: CurrentResolvedIncidentDto;
}

function renderIncidentItem({ item }: ListRenderItemInfo<PublicIncidentListItem>) {
  return <IncidentCard config={item.config} incident={item.incident} />;
}

export function PublicIncidentsScreen() {
  const runtime = useRuntimeConfig();
  const { session } = useSession();

  if (runtime.status !== 'ready') return null;

  const redirect = publicRouteRedirectForSession(session);
  if (redirect !== null) return <Redirect href={redirect} />;
  if (!canAccessPublicIncidents(session)) return null;

  return <ReadyPublicIncidentsScreen runtime={runtime} session={session} />;
}

function ReadyPublicIncidentsScreen({
  runtime,
  session,
}: {
  runtime: Extract<RuntimeConfigState, { status: 'ready' }>;
  session: Parameters<typeof routeForSession>[0];
}) {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();
  const networkAvailability = useNetworkAvailability();

  const query = useQuery(publicIncidentsQueryOptions(runtime.environment.apiOrigin));
  const cityName = runtime.config.city.displayName[locale];
  const incidents = (query.data ?? []).map((incident) => ({
    config: runtime.config,
    incident,
  }));
  const privateRoute = routeForSession(session);
  const isOffline = networkAvailability === 'offline';
  const hasCachedData = query.data !== undefined;

  const header = (
    <View className="gap-6 pb-6 pt-4">
      <View className="gap-3">
        <Text accessibilityRole="header" variant="title">
          {cityName}
        </Text>
        <Text className="text-lg leading-7 text-muted">
          {t(($) => $.mobile.publicFeed.description)}
        </Text>
      </View>

      <View accessibilityRole="radiogroup" className="flex-row gap-3">
        <Button
          accessibilityRole="radio"
          accessibilityState={{ checked: locale === 'pl-PL' }}
          className="flex-1"
          onPress={() => void setLocale('pl-PL')}
          variant={locale === 'pl-PL' ? 'primary' : 'secondary'}
        >
          {t(($) => $.common.polish)}
        </Button>
        <Button
          accessibilityRole="radio"
          accessibilityState={{ checked: locale === 'en' }}
          className="flex-1"
          onPress={() => void setLocale('en')}
          variant={locale === 'en' ? 'primary' : 'secondary'}
        >
          {t(($) => $.common.english)}
        </Button>
      </View>

      <Button onPress={() => router.push((privateRoute ?? '/login') as Href)} variant="secondary">
        {privateRoute === null
          ? t(($) => $.mobile.auth.signIn)
          : t(($) => $.mobile.auth.openDashboard)}
      </Button>

      <Button onPress={() => router.push('/report/new' as Href)}>
        {t(($) => $.mobile.reportIncident.openForm)}
      </Button>

      <Text accessibilityRole="header" variant="heading">
        {t(($) => $.mobile.publicFeed.title)}
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
        <ActivityIndicator accessibilityLabel={t(($) => $.mobile.publicFeed.loading)} />
        <Text className="text-center text-muted">{t(($) => $.mobile.publicFeed.loading)}</Text>
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
              actionLabel={t(($) => $.mobile.publicFeed.retry)}
              description={
                isOffline
                  ? t(($) => $.mobile.connectivity.offlineDescription)
                  : t(($) => $.mobile.publicFeed.errorDescription)
              }
              onAction={() => void query.refetch()}
              title={
                isOffline
                  ? t(($) => $.mobile.connectivity.offlineTitle)
                  : t(($) => $.mobile.publicFeed.errorTitle)
              }
            />
          ) : (
            <StatePanel
              description={t(($) => $.mobile.publicFeed.emptyDescription)}
              title={t(($) => $.mobile.publicFeed.emptyTitle)}
            />
          )
        }
        ListHeaderComponent={header}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        renderItem={renderIncidentItem}
        testID="public-incidents-ready"
      />
    </SafeAreaView>
  );
}
