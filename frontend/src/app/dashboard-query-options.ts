import type { UserRole } from '@zglosto/contracts';

import {
  adminIncidentsQueryOptions,
  residentIncidentsQueryOptions,
  serviceIncidentsQueryOptions,
} from '../queries/incidents';
import { requireUserRole, type AuthenticatedRouteUser } from './router-auth';

export function dashboardIncidentQueryOptions(
  user: AuthenticatedRouteUser,
  expectedRole: UserRole,
) {
  requireUserRole(user, expectedRole);

  switch (expectedRole) {
    case 'admin':
      return adminIncidentsQueryOptions(user.email);
    case 'mieszkaniec':
      return residentIncidentsQueryOptions(user.email);
    case 'sluzby':
      return serviceIncidentsQueryOptions(user.email);
  }
}
