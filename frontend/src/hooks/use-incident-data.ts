import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  IncidentStatusCode,
  ServiceIncidentStatisticsItem,
  UserRole,
} from '@zglosto/contracts';

import {
  residentIncidentsQueryOptions,
  resolvedIncidentsQueryOptions,
  serviceIncidentsQueryOptions,
  serviceIncidentStatisticsQueryOptions,
} from '../queries/incidents';
import type { IncidentPagination } from '../components/IncidentPageControls';
import type { Incident, ServiceIncident } from '../types/incident';

interface UseIncidentDataOptions {
  pathname: string;
  isLoggedIn: boolean;
  userEmail: string;
  userRole: UserRole;
  serviceStatusFilter?: IncidentStatusCode;
  serviceKey?: string | null;
}

export interface IncidentData {
  incidents: Incident[];
  residentIncidents: Incident[];
  residentPagination: IncidentPagination;
  serviceIncidents: ServiceIncident[];
  servicePagination: IncidentPagination;
  serviceStatistics: ServiceIncidentStatisticsItem[] | undefined;
  isLoadingIncidents: boolean;
  incidentsError: boolean;
  retryIncidents: () => void;
}

export function useIncidentData({
  pathname,
  isLoggedIn,
  userEmail,
  userRole,
  serviceStatusFilter,
  serviceKey = null,
}: UseIncidentDataOptions): IncidentData {
  const isPrivateDashboard =
    isLoggedIn && userEmail.length > 0 && pathname === `/dashboard/${userRole}`;
  const resolvedQuery = useQuery({
    ...resolvedIncidentsQueryOptions(),
    enabled: pathname === '/',
  });
  const residentQuery = useInfiniteQuery({
    ...residentIncidentsQueryOptions(userEmail),
    enabled: isPrivateDashboard && userRole === 'mieszkaniec',
  });
  const serviceQuery = useInfiniteQuery({
    ...serviceIncidentsQueryOptions(userEmail, serviceKey, serviceStatusFilter),
    enabled: isPrivateDashboard && userRole === 'sluzby',
  });

  const serviceStatistics = useQuery({
    ...serviceIncidentStatisticsQueryOptions(userEmail, serviceKey),
    enabled: isPrivateDashboard && userRole === 'sluzby',
  });

  return {
    incidents: resolvedQuery.data ?? [],
    residentIncidents: residentQuery.data?.pages.flatMap((page) => page.items) ?? [],
    residentPagination: residentQuery,
    serviceIncidents: serviceQuery.data?.pages.flatMap((page) => page.items) ?? [],
    servicePagination: serviceQuery,
    serviceStatistics: serviceStatistics.data,
    isLoadingIncidents:
      pathname === '/' && resolvedQuery.isFetching && resolvedQuery.data === undefined,
    incidentsError: resolvedQuery.isError,
    retryIncidents: () => {
      void resolvedQuery.refetch();
    },
  };
}
