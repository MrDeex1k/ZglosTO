import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import {
  loadServiceIncidents,
  loadServiceStatistics,
  SERVICE_INCIDENTS_PATH,
  SERVICE_STATISTICS_PATH,
  updateServiceIncidentStatus,
  updateServiceIncidentVerification,
} from './service-incidents';

const listIncident = {
  adres_zgloszenia: 'ul. Testowa 12',
  data_godzina_rozwiazania: null,
  data_godzina_zgloszenia: '20.08.2026 10:15',
  id_zgloszenia: '00000000-0000-4000-8000-000000000037',
  latitude: null,
  llm_classification: 'unknown',
  llm_model_available: false,
  llm_odpowiedz: null,
  llm_reason: 'disabled',
  llm_source: 'fallback',
  longitude: null,
  mail_zglaszajacego: 'resident@example.com',
  opis_zgloszenia: 'Uszkodzona nawierzchnia',
  revision: 7,
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  typ_sluzby: 'roads',
  zdjecie_incydentu_rozwiazanego: null,
  zdjecie_incydentu_zglaszanego: null,
} as const;

const databaseIncident = {
  adres_zgloszenia: listIncident.adres_zgloszenia,
  data_rozwiazania: null,
  data_zgloszenia: '2026-08-20',
  godzina_rozwiazania: null,
  godzina_zgloszenia: '10:15:00',
  id_zgloszenia: listIncident.id_zgloszenia,
  latitude: null,
  llm_classification: 'unknown',
  llm_model_available: false,
  llm_odpowiedz: null,
  llm_reason: 'disabled',
  llm_source: 'fallback',
  longitude: null,
  mail_zglaszajacego: listIncident.mail_zglaszajacego,
  opis_zgloszenia: listIncident.opis_zgloszenia,
  reporter_user_id: '00000000-0000-4000-8000-000000000038',
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  typ_sluzby: 'roads',
  zdjecie_incydentu_rozwiazanego: null,
  zdjecie_incydentu_zglaszanego: null,
} as const;

describe('service incidents API', () => {
  test('loads assigned incidents and statistics through shared schemas', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([listIncident]))
      .mockResolvedValueOnce(Response.json([{ liczba: 1, status_incydentu: 'reported' }]));
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await expect(loadServiceIncidents({ client })).resolves.toEqual([listIncident]);
    await expect(loadServiceStatistics({ client })).resolves.toEqual([
      { liczba: 1, status_incydentu: 'reported' },
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      new URL(`https://city.example${SERVICE_INCIDENTS_PATH}`),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL(`https://city.example${SERVICE_STATISTICS_PATH}`),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('updates status and verification using the scoped service endpoints', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ incydent: databaseIncident, revision: 8, success: true }),
    );
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await updateServiceIncidentStatus({
      client,
      incidentId: listIncident.id_zgloszenia,
      revision: 7,
      status: 'in_progress',
    });
    await updateServiceIncidentVerification({
      client,
      incidentId: listIncident.id_zgloszenia,
      revision: 8,
      verified: true,
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      new URL(`https://city.example${SERVICE_INCIDENTS_PATH}/${listIncident.id_zgloszenia}/status`),
      expect.objectContaining({
        body: JSON.stringify({ status_incydentu: 'in_progress' }),
        headers: expect.any(Headers),
        method: 'PATCH',
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL(
        `https://city.example${SERVICE_INCIDENTS_PATH}/${listIncident.id_zgloszenia}/sprawdzenie`,
      ),
      expect.objectContaining({
        body: JSON.stringify({ sprawdzenie_incydentu: true }),
        headers: expect.any(Headers),
        method: 'PATCH',
      }),
    );
    const firstHeaders = fetcher.mock.calls[0]?.[1]?.headers;
    const secondHeaders = fetcher.mock.calls[1]?.[1]?.headers;
    expect(new Headers(firstHeaders).get('If-Match')).toBe('"incident-7"');
    expect(new Headers(secondHeaders).get('If-Match')).toBe('"incident-8"');
  });

  test('rejects malformed service data', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json([{ ...listIncident, typ_sluzby: null }]),
      origin: 'https://city.example',
    });
    await expect(loadServiceIncidents({ client })).rejects.toMatchObject({ kind: 'contract' });
  });
});
