import { createFileRoute } from '@tanstack/react-router';

import { dashboardIncidentQueryOptions } from '../app/dashboard-query-options';
import { requireUserRole } from '../app/router-auth';
import { AdminDashboardRouteView, AdminDeviceBlockedRouteView } from '../app/route-views';
import { IncidentRouteError } from '../components/IncidentRouteError';
import { isMobileOrTablet } from '../lib/device';

export const Route = createFileRoute('/_app/dashboard/admin')({
  beforeLoad: ({ context }) => {
    requireUserRole(context.authenticatedUser, 'admin');
  },
  loader: async ({ context }) => {
    const isAdminDeviceBlocked = isMobileOrTablet();
    if (!isAdminDeviceBlocked) {
      await context.queryClient.ensureQueryData(
        dashboardIncidentQueryOptions(context.authenticatedUser, 'admin'),
      );
    }
    return { viewer: context.authenticatedUser, isAdminDeviceBlocked };
  },
  errorComponent: IncidentRouteError,
  head: () => ({
    meta: [{ title: 'Panel administratora | ZglosTO' }],
  }),
  component: AdminDashboardRoute,
});

function AdminDashboardRoute() {
  const { isAdminDeviceBlocked } = Route.useLoaderData();

  return isAdminDeviceBlocked ? <AdminDeviceBlockedRouteView /> : <AdminDashboardRouteView />;
}
