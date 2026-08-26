import { createFileRoute } from '@tanstack/react-router';

import { dashboardIncidentQueryOptions } from '../app/dashboard-query-options';
import { requireUserRole } from '../app/router-auth';
import { ServiceDashboardRouteView } from '../app/route-views';
import { IncidentRouteError } from '../components/IncidentRouteError';

export const Route = createFileRoute('/_app/dashboard/sluzby')({
  beforeLoad: ({ context }) => {
    requireUserRole(context.authenticatedUser, 'sluzby');
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      dashboardIncidentQueryOptions(context.authenticatedUser, 'sluzby'),
    );
    return { viewer: context.authenticatedUser };
  },
  errorComponent: IncidentRouteError,
  head: () => ({
    meta: [{ title: 'Panel służby | ZglosTO' }],
  }),
  component: ServiceDashboardRoute,
});

function ServiceDashboardRoute() {
  const { viewer } = Route.useLoaderData();
  return <ServiceDashboardRouteView viewer={viewer} />;
}
