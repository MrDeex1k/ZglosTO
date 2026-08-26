import { createFileRoute } from '@tanstack/react-router';

import { dashboardIncidentQueryOptions } from '../app/dashboard-query-options';
import { requireUserRole } from '../app/router-auth';
import { ResidentDashboardRouteView } from '../app/route-views';
import { IncidentRouteError } from '../components/IncidentRouteError';

export const Route = createFileRoute('/_app/dashboard/mieszkaniec')({
  beforeLoad: ({ context }) => {
    requireUserRole(context.authenticatedUser, 'mieszkaniec');
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      dashboardIncidentQueryOptions(context.authenticatedUser, 'mieszkaniec'),
    );
    return { viewer: context.authenticatedUser };
  },
  errorComponent: IncidentRouteError,
  head: () => ({
    meta: [{ title: 'Panel mieszkańca | ZglosTO' }],
  }),
  component: ResidentDashboardRoute,
});

function ResidentDashboardRoute() {
  const { viewer } = Route.useLoaderData();
  return <ResidentDashboardRouteView viewer={viewer} />;
}
