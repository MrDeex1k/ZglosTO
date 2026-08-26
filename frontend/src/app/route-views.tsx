import { Monitor } from 'lucide-react';

import { AdminPanel } from '../components/AdminPanel';
import { AppShell, HomeView, ResidentDashboard, ServiceDashboard } from '../components/AppViews';
import { LoginForm } from '../components/LoginForm';
import { RegisterForm } from '../components/RegisterForm';
import { useAppRouteState } from './app-route-state';
import { getUserDisplayName, type AuthenticatedRouteUser } from './router-auth';

export function HomeRouteView() {
  const state = useAppRouteState();

  return (
    <HomeView
      navigation={state.navigation}
      isReportDialogOpen={state.isReportDialogOpen}
      onReportDialogOpenChange={state.setIsReportDialogOpen}
      reporterEmail={state.isLoggedIn ? state.userEmail : null}
      onSubmit={state.submitIncident}
      incidents={state.incidents}
      visibleCount={state.visibleIncidents}
      isLoading={state.isLoadingIncidents}
      error={state.incidentsError}
      onShowMore={state.showAllVisibleIncidents}
      onIncidentClick={state.openIncident}
      selectedIncident={state.selectedIncident}
      isOpen={state.isDetailsDialogOpen}
      onOpenChange={state.setIsDetailsDialogOpen}
    />
  );
}

export function LoginRouteView({ redirectPath }: Readonly<{ redirectPath: string | null }>) {
  const state = useAppRouteState();

  return (
    <AppShell navigation={state.navigation}>
      <LoginForm
        onRegisterClick={state.navigateToRegister}
        onLoginSuccess={(role) => state.completeAuthentication(role, redirectPath)}
      />
    </AppShell>
  );
}

export function RegisterRouteView() {
  const state = useAppRouteState();

  return (
    <AppShell navigation={state.navigation}>
      <RegisterForm
        onLoginClick={state.navigateToLogin}
        onRegisterSuccess={(role) => state.completeAuthentication(role, null)}
      />
    </AppShell>
  );
}

export function ResidentDashboardRouteView({
  viewer,
}: Readonly<{ viewer: AuthenticatedRouteUser }>) {
  const state = useAppRouteState();

  return (
    <ResidentDashboard
      navigation={state.navigation}
      userDisplayName={getUserDisplayName(viewer)}
      isEmailVerified={viewer.emailVerified}
      incidents={state.residentIncidents}
      onIncidentClick={state.openIncident}
      selectedIncident={state.selectedIncident}
      isOpen={state.isDetailsDialogOpen}
      onOpenChange={state.setIsDetailsDialogOpen}
    />
  );
}

export function ServiceDashboardRouteView({
  viewer,
}: Readonly<{ viewer: AuthenticatedRouteUser }>) {
  const state = useAppRouteState();

  return (
    <ServiceDashboard
      navigation={state.navigation}
      userDisplayName={getUserDisplayName(viewer)}
      serviceKey={viewer.serviceKey}
      incidents={state.serviceIncidents}
      statusFilter={state.serviceStatusFilter}
      visibleCount={state.visibleServiceIncidents}
      onStatusFilterChange={state.setServiceStatusFilter}
      onShowMore={state.showMoreServiceIncidents}
      onIncidentClick={state.openIncident}
      onUpdate={state.updateServiceIncident}
      selectedIncident={state.selectedIncident}
      isOpen={state.isDetailsDialogOpen}
      onOpenChange={state.setIsDetailsDialogOpen}
    />
  );
}

export function AdminDashboardRouteView() {
  const state = useAppRouteState();

  return (
    <AppShell navigation={state.navigation}>
      <main className="flex-1 container mx-auto px-4">
        <AdminPanel incidents={state.allIncidents} owner={state.userEmail} />
      </main>
    </AppShell>
  );
}

export function AdminDeviceBlockedRouteView() {
  const state = useAppRouteState();

  return (
    <AppShell navigation={state.navigation}>
      <main className="container mx-auto flex flex-1 items-center justify-center px-4 py-12">
        <div className="max-w-lg text-center">
          <Monitor aria-hidden="true" className="mx-auto mb-6 size-14 text-brand-primary" />
          <h1 className="mb-4 text-gray-900">Skorzystaj z komputera</h1>
          <p className="text-gray-600">
            Panel administratora jest obecnie dostępny tylko na komputerach. Otwórz aplikację na
            komputerze, aby zarządzać zgłoszeniami.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
