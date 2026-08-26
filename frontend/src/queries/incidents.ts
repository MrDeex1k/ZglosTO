import { queryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { CurrentIncidentListItemDto, CurrentResolvedIncidentDto } from '@zglosto/contracts';

import { normalizeServiceKey } from '../config/services';
import { toIncidentDisplayStatus } from '../lib/incident-status';
import {
  fetchAllIncidents,
  fetchResolvedIncidents,
  fetchServiceIncidents,
  fetchUserIncidents,
} from '../services/api';
import type { Incident } from '../types/incident';

export const incidentQueryKeys = {
  all: ['incidents'] as const,
  public: ['incidents', 'public'] as const,
  resolved: () => ['incidents', 'public', 'resolved'] as const,
  private: ['incidents', 'private'] as const,
  resident: (owner: string) => ['incidents', 'private', 'resident', owner] as const,
  admin: (owner: string) => ['incidents', 'private', 'admin', owner] as const,
  service: (owner: string) => ['incidents', 'private', 'service', owner] as const,
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

export const resolvedIncidentsQueryOptions = () =>
  queryOptions({
    queryKey: incidentQueryKeys.resolved(),
    queryFn: async () => (await fetchResolvedIncidents()).map(mapResolvedIncident),
  });

function privateIncidentQueryOptions(
  queryKey: QueryKey,
  queryFn: () => Promise<CurrentIncidentListItemDto[]>,
) {
  return queryOptions({
    queryKey,
    queryFn: async () => (await queryFn()).map(mapIncident),
  });
}

export const residentIncidentsQueryOptions = (owner: string) =>
  privateIncidentQueryOptions(incidentQueryKeys.resident(owner), fetchUserIncidents);

export const adminIncidentsQueryOptions = (owner: string) =>
  privateIncidentQueryOptions(incidentQueryKeys.admin(owner), fetchAllIncidents);

export const serviceIncidentsQueryOptions = (owner: string) =>
  privateIncidentQueryOptions(incidentQueryKeys.service(owner), fetchServiceIncidents);

export function updateIncidentCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  incidentId: string,
  update: (incident: Incident) => Incident,
): void {
  queryClient.setQueryData<Incident[]>(queryKey, (incidents) =>
    incidents?.map((incident) => (incident.id === incidentId ? update(incident) : incident)),
  );
}

export async function invalidateIncidentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: incidentQueryKeys.all });
}
