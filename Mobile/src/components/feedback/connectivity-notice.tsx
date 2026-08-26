import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export function ConnectivityNotice({
  hasCachedData = false,
  onRetry,
  variant,
}: {
  hasCachedData?: boolean;
  onRetry?: (() => void) | undefined;
  variant: 'offline' | 'refresh-error';
}) {
  const { t } = useTranslation();
  const isOffline = variant === 'offline';

  return (
    <Card
      accessibilityRole={isOffline ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      className="gap-2 border-amber-300 bg-amber-50"
    >
      <Text className="font-bold">
        {isOffline
          ? t(($) => $.mobile.connectivity.offlineTitle)
          : t(($) => $.mobile.connectivity.refreshErrorTitle)}
      </Text>
      <Text className="text-muted">
        {isOffline
          ? hasCachedData
            ? t(($) => $.mobile.connectivity.cachedDataDescription)
            : t(($) => $.mobile.connectivity.offlineDescription)
          : t(($) => $.mobile.connectivity.refreshErrorDescription)}
      </Text>
      {onRetry ? (
        <View className="pt-1">
          <Button onPress={onRetry} variant="secondary">
            {t(($) => $.mobile.connectivity.retry)}
          </Button>
        </View>
      ) : null}
    </Card>
  );
}
