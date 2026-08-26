import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { routeForSession } from '@/auth/session-model';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

type VerificationState = 'checking' | 'sign-in' | 'verified' | 'unavailable';

export function EmailVerificationResultScreen() {
  const { refreshSession, session, signOut } = useSession();
  const { t } = useTranslation();
  const [state, setState] = useState<VerificationState>('checking');
  const [isNavigating, setIsNavigating] = useState(false);
  const refreshStarted = useRef(false);

  useEffect(() => {
    if (refreshStarted.current) return;
    refreshStarted.current = true;
    let active = true;
    void refreshSession()
      .then((nextSession) => {
        if (active) {
          setState(
            nextSession.status === 'authenticated' && nextSession.emailVerified === true
              ? 'verified'
              : 'sign-in',
          );
        }
        return undefined;
      })
      .catch(() => {
        if (active) setState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [refreshSession]);

  const destination = routeForSession(session);
  const openNext = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    if (state === 'verified') {
      router.replace((destination ?? '/login') as Href);
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
