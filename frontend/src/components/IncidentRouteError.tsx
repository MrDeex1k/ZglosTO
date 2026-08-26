import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';

import { useAppRouteState } from '../app/app-route-state';
import { AppShell } from './AppViews';
import { Button } from './ui/button';

export function IncidentRouteError(_props: ErrorComponentProps) {
  const router = useRouter();
  const { navigation } = useAppRouteState();

  return (
    <AppShell navigation={navigation}>
      <main className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-warning" />
          <h1 className="text-xl font-semibold">Nie udało się załadować zgłoszeń</h1>
          <p className="text-sm text-gray-600">Sprawdź połączenie i spróbuj ponownie.</p>
          <Button
            type="button"
            onClick={() => {
              void router.invalidate();
            }}
          >
            Spróbuj ponownie
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
