import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import { loadResidentIncidents, RESIDENT_INCIDENTS_PATH } from './resident-incidents';

const incident = {
  adres_zgloszenia: 'ul. Testowa 12',
  data_godzina_rozwiazania: null,
  data_godzina_zgloszenia: '20.08.2026 10:15',
  id_zgloszenia: '00000000-0000-4000-8000-000000000032',
  latitude: null,
  llm_classification: 'unknown',
  llm_model_available: false,
  llm_odpowiedz: null,
  llm_reason: 'disabled',
  llm_source: 'fallback',
  longitude: null,
  mail_zglaszajacego: 'resident@example.com',
  opis_zgloszenia: 'Uszkodzona nawierzchnia',
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  typ_sluzby: 'roads',
  zdjecie_incydentu_rozwiazanego: null,
  zdjecie_incydentu_zglaszanego: null,
} as const;

describe('resident incidents API', () => {
  test('loads private history through the shared runtime parser', async () => {
    const fetcher = vi.fn(async () => Response.json([incident]));
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await expect(loadResidentIncidents({ client })).resolves.toEqual([incident]);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(`https://city.example${RESIDENT_INCIDENTS_PATH}`),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('rejects malformed private data before it reaches the screen', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json([{ ...incident, status_incydentu: 'unknown' }]),
      origin: 'https://city.example',
    });

    await expect(loadResidentIncidents({ client })).rejects.toMatchObject({ kind: 'contract' });
  });
});
