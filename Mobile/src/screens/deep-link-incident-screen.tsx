import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { routeForSession } from '@/auth/session-model';
import { StatePanel } from '@/components/feedback/state-panel';
import { Text } from '@/components/ui/text';
import {
  type IncidentLinkTarget,
  privateIncidentRoute,
  resolvePublicIncidentRoute,
  serializeLoginIntent,
} from '@/linking/deep-link-intent';

export function DeepLinkIncidentScreen({
  incidentId,
  target,
}: {
  incidentId: string | null;
  target: IncidentLinkTarget | null;
}) {
  const { session } = useSession();
  const { t } = useTranslation();
  const invalid = incidentId === null || target === null;

  useEffect(() => {
    if (invalid || session.status === 'unknown' || session.status === 'stale') return;
    if (target === 'public') {
      const route = resolvePublicIncidentRoute(session, incidentId);
      if (route !== null) router.replace(route);
      return;
    }
    if (session.status === 'anonymous') {
      router.replace({
        pathname: '/login',
        params: { intent: serializeLoginIntent({ incidentId, target }) },
      });
      return;
    }
    if (session.role === target) {
      router.replace(privateIncidentRoute({ incidentId, target }));
      return;
    }
    router.replace((routeForSession(session) ?? '/') as Href);
  }, [incidentId, invalid, session, target]);

  if (invalid) {
    return (
      <View className="flex-1 justify-center bg-canvas p-6">
        <StatePanel
          actionLabel={t(($) => $.mobile.routes.backHome)}
          description={t(($) => $.mobile.deepLinks.invalidDescription)}
          onAction={() => router.replace('/')}
          title={t(($) => $.mobile.deepLinks.invalidTitle)}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-canvas p-6">
      <Text accessibilityLiveRegion="polite" className="text-muted">
        {session.status === 'stale'
          ? t(($) => $.mobile.deepLinks.sessionError)
          : t(($) => $.mobile.deepLinks.opening)}
      </Text>
    </View>
  );
}
