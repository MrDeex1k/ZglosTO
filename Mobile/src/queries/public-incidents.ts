import { queryOptions } from '@tanstack/react-query';

import { createApiClient } from '@/api/client';
import { loadPublicIncidents } from '@/api/public-incidents';
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
