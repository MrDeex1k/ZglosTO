import { useQuery } from '@tanstack/react-query';
import type { UserRole } from '@zglosto/contracts';

import {
  adminIncidentsQueryOptions,
  residentIncidentsQueryOptions,
  resolvedIncidentsQueryOptions,
  serviceIncidentsQueryOptions,
} from '../queries/incidents';
import type { Incident } from '../types/incident';

interface UseIncidentDataOptions {
  pathname: string;
  isLoggedIn: boolean;
  userEmail: string;
  userRole: UserRole;
  canLoadAdminData: boolean;
}

export interface IncidentData {
  incidents: Incident[];
  residentIncidents: Incident[];
  allIncidents: Incident[];
  serviceIncidents: Incident[];
  isLoadingIncidents: boolean;
  incidentsError: string | null;
}

export function useIncidentData({
  pathname,
  isLoggedIn,
  userEmail,
  userRole,
  canLoadAdminData,
}: UseIncidentDataOptions): IncidentData {
  const isPrivateDashboard =
    isLoggedIn && userEmail.length > 0 && pathname === `/dashboard/${userRole}`;
  const resolvedQuery = useQuery({
    ...resolvedIncidentsQueryOptions(),
    enabled: pathname === '/',
  });
  const residentQuery = useQuery({
    ...residentIncidentsQueryOptions(userEmail),
    enabled: isPrivateDashboard && userRole === 'mieszkaniec',
  });
  const adminQuery = useQuery({
    ...adminIncidentsQueryOptions(userEmail),
    enabled: isPrivateDashboard && userRole === 'admin' && canLoadAdminData,
  });
  const serviceQuery = useQuery({
    ...serviceIncidentsQueryOptions(userEmail),
    enabled: isPrivateDashboard && userRole === 'sluzby',
  });

  return {
    incidents: resolvedQuery.data ?? [],
    residentIncidents: residentQuery.data ?? [],
    allIncidents: canLoadAdminData ? (adminQuery.data ?? []) : [],
    serviceIncidents: serviceQuery.data ?? [],
    isLoadingIncidents: pathname === '/' && resolvedQuery.isLoading,
    incidentsError: resolvedQuery.isError
      ? 'Nie udało się załadować zgłoszeń. Spróbuj odświeżyć stronę.'
      : null,
  };
}
