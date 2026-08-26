import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import { loadPublicIncidents, PUBLIC_INCIDENTS_PATH } from './public-incidents';

const incident = {
  id_zgloszenia: '00000000-0000-4000-8000-000000000031',
  opis_zgloszenia: 'Naprawiona nawierzchnia przy przejściu',
  adres_zgloszenia: 'ul. Testowa 31',
  latitude: 52.2297,
  longitude: 21.0122,
  typ_sluzby: 'roads',
  status_incydentu: 'resolved',
  zdjecie_incydentu_rozwiazanego: null,
  data_godzina_zgloszenia: '19.08.2026 08:15',
  data_godzina_rozwiazania: '20.08.2026 09:30',
} as const;

describe('public incidents API', () => {
  test('loads the public feed through the shared runtime parser', async () => {
    const fetcher = vi.fn(async () => Response.json([incident]));
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await expect(loadPublicIncidents({ client })).resolves.toEqual([incident]);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(`https://city.example${PUBLIC_INCIDENTS_PATH}`),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('rejects a malformed public incident without leaking it to the UI', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json([{ ...incident, adres_zgloszenia: undefined }]),
      origin: 'https://city.example',
    });

    await expect(loadPublicIncidents({ client })).rejects.toMatchObject({ kind: 'contract' });
  });
});
