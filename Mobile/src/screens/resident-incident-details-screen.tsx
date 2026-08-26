import { useQuery } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { router, Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createAuthenticatedFetch } from '@/api/authenticated-fetch';
import { createApiClient, type MobileFetch } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { PrivateIncidentImage } from '@/components/incidents/private-incident-image';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import { useLocale } from '@/i18n/i18n-provider';
import { useNetworkAvailability } from '@/queries/network-state';
import { residentIncidentsQueryOptions } from '@/queries/resident-incidents';

export function ResidentIncidentDetailsScreen({ incidentId }: { incidentId: string }) {
  const runtime = useRuntimeConfig();
  const sessionContext = useSession();
  const session = sessionContext.session;
  if (
    runtime.status !== 'ready' ||
    session.status !== 'authenticated' ||
    session.role !== 'resident'
  ) {
    return null;
  }

  return (
    <ReadyResidentIncidentDetails
      incidentId={incidentId}
      runtime={runtime}
      session={session}
      sessionContext={sessionContext}
    />
  );
}

function ReadyResidentIncidentDetails({
  incidentId,
  runtime,
  session,
  sessionContext,
}: {
  incidentId: string;
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
  session: Extract<ReturnType<typeof useSession>['session'], { status: 'authenticated' }>;
  sessionContext: ReturnType<typeof useSession>;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const networkAvailability = useNetworkAvailability();
  const isOffline = networkAvailability === 'offline';
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
  const incident = query.data?.find((item) => item.id_zgloszenia === incidentId) ?? null;

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
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">{t(($) => $.mobile.residentDetails.loading)}</Text>
      </View>
    );
  }
  if ((query.isError && query.data === undefined) || incident === null) {
    return (
      <View className="flex-1 justify-center bg-canvas p-6">
        <StatePanel
          actionLabel={t(($) => $.mobile.residentDetails.back)}
          description={
            query.isError
              ? t(($) => $.mobile.residentDetails.errorDescription)
              : t(($) => $.mobile.residentDetails.notFoundDescription)
          }
          onAction={() => router.back()}
          title={
            query.isError
              ? t(($) => $.mobile.residentDetails.errorTitle)
              : t(($) => $.mobile.residentDetails.notFoundTitle)
          }
        />
      </View>
    );
  }

  const service = runtime.config.services.find((item) => item.key === incident.typ_sluzby);
  const status =
    incident.status_incydentu === 'reported'
      ? t(($) => $.incidents.status.reported)
      : incident.status_incydentu === 'in_progress'
        ? t(($) => $.incidents.status.inProgress)
        : t(($) => $.incidents.status.resolved);

  return (
    <>
      <Stack.Screen options={{ title: t(($) => $.mobile.residentDetails.title) }} />
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="mx-auto w-full max-w-3xl gap-5 p-6 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-3">
          <Text className="font-bold text-danger">{status}</Text>
          <Text accessibilityRole="header" variant="title">
            {incident.opis_zgloszenia}
          </Text>
          <Text className="text-lg leading-7 text-muted">{incident.adres_zgloszenia}</Text>
        </View>

        {isOffline ? (
          <ConnectivityNotice hasCachedData variant="offline" />
        ) : query.isError ? (
          <ConnectivityNotice
            hasCachedData
            onRetry={() => void query.refetch()}
            variant="refresh-error"
          />
        ) : null}

        <Card className="gap-4">
          <Text variant="heading">{t(($) => $.mobile.residentDetails.information)}</Text>
          <Separator />
          <Detail label={t(($) => $.mobile.incidentDetails.service)}>
            {service?.label[locale] ?? incident.typ_sluzby}
          </Detail>
          <Detail label={t(($) => $.mobile.resident.reportedAt)}>
            {incident.data_godzina_zgloszenia}
          </Detail>
          <Detail label={t(($) => $.mobile.residentDetails.verification)}>
            {incident.sprawdzenie_incydentu
              ? t(($) => $.mobile.resident.verified)
              : t(($) => $.mobile.resident.awaitingVerification)}
          </Detail>
        </Card>

        <Card className="gap-4">
          <Text variant="heading">{t(($) => $.mobile.residentDetails.reportPhoto)}</Text>
          <PrivateIncidentImage
            accessibilityLabel={t(($) => $.mobile.residentDetails.reportPhotoAlt)}
            client={client}
            image={incident.zdjecie_incydentu_zglaszanego}
            origin={runtime.environment.apiOrigin}
            userId={session.userId}
          />
        </Card>

        {incident.zdjecie_incydentu_rozwiazanego === null ? null : (
          <Card className="gap-4">
            <Text variant="heading">{t(($) => $.mobile.residentDetails.resolutionPhoto)}</Text>
            <PrivateIncidentImage
              accessibilityLabel={t(($) => $.mobile.residentDetails.resolutionPhotoAlt)}
              client={client}
              image={incident.zdjecie_incydentu_rozwiazanego}
              origin={runtime.environment.apiOrigin}
              userId={session.userId}
            />
          </Card>
        )}

        <Button onPress={() => router.back()} variant="secondary">
          {t(($) => $.mobile.residentDetails.back)}
        </Button>
      </ScrollView>
    </>
  );
}

function Detail({ children, label }: { children: string; label: string }) {
  return (
    <View className="gap-1">
      <Text variant="caption">{label}</Text>
      <Text selectable className="font-semibold">
        {children}
      </Text>
    </View>
  );
}
