import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { StatePanel } from '@/components/feedback/state-panel';
import { Text } from '@/components/ui/text';
import type { RuntimeConfigState } from '@/config/runtime-config';

export function ConfigurationLoadingScreen() {
  const { t } = useTranslation();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="flex-grow items-center justify-center gap-4 p-6"
      contentInsetAdjustmentBehavior="automatic"
    >
      <ActivityIndicator accessibilityLabel={t(($) => $.mobile.foundation.loading)} />
      <Text className="text-center text-muted">{t(($) => $.mobile.foundation.loading)}</Text>
    </ScrollView>
  );
}

export function ConfigurationErrorScreen({
  state,
}: {
  state: Extract<RuntimeConfigState, { status: 'error' }>;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="flex-grow justify-center p-6"
      contentInsetAdjustmentBehavior="automatic"
    >
      <StatePanel
        actionLabel={state.retry ? t(($) => $.mobile.foundation.retry) : undefined}
        description={t(($) => $.mobile.foundation.configurationErrorDescription)}
        onAction={state.retry ?? undefined}
        title={t(($) => $.mobile.foundation.configurationError)}
      />
      {__DEV__ ? (
        <View className="pt-4">
          <Text className="text-xs text-muted">{state.error.message}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
