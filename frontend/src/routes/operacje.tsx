import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { operationsSessionKey } from '../app/app-route-paths';
import { SessionAppRouteStateProvider } from '../app/app-route-state';
import { AdminDashboardRouteView, ServiceDashboardRouteView } from '../app/route-views';
import { LoginForm } from '../components/LoginForm';
import { OperationsShell } from '../components/OperationsShell';
import { Button } from '../components/ui/button';
import { getAuthSession, signOut } from '../lib/auth-client';

export const Route = createFileRoute('/operacje')({
  ssr: false,
  head: () => ({ meta: [{ title: 'ZgłosTO Desktop' }, { name: 'robots', content: 'noindex' }] }),
  component: OperationsRoute,
});

function OperationsRoute() {
  const { t } = useTranslation();
  const {
    data: session,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: operationsSessionKey,
    queryFn: getAuthSession,
    staleTime: 0,
    retry: false,
    refetchInterval: 15_000,
  });
  const account = session?.user;
  const role = account?.uprawnienia;

  if (
    session &&
    account &&
    !isError &&
    (role === 'admin' || (role === 'sluzby' && account.serviceKey))
  ) {
    return (
      <SessionAppRouteStateProvider session={session} operations>
        {role === 'admin' ? (
          <AdminDashboardRouteView />
        ) : (
          <ServiceDashboardRouteView
            viewer={{
              role,
              serviceKey: account.serviceKey ?? null,
              email: account.email,
              name: account.name,
              emailVerified: account.emailVerified,
            }}
          />
        )}
      </SessionAppRouteStateProvider>
    );
  }

  const refresh = async () => {
    await refetch();
  };
  if (!account && !isPending && !isError) {
    return (
      <OperationsShell>
        <LoginForm onLoginSuccess={refresh} />
      </OperationsShell>
    );
  }

  const logout = async () => {
    await signOut();
    await refresh();
  };
  return (
    <OperationsShell {...(account ? { onLogout: logout } : {})}>
      <main className="container mx-auto space-y-4 px-4 py-10">
        {isPending ? (
          <p role="status">{t(($) => $.operations.checkingSession)}</p>
        ) : isError ? (
          <>
            <h1>{t(($) => $.operations.sessionUnavailable)}</h1>
            <Button onClick={() => void refresh()}>{t(($) => $.operations.retry)}</Button>
          </>
        ) : (
          <>
            <h1>{t(($) => $.operations.accessDenied)}</h1>
            <p>{t(($) => $.operations.accessRequirements)}</p>
          </>
        )}
      </main>
    </OperationsShell>
  );
}
