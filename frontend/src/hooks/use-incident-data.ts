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
  isLoggedIn,
  userEmail,
  userRole,
  canLoadAdminData,
}: UseIncidentDataOptions): IncidentData {
  const resolvedQuery = useQuery(resolvedIncidentsQueryOptions());
  const residentQuery = useQuery({
    ...residentIncidentsQueryOptions(userEmail),
    enabled: isLoggedIn && userRole === 'mieszkaniec' && userEmail.length > 0,
  });
  const adminQuery = useQuery({
    ...adminIncidentsQueryOptions(userEmail),
    enabled: isLoggedIn && userRole === 'admin' && userEmail.length > 0 && canLoadAdminData,
  });
  const serviceQuery = useQuery({
    ...serviceIncidentsQueryOptions(userEmail),
    enabled: isLoggedIn && userRole === 'sluzby' && userEmail.length > 0,
  });

  return {
    incidents: resolvedQuery.data ?? [],
    residentIncidents: residentQuery.data ?? [],
    allIncidents: canLoadAdminData ? (adminQuery.data ?? []) : [],
    serviceIncidents: serviceQuery.data ?? [],
    isLoadingIncidents: resolvedQuery.isPending,
    incidentsError: resolvedQuery.isError
      ? 'Nie udało się załadować zgłoszeń. Spróbuj odświeżyć stronę.'
      : null,
  };
}
