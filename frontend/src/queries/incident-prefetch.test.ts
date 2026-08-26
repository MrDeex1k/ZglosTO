import { QueryClient } from '@tanstack/react-query';
import type { CurrentIncidentListItemDto, CurrentResolvedIncidentDto } from '@zglosto/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchAllIncidents: vi.fn(),
  fetchResolvedIncidents: vi.fn(),
  fetchServiceIncidents: vi.fn(),
  fetchUserIncidents: vi.fn(),
}));

vi.mock('../config/services', () => ({
  normalizeServiceKey: (serviceKey: string) => serviceKey,
}));
vi.mock('../lib/incident-status', () => ({
  toIncidentDisplayStatus: (status: string) =>
    status === 'in_progress' ? 'in-progress' : status === 'reported' ? 'pending' : 'resolved',
}));
vi.mock('../services/api', () => apiMocks);

import { createAppQueryClient } from '../lib/query-client';
import {
  adminIncidentsQueryOptions,
  incidentQueryKeys,
  invalidateIncidentQueries,
  residentIncidentsQueryOptions,
  resolvedIncidentsQueryOptions,
  serviceIncidentsQueryOptions,
} from './incidents';

const createdAt = '2026-07-24T10:00:00.000Z';
const privateIncident: CurrentIncidentListItemDto = {
  id_zgloszenia: 'incident-private',
  opis_zgloszenia: 'Uszkodzona nawierzchnia',
  mail_zglaszajacego: 'resident@example.com',
  adres_zgloszenia: 'Rynek 1',
  latitude: 52,
  longitude: 21,
  zdjecie_incydentu_zglaszanego: null,
  zdjecie_incydentu_rozwiazanego: null,
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  typ_sluzby: 'roads',
  llm_odpowiedz: null,
  llm_classification: 'municipal',
  llm_model_available: true,
  llm_source: 'model',
  llm_reason: null,
  data_godzina_zgloszenia: createdAt,
  data_godzina_rozwiazania: null,
};
const resolvedIncident: CurrentResolvedIncidentDto = {
  id_zgloszenia: 'incident-public',
  opis_zgloszenia: 'Naprawiona nawierzchnia',
  adres_zgloszenia: 'Rynek 2',
  latitude: 52,
  longitude: 21,
  typ_sluzby: 'roads',
  status_incydentu: 'resolved',
  zdjecie_incydentu_rozwiazanego: null,
  data_godzina_zgloszenia: createdAt,
  data_godzina_rozwiazania: '2026-07-24T11:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.fetchAllIncidents.mockResolvedValue([privateIncident]);
  apiMocks.fetchResolvedIncidents.mockResolvedValue([resolvedIncident]);
  apiMocks.fetchServiceIncidents.mockResolvedValue([privateIncident]);
  apiMocks.fetchUserIncidents.mockResolvedValue([privateIncident]);
});

describe('incident route prefetching', () => {
  it('reuses public data ensured by the loader without a duplicate request', async () => {
    const queryClient = createAppQueryClient();
    const loaderOptions = resolvedIncidentsQueryOptions();

    const loaderData = await queryClient.ensureQueryData(loaderOptions);
    const componentData = await queryClient.fetchQuery(resolvedIncidentsQueryOptions());

    expect(loaderData).toEqual(componentData);
    expect(apiMocks.fetchResolvedIncidents).toHaveBeenCalledTimes(1);
  });

  it('keeps private cache entries isolated between session owners', async () => {
    const queryClient = createAppQueryClient();

    await queryClient.ensureQueryData(residentIncidentsQueryOptions('first@example.com'));
    await queryClient.ensureQueryData(residentIncidentsQueryOptions('second@example.com'));

    expect(apiMocks.fetchUserIncidents).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(incidentQueryKeys.resident('first@example.com'))).toBeDefined();
    expect(
      queryClient.getQueryData(incidentQueryKeys.resident('second@example.com')),
    ).toBeDefined();
  });

  it('uses the expected private endpoint for every dashboard role', async () => {
    const queryClient = createAppQueryClient();

    await queryClient.ensureQueryData(adminIncidentsQueryOptions('admin@example.com'));
    await queryClient.ensureQueryData(serviceIncidentsQueryOptions('service@example.com'));
    await queryClient.ensureQueryData(residentIncidentsQueryOptions('resident@example.com'));

    expect(apiMocks.fetchAllIncidents).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchServiceIncidents).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchUserIncidents).toHaveBeenCalledTimes(1);
  });

  it('invalidates public and private incident caches after a mutation', async () => {
    const queryClient = new QueryClient();
    const publicOptions = resolvedIncidentsQueryOptions();
    const privateOptions = adminIncidentsQueryOptions('admin@example.com');

    await queryClient.ensureQueryData(publicOptions);
    await queryClient.ensureQueryData(privateOptions);
    await invalidateIncidentQueries(queryClient);

    expect(queryClient.getQueryState(publicOptions.queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(privateOptions.queryKey)?.isInvalidated).toBe(true);
  });
});
