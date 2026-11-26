import type { QueryClient } from '@tanstack/react-query';
import type { UserRole } from '@zglosto/contracts';

import {
  adminIncidentStatisticsQueryOptions,
  residentIncidentsQueryOptions,
  serviceIncidentsQueryOptions,
} from '../queries/incidents';
import { requireUserRole, type AuthenticatedRouteUser } from './router-auth';

export async function ensureDashboardIncidentData(
  queryClient: QueryClient,
  user: AuthenticatedRouteUser,
  expectedRole: UserRole,
): Promise<void> {
  requireUserRole(user, expectedRole);

  switch (expectedRole) {
    case 'admin':
      await queryClient.ensureQueryData(adminIncidentStatisticsQueryOptions(user.email));
      return;
    case 'mieszkaniec':
      await queryClient.ensureInfiniteQueryData(residentIncidentsQueryOptions(user.email));
      return;
    case 'sluzby':
      await queryClient.ensureInfiniteQueryData(
        serviceIncidentsQueryOptions(user.email, user.serviceKey),
      );
  }
}
