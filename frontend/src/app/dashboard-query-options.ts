import type { QueryClient } from '@tanstack/react-query';
import type { UserRole } from '@zglosto/contracts';

import {
  adminIncidentsQueryOptions,
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
      await queryClient.ensureQueryData(adminIncidentsQueryOptions(user.email));
      return;
    case 'mieszkaniec':
      await queryClient.ensureQueryData(residentIncidentsQueryOptions(user.email));
      return;
    case 'sluzby':
      await queryClient.ensureQueryData(serviceIncidentsQueryOptions(user.email, user.serviceKey));
  }
}
