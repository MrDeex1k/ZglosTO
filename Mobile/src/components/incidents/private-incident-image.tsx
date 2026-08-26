import type { IncidentImageRef } from '@zglosto/contracts';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { imageTransitionDuration } from '@/accessibility/motion';
import { useReducedMotionPreference } from '@/accessibility/use-reduced-motion';
import type { ApiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useNetworkAvailability } from '@/queries/network-state';
import { privateImageQueryOptions } from '@/queries/private-image';

export function PrivateIncidentImage({
  accessibilityLabel,
  client,
  image,
  origin,
  userId,
}: {
  accessibilityLabel: string;
  client: ApiClient;
  image: IncidentImageRef | null;
  origin: string;
  userId: string;
}) {
  const { t } = useTranslation();

  if (image === null) {
    return <Text className="text-muted">{t(($) => $.mobile.privateImage.missing)}</Text>;
  }
  if (image.status !== 'ready') {
    return (
      <Text className="text-muted">
        {image.status === 'failed'
          ? t(($) => $.mobile.privateImage.failed)
          : t(($) => $.mobile.privateImage.processing)}
      </Text>
    );
  }

  return (
    <ReadyPrivateIncidentImage
      accessibilityLabel={accessibilityLabel}
      client={client}
      image={image}
      origin={origin}
      userId={userId}
    />
  );
}

function ReadyPrivateIncidentImage({
  accessibilityLabel,
  client,
  image,
  origin,
  userId,
}: {
  accessibilityLabel: string;
  client: ApiClient;
  image: IncidentImageRef;
  origin: string;
  userId: string;
}) {
  const { t } = useTranslation();
  const reduceMotionEnabled = useReducedMotionPreference();
  const networkAvailability = useNetworkAvailability();
  const query = useQuery(privateImageQueryOptions({ client, image, origin, userId }));

  if (query.isPending) {
    if (networkAvailability === 'offline' || query.fetchStatus === 'paused') {
      return (
        <View className="gap-3 rounded-xl bg-surface-muted p-5">
          <Text accessibilityLiveRegion="polite" className="text-muted">
            {t(($) => $.mobile.connectivity.offlineDescription)}
          </Text>
          <Button onPress={() => void query.refetch()} variant="secondary">
            {t(($) => $.mobile.connectivity.retry)}
          </Button>
        </View>
      );
    }
    return (
      <View className="min-h-48 items-center justify-center gap-3 rounded-xl bg-surface-muted p-6">
        <ActivityIndicator accessibilityLabel={t(($) => $.mobile.privateImage.loading)} />
        <Text className="text-center text-muted">{t(($) => $.mobile.privateImage.loading)}</Text>
      </View>
    );
  }
  if (query.isError) {
    return (
      <View className="gap-3 rounded-xl bg-surface-muted p-5">
        <Text accessibilityLiveRegion="polite" className="text-danger">
          {t(($) => $.mobile.privateImage.error)}
        </Text>
        <Button onPress={() => void query.refetch()} variant="secondary">
          {t(($) => $.mobile.privateImage.retry)}
        </Button>
      </View>
    );
  }

  return (
    <Image
      accessible
      accessibilityLabel={accessibilityLabel}
      cachePolicy="none"
      contentFit="contain"
      recyclingKey={`${userId}:${image.id}`}
      source={{ uri: query.data }}
      style={{ aspectRatio: 4 / 3, borderRadius: 12, width: '100%' }}
      transition={imageTransitionDuration(reduceMotionEnabled)}
    />
  );
}
