import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import { CREATE_INCIDENT_PATH, createIncident } from './create-incident';

const request = {
  adres_zgloszenia: 'ul. Testowa 12',
  latitude: null,
  longitude: null,
  mail_zglaszajacego: 'resident@example.com',
  opis_zgloszenia: 'Uszkodzona nawierzchnia',
  typ_sluzby: 'roads',
  zdjecie_incydentu_zglaszanego_upload_id: null,
} as const;

const response = {
  classification: {
    classification: 'unknown',
    modelAvailable: false,
    reason: 'disabled',
    serviceKey: 'roads',
    source: 'fallback',
  },
  incydent: {
    adres_zgloszenia: request.adres_zgloszenia,
    data_rozwiazania: null,
    data_zgloszenia: '2026-08-20',
    godzina_rozwiazania: null,
    godzina_zgloszenia: '12:00:00',
    id_zgloszenia: '00000000-0000-4000-8000-000000000034',
    latitude: null,
    llm_classification: 'unknown',
    llm_model_available: false,
    llm_odpowiedz: null,
    llm_reason: 'disabled',
    llm_source: 'fallback',
    longitude: null,
    mail_zglaszajacego: request.mail_zglaszajacego,
    opis_zgloszenia: request.opis_zgloszenia,
    reporter_user_id: null,
    sprawdzenie_incydentu: false,
    status_incydentu: 'reported',
    typ_sluzby: 'roads',
    zdjecie_incydentu_rozwiazanego: null,
    zdjecie_incydentu_zglaszanego: null,
  },
  success: true,
} as const;

describe('create incident API', () => {
  test('posts the normalized contract and parses the response', async () => {
    const fetcher = vi.fn(async () => Response.json(response, { status: 201 }));
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await expect(createIncident({ client, request })).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(`https://city.example${CREATE_INCIDENT_PATH}`),
      expect.objectContaining({
        body: JSON.stringify(request),
        method: 'POST',
      }),
    );
  });

  test('rejects malformed create responses before they reach the screen', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json({ ...response, success: false }),
      origin: 'https://city.example',
    });

    await expect(createIncident({ client, request })).rejects.toMatchObject({ kind: 'contract' });
  });

  test('preserves rate-limit status for presentation logic', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json({ error: 'rate_limited' }, { status: 429 }),
      origin: 'https://city.example',
    });

    await expect(createIncident({ client, request })).rejects.toMatchObject({
      kind: 'http',
      status: 429,
    });
  });
});
