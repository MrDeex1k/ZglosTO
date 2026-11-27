import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import type { CurrentIncidentListItemDto, CurrentResolvedIncidentDto } from '@zglosto/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/services', () => ({
  normalizeServiceKey: (serviceKey: string) => serviceKey,
}));
vi.mock('../lib/incident-status', () => ({
  toIncidentDisplayStatus: (status: string) =>
    status === 'in_progress' ? 'in-progress' : status === 'reported' ? 'pending' : 'resolved',
}));

import { createAppQueryClient } from '../lib/query-client';
import type { Incident } from '../types/incident';
import {
  adminIncidentsQueryOptions,
  residentIncidentsQueryOptions,
  resolvedIncidentsQueryOptions,
  serviceIncidentsQueryOptions,
  incidentQueryKeys,
  mapIncident,
  mapResolvedIncident,
  updateIncidentCache,
} from './incidents';

const incident: Incident = {
  id: 'incident-1',
  service: 'roads',
  description: 'Uszkodzona nawierzchnia',
  address: 'Rynek 1',
  latitude: 52,
  longitude: 21,
  email: 'resident@example.com',
  imageUrl: null,
  resolvedImageUrl: null,
  status: 'pending',
  checked: false,
  adminStatus: 'reported',
  createdAt: '2026-07-24T10:00:00.000Z',
  resolvedAt: null,
};

describe('incident query keys', () => {
  it('separates public and private cache namespaces', () => {
    expect(incidentQueryKeys.resolved()).toEqual(['incidents', 'public', 'resolved']);
    expect(incidentQueryKeys.private).toEqual(['incidents', 'private']);
  });

  it('scopes private data to the session owner', () => {
    expect(incidentQueryKeys.resident('one@example.com')).not.toEqual(
      incidentQueryKeys.resident('two@example.com'),
    );
  });
});

describe('incident cache updates', () => {
  it('updates the matching incident without replacing the remaining list', () => {
    const queryClient = new QueryClient();
    const queryKey = incidentQueryKeys.service('service@example.com');
    queryClient.setQueryData(queryKey, {
      pages: [{ items: [incident, { ...incident, id: 'incident-2' }], nextCursor: 'next' }],
      pageParams: [null],
    });

    updateIncidentCache(queryClient, queryKey, incident.id, (current) => ({
      ...current,
      checked: true,
    }));

    expect(queryClient.getQueryData(queryKey)).toEqual({
      pages: [
        {
          items: [
            { ...incident, checked: true },
            { ...incident, id: 'incident-2' },
          ],
          nextCursor: 'next',
        },
      ],
      pageParams: [null],
    });
  });

  it('does not create placeholder data for a cache that was never fetched', () => {
    const queryClient = new QueryClient();
    const queryKey = incidentQueryKeys.admin('admin@example.com');

    updateIncidentCache(queryClient, queryKey, incident.id, (current) => ({
      ...current,
      checked: true,
    }));

    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });
});

describe('incident DTO mapping', () => {
  it('maps a private incident into the frontend model', () => {
    const dto: CurrentIncidentListItemDto = {
      id_zgloszenia: incident.id,
      opis_zgloszenia: incident.description,
      mail_zglaszajacego: incident.email,
      adres_zgloszenia: incident.address,
      latitude: incident.latitude,
      longitude: incident.longitude,
      zdjecie_incydentu_zglaszanego: null,
      zdjecie_incydentu_rozwiazanego: null,
      sprawdzenie_incydentu: true,
      status_incydentu: 'in_progress',
      typ_sluzby: incident.service,
      llm_odpowiedz: null,
      llm_classification: 'municipal',
      llm_model_available: true,
      llm_source: 'model',
      llm_reason: null,
      data_godzina_zgloszenia: incident.createdAt,
      data_godzina_rozwiazania: null,
    };

    expect(mapIncident(dto)).toMatchObject({
      id: incident.id,
      email: incident.email,
      checked: true,
      adminStatus: 'in_progress',
      status: 'in-progress',
    });
  });

  it('maps a public resolved incident without exposing reporter data', () => {
    const dto: CurrentResolvedIncidentDto = {
      id_zgloszenia: incident.id,
      opis_zgloszenia: incident.description,
      adres_zgloszenia: incident.address,
      latitude: incident.latitude,
      longitude: incident.longitude,
      typ_sluzby: incident.service,
      status_incydentu: 'resolved',
      zdjecie_incydentu_rozwiazanego: null,
      data_godzina_zgloszenia: incident.createdAt,
      data_godzina_rozwiazania: '2026-07-24T11:00:00.000Z',
    };

    expect(mapResolvedIncident(dto)).toMatchObject({
      id: incident.id,
      email: '',
      status: 'resolved',
      checked: true,
    });
  });
});

describe('application QueryClient', () => {
  it('uses bounded cache time and does not retry mutations by default', () => {
    const queryClient = createAppQueryClient();

    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(600_000);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('query cancellation reaches the HTTP request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    {
      queryKey: incidentQueryKeys.resolved(),
      start: (client: QueryClient) => client.fetchQuery(resolvedIncidentsQueryOptions()),
    },
    {
      queryKey: incidentQueryKeys.resident('resident@example.com'),
      start: (client: QueryClient) =>
        client.fetchInfiniteQuery(residentIncidentsQueryOptions('resident@example.com')),
    },
    {
      queryKey: incidentQueryKeys.admin('admin@example.com'),
      start: (client: QueryClient) =>
        client.fetchInfiniteQuery(adminIncidentsQueryOptions('admin@example.com')),
    },
    {
      queryKey: incidentQueryKeys.service('service@example.com'),
      start: (client: QueryClient) =>
        client.fetchInfiniteQuery(serviceIncidentsQueryOptions('service@example.com')),
    },
  ])('aborts $queryKey without leaving cached data', async (options) => {
    const client = createAppQueryClient();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: RequestInit) => {
        requestSignal = init.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );
    const request = options.start(client);
    const assertion = expect(request).rejects.toThrow();
    await client.cancelQueries({ queryKey: options.queryKey });
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    client.clear();
  });
});

// A reassignment must not display the previous municipal service's cached queue.
it('isolates cached queues after a service reassignment for the same account', () => {
  const client = createAppQueryClient();
  const oldScope = serviceIncidentsQueryOptions('worker@example.test', 'roads');
  const newScope = serviceIncidentsQueryOptions('worker@example.test', 'water');
  const serviceIncident = { ...incident, revision: 1 };
  const cached = { pages: [{ items: [serviceIncident], nextCursor: null }], pageParams: [null] };
  client.setQueryData(oldScope.queryKey, cached);
  expect(client.getQueryData(newScope.queryKey)).toBeUndefined();
  expect(client.getQueryData(oldScope.queryKey)).toEqual(cached);
  client.clear();
});

it('requests a second page only when asked and keeps its server filter', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ items: [], nextCursor: 'next' }))
    .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetch);
  const client = createAppQueryClient();
  const observer = new InfiniteQueryObserver(
    client,
    adminIncidentsQueryOptions('admin@example.com', { status: 'resolved' }),
  );

  try {
    await observer.refetch();
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const next = await observer.fetchNextPage();
    expect(next.data?.pages).toHaveLength(2);
    expect(next.hasNextPage).toBe(false);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/incydenty?limit=10&status=resolved',
      '/api/admin/incydenty?limit=10&cursor=next&status=resolved',
    ]);
  } finally {
    client.clear();
    vi.unstubAllGlobals();
  }
});
