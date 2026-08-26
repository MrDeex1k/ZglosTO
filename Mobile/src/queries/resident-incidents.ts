import { queryOptions } from '@tanstack/react-query';

import type { ApiClient } from '@/api/client';
import { loadResidentIncidents } from '@/api/resident-incidents';
import { logger } from '@/observability/logger';

import { queryKeys } from './query-keys';

interface ResidentIncidentsQueryOptions {
  client: ApiClient;
  origin: string;
  userId: string;
}

export function residentIncidentsQueryOptions({
  client,
  origin,
  userId,
}: ResidentIncidentsQueryOptions) {
  return queryOptions({
    queryFn: async ({ signal }) => {
      try {
        const incidents = await loadResidentIncidents({ client, signal });
        logger.info('resident_incidents_loaded', { status: 'success' });
        return incidents;
      } catch (error) {
        logger.error('resident_incidents_failed', { status: 'error' });
        throw error;
      }
    },
    queryKey: queryKeys.residentIncidents(origin, userId),
    staleTime: 30 * 1000,
  });
}
