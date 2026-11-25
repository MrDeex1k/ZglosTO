import type { CurrentResolvedIncidentDto } from '@zglosto/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@/api/client';
import { loadPublicIncident, loadPublicIncidents } from '@/api/public-incidents';
import { logger } from '@/observability/logger';

import { queryKeys } from './query-keys';

export function publicIncidentsQueryOptions(origin: string) {
  return queryOptions({
    queryFn: async ({ signal }) => {
      try {
        const incidents = await loadPublicIncidents({
          client: createApiClient({ origin }),
          signal,
        });
        logger.info('public_incidents_loaded', { status: 'success' });
        return incidents;
      } catch (error) {
        logger.error('public_incidents_failed', { status: 'error' });
        throw error;
      }
    },
    queryKey: queryKeys.publicIncidents(origin),
    staleTime: 60 * 1000,
  });
}

export function publicIncidentQueryOptions(
  origin: string,
  incidentId: string,
  queryClient: QueryClient,
) {
  const listKey = queryKeys.publicIncidents(origin);
  return queryOptions({
    initialData: () =>
      queryClient
        .getQueryData<CurrentResolvedIncidentDto[]>(listKey)
        ?.find((incident) => incident.id_zgloszenia === incidentId),
    initialDataUpdatedAt: () => queryClient.getQueryState(listKey)?.dataUpdatedAt,
    queryFn: ({ signal }) =>
      loadPublicIncident({ client: createApiClient({ origin }), incidentId, signal }),
    queryKey: [...listKey, incidentId],
    refetchOnMount: 'always',
    staleTime: 60 * 1000,
  });
}
