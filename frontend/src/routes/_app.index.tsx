import { createFileRoute } from '@tanstack/react-router';

import { HomeRouteView } from '../app/route-views';
import { resolvedIncidentsQueryOptions } from '../queries/incidents';

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(resolvedIncidentsQueryOptions());
  },
  component: HomeRouteView,
});
