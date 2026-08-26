import { QueryClient } from '@tanstack/react-query';
import type { CurrentIncidentListItemDto, CurrentResolvedIncidentDto } from '@zglosto/contracts';
import { describe, expect, it, vi } from 'vitest';

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
    queryClient.setQueryData(queryKey, [incident, { ...incident, id: 'incident-2' }]);

    updateIncidentCache(queryClient, queryKey, incident.id, (current) => ({
      ...current,
      checked: true,
    }));

    expect(queryClient.getQueryData<Incident[]>(queryKey)).toEqual([
      { ...incident, checked: true },
      { ...incident, id: 'incident-2' },
    ]);
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
