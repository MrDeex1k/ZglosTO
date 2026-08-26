import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { imageTransitionDuration } from '@/accessibility/motion';
import { useReducedMotionPreference } from '@/accessibility/use-reduced-motion';
import { resolvePublicAssetUrl } from '@/api/white-label';
import { ConnectivityNotice } from '@/components/feedback/connectivity-notice';
import { StatePanel } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { type RuntimeConfigState, useRuntimeConfig } from '@/config/runtime-config';
import { useLocale } from '@/i18n/i18n-provider';
import { useNetworkAvailability } from '@/queries/network-state';
import { publicIncidentsQueryOptions } from '@/queries/public-incidents';
import { useMobileTheme } from '@/theme/theme-provider';

interface IncidentDetailsScreenProps {
  incidentId: string;
}

async function openDirections(address: string, latitude: number | null, longitude: number | null) {
  const query = latitude === null || longitude === null ? address : `${latitude},${longitude}`;
  const encodedQuery = encodeURIComponent(query);
  const nativeUrl = Platform.select({
    android: `geo:0,0?q=${encodedQuery}`,
    ios: `maps://?q=${encodedQuery}`,
  });
  const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
  if (nativeUrl && (await Linking.canOpenURL(nativeUrl))) {
    await Linking.openURL(nativeUrl);
    return;
  }
  await Linking.openURL(fallbackUrl);
}

export function IncidentDetailsScreen({ incidentId }: IncidentDetailsScreenProps) {
  const runtime = useRuntimeConfig();

  if (runtime.status !== 'ready') return null;

  return <ReadyIncidentDetailsScreen incidentId={incidentId} runtime={runtime} />;
}

function ReadyIncidentDetailsScreen({
  incidentId,
  runtime,
}: IncidentDetailsScreenProps & {
  runtime: Extract<RuntimeConfigState, { status: 'ready' }>;
}) {
  const { locale } = useLocale();
  const theme = useMobileTheme();
  const { t } = useTranslation();
  const reduceMotionEnabled = useReducedMotionPreference();
  const networkAvailability = useNetworkAvailability();
  const isOffline = networkAvailability === 'offline';

  const query = useQuery(publicIncidentsQueryOptions(runtime.environment.apiOrigin));
  const incident = query.data?.find((item) => item.id_zgloszenia === incidentId) ?? null;
  const service = incident
    ? runtime.config.services.find((item) => item.key === incident.typ_sluzby)
    : null;

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
        <Text className="text-muted">{t(($) => $.mobile.incidentDetails.loading)}</Text>
      </View>
    );
  }

  if (query.isError && query.data === undefined) {
    return (
      <View className="flex-1 justify-center bg-canvas p-6">
        <StatePanel
          actionLabel={t(($) => $.mobile.publicFeed.retry)}
          description={t(($) => $.mobile.publicFeed.errorDescription)}
          onAction={() => void query.refetch()}
          title={t(($) => $.mobile.publicFeed.errorTitle)}
        />
      </View>
    );
  }

  if (incident === null) {
    return (
      <View className="flex-1 justify-center bg-canvas p-6">
        <StatePanel
          actionLabel={t(($) => $.mobile.incidentDetails.back)}
          description={t(($) => $.mobile.incidentDetails.notFoundDescription)}
          onAction={() => router.replace('/')}
          title={t(($) => $.mobile.incidentDetails.notFoundTitle)}
        />
      </View>
    );
  }

  const image = incident.zdjecie_incydentu_rozwiazanego;
  const imageUrl =
    image?.status === 'ready'
      ? resolvePublicAssetUrl(runtime.environment.apiOrigin, image.url)
      : null;

  return (
    <>
      <Stack.Screen options={{ title: t(($) => $.mobile.incidentDetails.title) }} />
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="mx-auto w-full max-w-3xl gap-5 p-6 pb-12"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-3">
          <View className="self-start rounded-full bg-green-100 px-3 py-1.5">
            <Text className="text-xs font-bold text-success">
              {t(($) => $.mobile.publicFeed.resolved)}
            </Text>
          </View>
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

        <Card className="gap-4" style={{ borderTopColor: theme.primary, borderTopWidth: 4 }}>
          <Text variant="heading">{t(($) => $.mobile.incidentDetails.information)}</Text>
          <Separator />
          <View className="gap-1">
            <Text variant="caption">{t(($) => $.mobile.incidentDetails.service)}</Text>
            <Text className="font-semibold">{service?.label[locale] ?? incident.typ_sluzby}</Text>
          </View>
          <View className="gap-1">
            <Text variant="caption">{t(($) => $.mobile.incidentDetails.reportedAt)}</Text>
            <Text>{incident.data_godzina_zgloszenia}</Text>
          </View>
          <View className="gap-1">
            <Text variant="caption">{t(($) => $.mobile.incidentDetails.resolvedAt)}</Text>
            <Text>{incident.data_godzina_rozwiazania}</Text>
          </View>
          <View className="gap-1">
            <Text variant="caption">{t(($) => $.mobile.incidentDetails.address)}</Text>
            <Text>{incident.adres_zgloszenia}</Text>
          </View>
          <Button
            onPress={() =>
              void openDirections(incident.adres_zgloszenia, incident.latitude, incident.longitude)
            }
            variant="secondary"
          >
            {t(($) => $.mobile.incidentDetails.openMap)}
          </Button>
        </Card>

        <Card className="gap-4">
          <Text variant="heading">{t(($) => $.mobile.incidentDetails.resolutionPhoto)}</Text>
          {imageUrl ? (
            <Image
              accessibilityLabel={t(($) => $.mobile.incidentDetails.resolutionPhotoAlt)}
              cachePolicy="memory-disk"
              contentFit="contain"
              source={{ uri: imageUrl }}
              style={{ aspectRatio: 4 / 3, borderRadius: 12, width: '100%' }}
              transition={imageTransitionDuration(reduceMotionEnabled)}
            />
          ) : (
            <Text className="text-muted">{t(($) => $.mobile.incidentDetails.noPhoto)}</Text>
          )}
        </Card>
      </ScrollView>
    </>
  );
}
