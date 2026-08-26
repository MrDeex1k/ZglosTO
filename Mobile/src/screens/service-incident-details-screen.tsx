import type { IncidentStatusCode } from '@zglosto/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createAuthenticatedFetch } from '@/api/authenticated-fetch';
import { createApiClient, type MobileFetch } from '@/api/client';
import {
  updateServiceIncidentStatus,
  updateServiceIncidentVerification,
} from '@/api/service-incidents';
import { canAccessServiceScope } from '@/auth/route-access';
import { useSession } from '@/auth/session-provider';
import { PrivateIncidentImage } from '@/components/incidents/private-incident-image';
import { ServiceResolutionImageField } from '@/components/incidents/service-resolution-image-field';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useRuntimeConfig } from '@/config/runtime-config';
import {
  serviceMutationFailureAction,
  type ServiceMutationFailureAction,
} from '@/features/service-incidents/service-phase5-policy';
import { useNetworkAvailability } from '@/queries/network-state';
import { logger } from '@/observability/logger';
import { queryKeys } from '@/queries/query-keys';
import { serviceIncidentsQueryOptions } from '@/queries/service-incidents';

export function ServiceIncidentDetailsScreen({ incidentId }: { incidentId: string }) {
  const runtime = useRuntimeConfig();
  const sessionContext = useSession();
  const session = sessionContext.session;
  if (runtime.status !== 'ready' || !canAccessServiceScope(session)) return null;
  return (
    <ReadyServiceIncidentDetails
      incidentId={incidentId}
      runtime={runtime}
      serviceKey={session.serviceKey}
      session={session}
      sessionContext={sessionContext}
    />
  );
}

function ReadyServiceIncidentDetails({
  incidentId,
  runtime,
  serviceKey,
  session,
  sessionContext,
}: {
  incidentId: string;
  runtime: Extract<ReturnType<typeof useRuntimeConfig>, { status: 'ready' }>;
  serviceKey: string;
  session: Extract<ReturnType<typeof useSession>['session'], { status: 'authenticated' }>;
  sessionContext: ReturnType<typeof useSession>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const networkAvailability = useNetworkAvailability();
  const [mutationFeedback, setMutationFeedback] = useState<
    'status-saved' | 'verification-saved' | ServiceMutationFailureAction | null
  >(null);
  const mutationStartedAt = useRef<number | null>(null);
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
  const incident = incidentsQuery.data?.find((item) => item.id_zgloszenia === incidentId) ?? null;
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceIncidents(
          runtime.environment.apiOrigin,
          session.userId,
          serviceKey,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.serviceStatistics(
          runtime.environment.apiOrigin,
          session.userId,
          serviceKey,
        ),
      }),
    ]);
  };
  const statusMutation = useMutation({
    mutationFn: ({ revision, status }: { revision: number; status: IncidentStatusCode }) =>
      updateServiceIncidentStatus({ client, incidentId, revision, status }),
    onError: async (error) => {
      const action = serviceMutationFailureAction(error);
      if (action === 'silent') return;
      setMutationFeedback(action);
      if (action === 'conflict-refresh' || action === 'incident-unavailable') await invalidate();
    },
    onSuccess: async () => {
      if (__DEV__ && mutationStartedAt.current !== null) {
        logger.info('mobile_performance', {
          durationMs: Math.round(performance.now() - mutationStartedAt.current),
          metric: 'service_status_mutation',
        });
      }
      mutationStartedAt.current = null;
      setMutationFeedback('status-saved');
      await invalidate();
    },
  });
  const verificationMutation = useMutation({
    mutationFn: ({ revision, verified }: { revision: number; verified: boolean }) =>
      updateServiceIncidentVerification({ client, incidentId, revision, verified }),
    onError: async (error) => {
      const action = serviceMutationFailureAction(error);
      if (action === 'silent') return;
      setMutationFeedback(action);
      if (action === 'conflict-refresh' || action === 'incident-unavailable') await invalidate();
    },
    onSuccess: async () => {
      if (__DEV__ && mutationStartedAt.current !== null) {
        logger.info('mobile_performance', {
          durationMs: Math.round(performance.now() - mutationStartedAt.current),
          metric: 'service_verification_mutation',
        });
      }
      mutationStartedAt.current = null;
      setMutationFeedback('verification-saved');
      await invalidate();
    },
  });
  const isMutating = statusMutation.isPending || verificationMutation.isPending;
  const isOffline = networkAvailability === 'offline';
  const startStatusMutation = (status: IncidentStatusCode) => {
    if (incident === null) return;
    statusMutation.reset();
    verificationMutation.reset();
    setMutationFeedback(null);
    mutationStartedAt.current = performance.now();
    statusMutation.mutate({ revision: incident.revision, status });
  };
  const startVerificationMutation = (verified: boolean) => {
    if (incident === null) return;
    statusMutation.reset();
    verificationMutation.reset();
    setMutationFeedback(null);
    mutationStartedAt.current = performance.now();
    verificationMutation.mutate({ revision: incident.revision, verified });
  };

  if (incidentsQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">{t(($) => $.mobile.serviceDetails.loading)}</Text>
      </View>
    );
  }
  if (incidentsQuery.isError || incident === null) {
    return (
      <View className="flex-1 justify-center bg-canvas p-6">
        <StatePanel
          actionLabel={t(($) => $.mobile.serviceDetails.back)}
          description={
            incidentsQuery.isError
              ? t(($) => $.mobile.serviceDetails.errorDescription)
              : t(($) => $.mobile.serviceDetails.notFoundDescription)
          }
          onAction={() => router.back()}
          title={
            incidentsQuery.isError
              ? t(($) => $.mobile.serviceDetails.errorTitle)
              : t(($) => $.mobile.serviceDetails.notFoundTitle)
          }
        />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t(($) => $.mobile.serviceDetails.title) }} />
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="mx-auto w-full max-w-3xl gap-5 p-6 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-3">
          <Text accessibilityRole="header" variant="title">
            {incident.opis_zgloszenia}
          </Text>
          <Text className="text-lg leading-7 text-muted">{incident.adres_zgloszenia}</Text>
          <MutationFeedbackMessage announce={false} feedback={mutationFeedback} />
        </View>

        <Card className="gap-4">
          <Text variant="heading">{t(($) => $.mobile.serviceDetails.reporterData)}</Text>
          <Separator />
          <Detail label={t(($) => $.mobile.serviceDetails.email)}>
            {incident.mail_zglaszajacego}
          </Detail>
          <Detail label={t(($) => $.mobile.resident.reportedAt)}>
            {incident.data_godzina_zgloszenia}
          </Detail>
          <Detail label={t(($) => $.mobile.incidentDetails.address)}>
            {incident.adres_zgloszenia}
          </Detail>
        </Card>

        {isOffline ? <ConnectivityNotice hasCachedData variant="offline" /> : null}

        <Card className="gap-4">
          <Text variant="heading">{t(($) => $.mobile.serviceDetails.reportPhoto)}</Text>
          <PrivateIncidentImage
            accessibilityLabel={t(($) => $.mobile.serviceDetails.reportPhotoAlt)}
            client={client}
            image={incident.zdjecie_incydentu_zglaszanego}
            origin={runtime.environment.apiOrigin}
            userId={session.userId}
          />
        </Card>

        <Card accessibilityLabel={t(($) => $.mobile.serviceDetails.actions)} className="gap-4">
          <Text accessibilityRole="header" variant="heading">
            {t(($) => $.mobile.serviceDetails.actions)}
          </Text>
          <Separator />
          <Text variant="caption">{t(($) => $.mobile.serviceDetails.status)}</Text>
          <View accessibilityRole="radiogroup" className="gap-2">
            <StatusButton
              active={incident.status_incydentu === 'reported'}
              disabled={isMutating || isOffline}
              label={t(($) => $.incidents.status.reported)}
              onPress={() => startStatusMutation('reported')}
            />
            <StatusButton
              active={incident.status_incydentu === 'in_progress'}
              disabled={isMutating || isOffline}
              label={t(($) => $.incidents.status.inProgress)}
              onPress={() => startStatusMutation('in_progress')}
            />
            <StatusButton
              active={incident.status_incydentu === 'resolved'}
              disabled={isMutating || isOffline}
              label={t(($) => $.incidents.status.resolved)}
              onPress={() => startStatusMutation('resolved')}
            />
          </View>
          <Separator />
          <Button
            accessibilityRole="checkbox"
            accessibilityState={{ checked: incident.sprawdzenie_incydentu }}
            disabled={isMutating || isOffline}
            onPress={() => startVerificationMutation(!incident.sprawdzenie_incydentu)}
            testID="service-toggle-verification"
            variant={incident.sprawdzenie_incydentu ? 'secondary' : 'primary'}
          >
            {incident.sprawdzenie_incydentu
              ? t(($) => $.mobile.serviceDetails.markUnverified)
              : t(($) => $.mobile.serviceDetails.markVerified)}
          </Button>
          {isMutating ? (
            <Text accessibilityLiveRegion="polite" className="text-muted">
              {t(($) => $.mobile.serviceDetails.saving)}
            </Text>
          ) : null}
          <MutationFeedbackMessage feedback={mutationFeedback} />
        </Card>

        {incident.zdjecie_incydentu_rozwiazanego === null ? null : (
          <Card className="gap-4">
            <Text variant="heading">{t(($) => $.mobile.serviceDetails.resolutionPhoto)}</Text>
            <PrivateIncidentImage
              accessibilityLabel={t(($) => $.mobile.serviceDetails.resolutionPhotoAlt)}
              client={client}
              image={incident.zdjecie_incydentu_rozwiazanego}
              origin={runtime.environment.apiOrigin}
              userId={session.userId}
            />
          </Card>
        )}

        <Card className="gap-4">
          <Text variant="heading">{t(($) => $.mobile.serviceDetails.addResolutionPhoto)}</Text>
          <ServiceResolutionImageField
            client={client}
            incidentId={incident.id_zgloszenia}
            key={incident.id_zgloszenia}
            networkAvailability={networkAvailability}
            onCompleted={invalidate}
          />
        </Card>

        <Button onPress={() => router.back()} variant="secondary">
          {t(($) => $.mobile.serviceDetails.back)}
        </Button>
      </ScrollView>
    </>
  );
}

function MutationFeedbackMessage({
  announce = true,
  feedback,
}: {
  announce?: boolean;
  feedback: 'status-saved' | 'verification-saved' | ServiceMutationFailureAction | null;
}) {
  const { t } = useTranslation();
  if (feedback === null || feedback === 'silent') return null;
  const isSuccess = feedback === 'status-saved' || feedback === 'verification-saved';
  let message: string;
  switch (feedback) {
    case 'status-saved':
      message = t(($) => $.mobile.serviceDetails.statusSaved);
      break;
    case 'verification-saved':
      message = t(($) => $.mobile.serviceDetails.verificationSaved);
      break;
    case 'conflict-refresh':
      message = t(($) => $.mobile.serviceDetails.conflictError);
      break;
    case 'incident-unavailable':
      message = t(($) => $.mobile.serviceDetails.incidentUnavailableError);
      break;
    case 'retry-manually':
      message = t(($) => $.mobile.serviceDetails.retryableMutationError);
      break;
    case 'scope-changed':
      message = t(($) => $.mobile.serviceDetails.scopeChangedError);
      break;
    case 'session-expired':
      message = t(($) => $.mobile.serviceDetails.sessionExpiredError);
      break;
    case 'show-error':
      message = t(($) => $.mobile.serviceDetails.mutationError);
      break;
  }
  return (
    <Text
      accessibilityLiveRegion={announce ? 'polite' : 'none'}
      className={isSuccess ? 'text-success' : 'text-danger'}
      testID="service-mutation-feedback"
    >
      {message}
    </Text>
  );
}

function StatusButton({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      disabled={disabled || active}
      onPress={onPress}
      variant={active ? 'primary' : 'secondary'}
    >
      {label}
    </Button>
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
