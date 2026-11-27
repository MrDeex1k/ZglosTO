import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  CurrentIncidentListItemDto,
  CurrentResolvedIncidentDto,
  IncidentPage,
  IncidentStatusCode,
  ServiceIncidentStatisticsItem,
  ServiceIncidentListItemDto,
} from '@zglosto/contracts';

import { normalizeServiceKey } from '../config/services';
import { toIncidentDisplayStatus } from '../lib/incident-status';
import {
  fetchAdminIncidentStatistics,
  fetchAllIncidents,
  fetchResolvedIncidents,
  fetchServiceIncidentStatistics,
  fetchServiceIncidents,
  fetchUserIncidents,
  type IncidentPageParameters,
} from '../services/api';
import type { Incident, ServiceIncident } from '../types/incident';

export const incidentQueryKeys = {
  all: ['incidents'] as const,
  public: ['incidents', 'public'] as const,
  resolved: () => ['incidents', 'public', 'resolved'] as const,
  private: ['incidents', 'private'] as const,
  resident: (owner: string) => ['incidents', 'private', 'resident', owner] as const,
  admin: (owner: string) => ['incidents', 'private', 'admin', owner] as const,
  service: (owner: string, serviceKey: string | null = null) =>
    ['incidents', 'private', 'service', owner, serviceKey] as const,
};

export function mapResolvedIncident(apiIncident: CurrentResolvedIncidentDto): Incident {
  return {
    id: apiIncident.id_zgloszenia,
    service: normalizeServiceKey(apiIncident.typ_sluzby),
    description: apiIncident.opis_zgloszenia,
    address: apiIncident.adres_zgloszenia,
    latitude: apiIncident.latitude,
    longitude: apiIncident.longitude,
    email: '',
    imageUrl: null,
    resolvedImageUrl: apiIncident.zdjecie_incydentu_rozwiazanego?.url ?? null,
    status: 'resolved',
    checked: true,
    adminStatus: apiIncident.status_incydentu,
    createdAt: apiIncident.data_godzina_zgloszenia,
    resolvedAt: apiIncident.data_godzina_rozwiazania,
  };
}

export function mapIncident(apiIncident: CurrentIncidentListItemDto): Incident {
  return {
    id: apiIncident.id_zgloszenia,
    service: normalizeServiceKey(apiIncident.typ_sluzby),
    description: apiIncident.opis_zgloszenia,
    address: apiIncident.adres_zgloszenia,
    latitude: apiIncident.latitude,
    longitude: apiIncident.longitude,
    email: apiIncident.mail_zglaszajacego,
    imageUrl: apiIncident.zdjecie_incydentu_zglaszanego?.url ?? null,
    resolvedImageUrl: apiIncident.zdjecie_incydentu_rozwiazanego?.url ?? null,
    status: toIncidentDisplayStatus(apiIncident.status_incydentu),
    checked: apiIncident.sprawdzenie_incydentu,
    adminStatus: apiIncident.status_incydentu,
    createdAt: apiIncident.data_godzina_zgloszenia,
    resolvedAt: apiIncident.data_godzina_rozwiazania,
  };
}

export function mapServiceIncident(incident: ServiceIncidentListItemDto): ServiceIncident {
  return { ...mapIncident(incident), revision: incident.revision };
}

export const resolvedIncidentsQueryOptions = () =>
  queryOptions({
    queryKey: incidentQueryKeys.resolved(),
    queryFn: async ({ signal }) => (await fetchResolvedIncidents(signal)).map(mapResolvedIncident),
  });

type IncidentFilters = Omit<IncidentPageParameters, 'cursor'>;

function privateIncidentQueryOptions<TDto, TIncident extends Incident>(
  queryKey: QueryKey,
  queryFn: (page: IncidentPageParameters, signal: AbortSignal) => Promise<IncidentPage<TDto>>,
  map: (item: TDto) => TIncident,
  filters: IncidentFilters = {},
) {
  return infiniteQueryOptions({
    queryKey: Object.keys(filters).length === 0 ? queryKey : [...queryKey, filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const page = await queryFn({ ...filters, cursor: pageParam }, signal);
      return { items: page.items.map(map), nextCursor: page.nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export const residentIncidentsQueryOptions = (owner: string) =>
  privateIncidentQueryOptions(incidentQueryKeys.resident(owner), fetchUserIncidents, mapIncident);

export const adminIncidentsQueryOptions = (owner: string, filters?: IncidentFilters) =>
  privateIncidentQueryOptions(
    incidentQueryKeys.admin(owner),
    fetchAllIncidents,
    mapIncident,
    filters,
  );

export const serviceIncidentsQueryOptions = (
  owner: string,
  serviceKey: string | null = null,
  status?: IncidentStatusCode,
) =>
  privateIncidentQueryOptions(
    incidentQueryKeys.service(owner, serviceKey),
    fetchServiceIncidents,
    mapServiceIncident,
    status === undefined ? {} : { status },
  );

export const adminIncidentStatisticsQueryOptions = (owner: string) =>
  queryOptions({
    queryKey: [...incidentQueryKeys.private, 'admin-statistics', owner],
    queryFn: ({ signal }) => fetchAdminIncidentStatistics(signal),
  });

export const serviceIncidentStatisticsQueryOptions = (owner: string, serviceKey: string | null) =>
  queryOptions({
    queryKey: [...incidentQueryKeys.private, 'service-statistics', owner, serviceKey],
    queryFn: ({ signal }) => fetchServiceIncidentStatistics(signal),
  });

export function incidentCount(
  statistics: readonly ServiceIncidentStatisticsItem[] | undefined,
  status?: IncidentStatusCode,
): number | undefined {
  return statistics?.reduce(
    (total, row) =>
      status === undefined || status === row.status_incydentu ? total + row.liczba : total,
    0,
  );
}

export function updateIncidentCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  incidentId: string,
  update: (incident: Incident) => Incident,
): void {
  queryClient.setQueriesData<InfiniteData<IncidentPage<Incident>>>({ queryKey }, (data) =>
    data === undefined
      ? undefined
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((incident) =>
              incident.id === incidentId ? update(incident) : incident,
            ),
          })),
        },
  );
}

export async function invalidateIncidentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: incidentQueryKeys.all });
}
