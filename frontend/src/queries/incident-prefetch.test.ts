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

vi.mock('../app/route-views', () => ({ HomeRouteView: vi.fn() }));

import { Route as homeRoute } from '../routes/_app.index';
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
  apiMocks.fetchAllIncidents.mockResolvedValue({ items: [privateIncident], nextCursor: null });
  apiMocks.fetchResolvedIncidents.mockResolvedValue([resolvedIncident]);
  apiMocks.fetchServiceIncidents.mockResolvedValue({
    items: [{ ...privateIncident, revision: 7 }],
    nextCursor: null,
  });
  apiMocks.fetchUserIncidents.mockResolvedValue({ items: [privateIncident], nextCursor: null });
});

describe('incident route prefetching', () => {
  it('reuses public data ensured by the loader without a duplicate request', async () => {
    const queryClient = createAppQueryClient();
    const loaderOptions = resolvedIncidentsQueryOptions();

    await queryClient.prefetchQuery(loaderOptions);
    const componentData = await queryClient.fetchQuery(resolvedIncidentsQueryOptions());

    expect(componentData).toEqual(queryClient.getQueryData(loaderOptions.queryKey));
    expect(apiMocks.fetchResolvedIncidents).toHaveBeenCalledTimes(1);
  });

  it('leaves public list errors in the query cache so the route can render', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiMocks.fetchResolvedIncidents.mockRejectedValueOnce(new Error('Service unavailable'));

    const loader = homeRoute.options.loader;
    if (typeof loader !== 'function') throw new Error('Missing home loader');
    const context = { queryClient } as Parameters<typeof loader>[0]['context'];
    expect(loader({ context } as Parameters<typeof loader>[0])).toBeUndefined();
    await queryClient.prefetchQuery(resolvedIncidentsQueryOptions());
    expect(queryClient.getQueryState(incidentQueryKeys.resolved())?.status).toBe('error');
  });

  it('preserves the API order for public and admin dates in DD.MM.YYYY format', async () => {
    const queryClient = createAppQueryClient();
    const ids = ['first', 'second'];
    const dates = ['02.11.2026 09:00:00', '03.10.2026 09:00:00'];
    apiMocks.fetchResolvedIncidents.mockResolvedValueOnce(
      ids.map((id, index) => ({
        ...resolvedIncident,
        id_zgloszenia: id,
        data_godzina_rozwiazania: dates[index],
      })),
    );
    apiMocks.fetchAllIncidents.mockResolvedValueOnce({
      items: ids.map((id, index) => ({
        ...privateIncident,
        id_zgloszenia: id,
        data_godzina_zgloszenia: dates[index],
      })),
      nextCursor: null,
    });

    const resolved = await queryClient.fetchQuery(resolvedIncidentsQueryOptions());
    const admin = await queryClient.fetchInfiniteQuery(
      adminIncidentsQueryOptions('admin@example.com'),
    );
    expect(resolved.map(({ id }) => id)).toEqual(ids);
    expect(admin.pages[0]?.items.map(({ id }) => id)).toEqual(ids);
  });

  it('keeps private cache entries isolated between session owners', async () => {
    const queryClient = createAppQueryClient();

    await queryClient.ensureInfiniteQueryData(residentIncidentsQueryOptions('first@example.com'));
    await queryClient.ensureInfiniteQueryData(residentIncidentsQueryOptions('second@example.com'));

    expect(apiMocks.fetchUserIncidents).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(incidentQueryKeys.resident('first@example.com'))).toBeDefined();
    expect(
      queryClient.getQueryData(incidentQueryKeys.resident('second@example.com')),
    ).toBeDefined();
  });

  it('uses the expected private endpoint for every dashboard role', async () => {
    const queryClient = createAppQueryClient();

    await queryClient.ensureInfiniteQueryData(adminIncidentsQueryOptions('admin@example.com'));
    const service = await queryClient.ensureInfiniteQueryData(
      serviceIncidentsQueryOptions('service@example.com'),
    );
    expect(service.pages[0]?.items[0]?.revision).toBe(7);
    await queryClient.ensureInfiniteQueryData(
      residentIncidentsQueryOptions('resident@example.com'),
    );

    expect(apiMocks.fetchAllIncidents).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchServiceIncidents).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchUserIncidents).toHaveBeenCalledTimes(1);
  });

  it('invalidates public and private incident caches after a mutation', async () => {
    const queryClient = new QueryClient();
    const publicOptions = resolvedIncidentsQueryOptions();
    const privateOptions = adminIncidentsQueryOptions('admin@example.com');

    await queryClient.ensureQueryData(publicOptions);
    await queryClient.ensureInfiniteQueryData(privateOptions);
    await invalidateIncidentQueries(queryClient);

    expect(queryClient.getQueryState(publicOptions.queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(privateOptions.queryKey)?.isInvalidated).toBe(true);
  });
});
