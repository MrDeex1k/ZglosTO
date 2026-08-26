import type { CurrentIncidentListItemDto } from '@zglosto/contracts';
import { useQuery } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, type ListRenderItemInfo, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAuthenticatedFetch } from '@/api/authenticated-fetch';
import { createApiClient, type MobileFetch } from '@/api/client';
import { canAccessRole, canAccessServiceScope } from '@/auth/route-access';
import { useSession } from '@/auth/session-provider';
import { ServiceIncidentCard } from '@/components/incidents/service-incident-card';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import { useLocale } from '@/i18n/i18n-provider';
import type { ServiceFilter } from '@/features/service-incidents/service-phase5-policy';
import {
  filterServiceIncidents,
  serviceIncidentCounts,
} from '@/features/service-incidents/service-queue';
import { useNetworkAvailability } from '@/queries/network-state';
import { logger } from '@/observability/logger';
import { mobileRuntimeDurationMs } from '@/performance/runtime-clock';
import {
  serviceIncidentsQueryOptions,
  serviceStatisticsQueryOptions,
} from '@/queries/service-incidents';

function IncidentSeparator() {
  return <View className="h-4" />;
}

function renderIncident({ item }: ListRenderItemInfo<CurrentIncidentListItemDto>) {
  return <ServiceIncidentCard incident={item} />;
}

export function ServiceHomeScreen() {
  const runtime = useRuntimeConfig();
  const sessionContext = useSession();
  const session = sessionContext.session;
  if (runtime.status !== 'ready' || !canAccessRole(session, 'service')) return null;
  if (!canAccessServiceScope(session)) return <MissingServiceAssignment />;

  return (
    <ReadyServiceHome
      runtime={runtime}
      serviceKey={session.serviceKey}
      session={session}
      sessionContext={sessionContext}
    />
  );
}

function MissingServiceAssignment() {
  const { t } = useTranslation();
  const { signOut } = useSession();
  return (
    <View className="flex-1 justify-center bg-canvas p-6">
      <StatePanel
        actionLabel={t(($) => $.mobile.auth.signOut)}
        description={t(($) => $.mobile.service.missingServiceDescription)}
        onAction={() => void signOut().finally(() => router.replace('/'))}
        title={t(($) => $.mobile.service.missingServiceTitle)}
      />
    </View>
  );
}

function ReadyServiceHome({
  runtime,
  serviceKey,
  session,
  sessionContext,
}: {
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
  serviceKey: string;
  session: Extract<ReturnType<typeof useSession>['session'], { status: 'authenticated' }>;
  sessionContext: ReturnType<typeof useSession>;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [filter, setFilter] = useState<ServiceFilter>('all');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const networkAvailability = useNetworkAvailability();
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
  const context = {
    client,
    origin: runtime.environment.apiOrigin,
    serviceKey,
    userId: session.userId,
  };
  const incidentsQuery = useQuery(serviceIncidentsQueryOptions(context));
  const statisticsQuery = useQuery(serviceStatisticsQueryOptions(context));
  const allIncidents = incidentsQuery.data ?? [];
  const incidents = filterServiceIncidents(allIncidents, filter);
  const counts = serviceIncidentCounts(allIncidents, statisticsQuery.data);
  const serviceLabel =
    runtime.config.services.find((service) => service.key === serviceKey)?.label[locale] ??
    serviceKey;
  const isOffline = networkAvailability === 'offline';
  const hasCachedData = incidentsQuery.data !== undefined;
  const didRecordInteractive = useRef(false);

  useEffect(() => {
    if (!__DEV__ || didRecordInteractive.current || incidentsQuery.data === undefined) return;
    didRecordInteractive.current = true;
    const durationMs = mobileRuntimeDurationMs();
    logger.info('mobile_performance', {
      durationMs,
      metric: 'service_queue_js_tti',
    });
  }, [incidentsQuery.data]);

  const refreshQueue = async (): Promise<void> => {
    await Promise.all([incidentsQuery.refetch(), statisticsQuery.refetch()]);
  };

  const logout = async () => {
    setIsSigningOut(true);
    try {
      await sessionContext.signOut();
    } catch {
      // Lokalny stan jest czyszczony niezależnie od odpowiedzi serwera.
    }
    setIsSigningOut(false);
    router.replace('/');
  };

  const header = (
    <View className="gap-6 pb-6 pt-4">
      <View className="gap-2">
        <Text accessibilityRole="header" variant="title">
          {t(($) => $.mobile.service.greeting, { name: session.name })}
        </Text>
        <Text className="text-lg text-muted">{t(($) => $.mobile.service.description)}</Text>
      </View>
      <Card className="gap-2">
        <Text variant="caption">{t(($) => $.mobile.service.assignment)}</Text>
        <Text selectable className="font-semibold">
          {serviceLabel}
        </Text>
      </Card>
      <Text accessibilityRole="header" variant="heading">
        {t(($) => $.mobile.service.incidentsTitle)}
      </Text>
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        <FilterButton
          active={filter === 'all'}
          count={counts.all}
          filter="all"
          label={t(($) => $.mobile.service.filters.all)}
          onPress={() => setFilter('all')}
        />
        <FilterButton
          active={filter === 'reported'}
          count={counts.reported}
          filter="reported"
          label={t(($) => $.mobile.service.filters.reported)}
          onPress={() => setFilter('reported')}
        />
        <FilterButton
          active={filter === 'in_progress'}
          count={counts.in_progress}
          filter="in_progress"
          label={t(($) => $.mobile.service.filters.inProgress)}
          onPress={() => setFilter('in_progress')}
        />
        <FilterButton
          active={filter === 'resolved'}
          count={counts.resolved}
          filter="resolved"
          label={t(($) => $.mobile.service.filters.resolved)}
          onPress={() => setFilter('resolved')}
        />
      </View>
      <Text accessibilityLiveRegion="polite" variant="caption">
        {t(($) => $.mobile.service.visibleCount, {
          count: incidents.length,
          total: counts.all,
        })}
      </Text>
      {isOffline ? (
        <ConnectivityNotice hasCachedData={hasCachedData} variant="offline" />
      ) : incidentsQuery.isError && hasCachedData ? (
        <ConnectivityNotice
          hasCachedData
          onRetry={() => void refreshQueue()}
          variant="refresh-error"
        />
      ) : statisticsQuery.isError ? (
        <ConnectivityNotice
          hasCachedData
          onRetry={() => void statisticsQuery.refetch()}
          variant="refresh-error"
        />
      ) : null}
    </View>
  );

  if (incidentsQuery.isPending) {
    if (isOffline || incidentsQuery.fetchStatus === 'paused') {
      return (
        <View className="flex-1 justify-center bg-canvas p-6">
          <StatePanel
            actionLabel={t(($) => $.mobile.connectivity.retry)}
            description={t(($) => $.mobile.connectivity.offlineDescription)}
            onAction={() => void refreshQueue()}
            title={t(($) => $.mobile.connectivity.offlineTitle)}
          />
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <ActivityIndicator accessibilityLabel={t(($) => $.mobile.service.loading)} />
        <Text className="text-center text-muted">{t(($) => $.mobile.service.loading)}</Text>
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
        initialNumToRender={8}
        ItemSeparatorComponent={IncidentSeparator}
        keyExtractor={(item) => item.id_zgloszenia}
        ListEmptyComponent={
          incidentsQuery.isError ? (
            <StatePanel
              actionLabel={t(($) => $.mobile.service.retry)}
              description={
                isOffline
                  ? t(($) => $.mobile.connectivity.offlineDescription)
                  : t(($) => $.mobile.service.errorDescription)
              }
              onAction={() => void refreshQueue()}
              title={
                isOffline
                  ? t(($) => $.mobile.connectivity.offlineTitle)
                  : t(($) => $.mobile.service.errorTitle)
              }
            />
          ) : (
            <StatePanel
              description={t(($) => $.mobile.service.emptyDescription)}
              title={t(($) => $.mobile.service.emptyTitle)}
            />
          )
        }
        ListFooterComponent={
          <View className="gap-3 pt-8">
            <Button disabled={isSigningOut} onPress={() => void logout()}>
              {isSigningOut ? t(($) => $.mobile.auth.signingOut) : t(($) => $.mobile.auth.signOut)}
            </Button>
            <Button onPress={() => router.replace('/')} variant="secondary">
              {t(($) => $.mobile.routes.backHome)}
            </Button>
          </View>
        }
        ListHeaderComponent={header}
        onRefresh={() => void refreshQueue()}
        refreshing={incidentsQuery.isRefetching || statisticsQuery.isRefetching}
        renderItem={renderIncident}
        maxToRenderPerBatch={8}
        testID="service-queue-ready"
        updateCellsBatchingPeriod={50}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

function FilterButton({
  active,
  count,
  filter,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  filter: ServiceFilter;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      testID={`service-filter-${filter}`}
      variant={active ? 'primary' : 'secondary'}
    >
      {`${label} (${count})`}
    </Button>
  );
}
