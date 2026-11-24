import { ScrollView } from '@/components/ui/native';
import { router } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/auth/session-provider';
import { routeForSession } from '@/auth/session-model';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

type VerificationState = 'checking' | 'sign-in' | 'verified' | 'unavailable';

async function checkVerification(
  refreshSession: ReturnType<typeof useSession>['refreshSession'],
): Promise<VerificationState> {
  try {
    const session = await refreshSession();
    return session.status === 'authenticated' && session.emailVerified === true
      ? 'verified'
      : 'sign-in';
  } catch {
    return 'unavailable';
  }
}

export function EmailVerificationResultScreen() {
  const { refreshSession, session, signOut } = useSession();
  const { t } = useTranslation();
  const [state, setState] = useState<VerificationState>('checking');
  const [isNavigating, setIsNavigating] = useState(false);
  const sessionReady = session.status !== 'unknown';

  const checkOnOpen = useEffectEvent(() => checkVerification(refreshSession));

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    void checkOnOpen().then((result) => {
      if (active) setState(result);
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [sessionReady]);

  const destination = routeForSession(session);
  const openNext = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    if (state === 'verified') {
      router.replace(destination ?? '/login');
      return;
    }

    if (session.status === 'authenticated') {
      try {
        await signOut();
      } catch {
        // signOut always performs local cleanup, even if the server request fails.
      }
    }
    router.replace('/login');
  };

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="flex-grow justify-center p-6"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Card className="gap-4">
        <Text accessibilityRole="header" variant="heading">
          {state === 'checking'
            ? t(($) => $.mobile.emailVerification.checkingTitle)
            : state === 'verified'
              ? t(($) => $.mobile.emailVerification.verifiedTitle)
              : state === 'sign-in'
                ? t(($) => $.mobile.emailVerification.signInTitle)
                : t(($) => $.mobile.emailVerification.unavailableTitle)}
        </Text>
        <Text className="text-muted">
          {state === 'checking'
            ? t(($) => $.mobile.emailVerification.checkingDescription)
            : state === 'verified'
              ? t(($) => $.mobile.emailVerification.verifiedDescription)
              : state === 'sign-in'
                ? t(($) => $.mobile.emailVerification.signInDescription)
                : t(($) => $.mobile.emailVerification.unavailableDescription)}
        </Text>
        {state === 'unavailable' ? (
          <Button
            onPress={() => {
              setState('checking');
              void checkVerification(refreshSession).then(setState);
            }}
            variant="secondary"
          >
            {t(($) => $.mobile.connectivity.retry)}
          </Button>
        ) : null}
        {state === 'checking' ? null : (
          <Button disabled={isNavigating} onPress={() => void openNext()}>
            {state !== 'verified' || destination === null
              ? t(($) => $.mobile.emailVerification.signIn)
              : t(($) => $.mobile.emailVerification.openDashboard)}
          </Button>
        )}
      </Card>
    </ScrollView>
  );
}
