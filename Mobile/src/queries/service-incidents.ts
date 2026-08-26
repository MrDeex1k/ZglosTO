import { queryOptions } from '@tanstack/react-query';

import type { ApiClient } from '@/api/client';
import { loadServiceIncidents, loadServiceStatistics } from '@/api/service-incidents';
import { logger } from '@/observability/logger';

import { queryKeys } from './query-keys';

interface ServiceQueryContext {
  client: ApiClient;
  origin: string;
  serviceKey: string;
  userId: string;
}

export function serviceIncidentsQueryOptions(context: ServiceQueryContext) {
  return queryOptions({
    queryFn: async ({ signal }) => {
      try {
        const incidents = await loadServiceIncidents({ client: context.client, signal });
        logger.info('service_incidents_loaded', { status: 'success' });
        return incidents;
      } catch (error) {
        logger.error('service_incidents_failed', { status: 'error' });
        throw error;
      }
    },
    queryKey: queryKeys.serviceIncidents(context.origin, context.userId, context.serviceKey),
    staleTime: 15 * 1000,
  });
}

export function serviceStatisticsQueryOptions(context: ServiceQueryContext) {
  return queryOptions({
    queryFn: ({ signal }) => loadServiceStatistics({ client: context.client, signal }),
    queryKey: queryKeys.serviceStatistics(context.origin, context.userId, context.serviceKey),
    staleTime: 15 * 1000,
  });
}
