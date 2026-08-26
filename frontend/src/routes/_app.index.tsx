import { createFileRoute } from '@tanstack/react-router';

import { HomeRouteView } from '../app/route-views';
import { IncidentRouteError } from '../components/IncidentRouteError';
import { resolvedIncidentsQueryOptions } from '../queries/incidents';

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(resolvedIncidentsQueryOptions()),
  errorComponent: IncidentRouteError,
  component: HomeRouteView,
});
