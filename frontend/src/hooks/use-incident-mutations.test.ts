import type { CurrentDatabaseIncidentDto } from '@zglosto/contracts';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../config/services', () => ({ normalizeServiceKey: (key: string) => key }));
vi.mock('../lib/incident-status', () => ({ toIncidentDisplayStatus: (status: string) => status }));

import { fetchServiceIncidents, updateUserPermissions } from '../services/api';
import type { ServiceIncident } from '../types/incident';
import { saveAdminIncidentStatus, saveServiceIncident } from './use-incident-mutations';

const incident: ServiceIncident = {
  id: 'report-1',
  revision: 7,
  service: 'roads',
  description: 'Damaged road surface',
  address: 'Rynek 1',
  latitude: null,
  longitude: null,
  email: 'resident@example.test',
  imageUrl: null,
  resolvedImageUrl: null,
  status: 'pending',
  checked: false,
  adminStatus: 'reported',
  createdAt: '02.11.2026 09:00:00',
  resolvedAt: null,
};

const updatedIncident: CurrentDatabaseIncidentDto = {
  id_zgloszenia: incident.id,
  data_zgloszenia: '2026-11-02',
  godzina_zgloszenia: '09:00:00',
  opis_zgloszenia: incident.description,
  mail_zglaszajacego: incident.email,
  reporter_user_id: null,
  adres_zgloszenia: incident.address,
  latitude: null,
  longitude: null,
  zdjecie_incydentu_zglaszanego: null,
  zdjecie_incydentu_rozwiazanego: null,
  sprawdzenie_incydentu: false,
  status_incydentu: 'resolved',
  typ_sluzby: 'roads',
  llm_odpowiedz: null,
  llm_classification: 'municipal',
  llm_model_available: true,
  llm_source: 'model',
  llm_reason: null,
  data_rozwiazania: '2026-11-03',
  godzina_rozwiazania: '11:00:00',
};
const changes = { checked: true, adminStatus: 'resolved', resolvedImageFile: null } as const;

function stubFetch() {
  const mockFetch = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

afterEach(() => vi.unstubAllGlobals());

it('keeps the service revision returned by the list contract', async () => {
  const {
    data_zgloszenia: _data_zgloszenia,
    godzina_zgloszenia: _godzina_zgloszenia,
    data_rozwiazania: _data_rozwiazania,
    godzina_rozwiazania: _godzina_rozwiazania,
    reporter_user_id: _reporter_user_id,
    ...listFields
  } = updatedIncident;
  const fetch = stubFetch().mockResolvedValueOnce(
    Response.json([
      {
        ...listFields,
        data_godzina_zgloszenia: incident.createdAt,
        data_godzina_rozwiazania: null,
        revision: 7,
      },
    ]),
  );

  await expect(fetchServiceIncidents()).resolves.toEqual([
    expect.objectContaining({ revision: 7 }),
  ]);
  expect(fetch).toHaveBeenCalledWith('/api/sluzby/incydenty', {
    signal: null,
    credentials: 'include',
  });
});

it('uses the returned revision in the next PATCH instead of guessing it', async () => {
  const fetch = stubFetch()
    .mockResolvedValueOnce(
      Response.json({ success: true, incydent: updatedIncident, revision: 12 }),
    )
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        incydent: { ...updatedIncident, sprawdzenie_incydentu: true },
        revision: 13,
      }),
    );

  await saveServiceIncident(incident, changes);

  expect(fetch).toHaveBeenNthCalledWith(
    1,
    '/api/sluzby/incydenty/report-1/sprawdzenie',
    expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'If-Match': '"incident-7"' }),
    }),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    '/api/sluzby/incydenty/report-1/status',
    expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'If-Match': '"incident-12"' }),
    }),
  );
});

it('can finish resolving a report after verification succeeded and status failed', async () => {
  const verified = { ...incident, checked: true, revision: 8 };
  const fetch = stubFetch()
    .mockResolvedValueOnce(Response.json({ success: true, incydent: updatedIncident, revision: 8 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({ success: true, incydent: updatedIncident, revision: 9 }),
    );

  await expect(saveServiceIncident(incident, changes)).rejects.toMatchObject({ status: 503 });
  await expect(saveServiceIncident(verified, changes)).resolves.toBeUndefined();

  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/sluzby/incydenty/report-1/sprawdzenie',
    '/api/sluzby/incydenty/report-1/status',
    '/api/sluzby/incydenty/report-1/status',
  ]);
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/sluzby/incydenty/report-1/status',
    expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"incident-8"' }) }),
  );
});

it('stops on a revision conflict without attaching a staged photo', async () => {
  const uploadUrl = 'https://storage.example.test/resolution.jpg';
  const fetch = stubFetch()
    .mockResolvedValueOnce(
      Response.json({
        expiresAt: '2026-11-24T20:30:00Z',
        headers: {},
        method: 'PUT',
        uploadId: '123e4567-e89b-42d3-a456-426614174000',
        uploadUrl,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(Response.json({ success: true, incydent: updatedIncident, revision: 8 }))
    .mockResolvedValueOnce(new Response(null, { status: 409 }));
  const file = new File(['photo'], 'image.jpg', { type: 'image/jpeg' });

  await expect(
    saveServiceIncident(incident, { ...changes, resolvedImageFile: file }),
  ).rejects.toMatchObject({ status: 409 });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/sluzby/incydenty/report-1/obrazy/uploads',
    uploadUrl,
    '/api/sluzby/incydenty/report-1/sprawdzenie',
    '/api/sluzby/incydenty/report-1/status',
  ]);
});

it('uploads the photo to staging before changing status or verification', async () => {
  const fetch = stubFetch().mockResolvedValueOnce(new Response(null, { status: 503 }));
  const file = new File(['photo'], 'image.jpg', { type: 'image/jpeg' });

  await expect(
    saveServiceIncident(incident, { ...changes, resolvedImageFile: file }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    '/api/sluzby/incydenty/report-1/obrazy/uploads',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  );
});

it.each(['admin', 'sluzby'])(
  'skips status PATCH for verification-only edits in %s',
  async (panel) => {
    const fetch = stubFetch().mockResolvedValueOnce(
      Response.json({ success: true, incydent: updatedIncident, revision: 8 }),
    );
    const resolved = { ...incident, adminStatus: 'resolved' } as const;
    const save = panel === 'admin' ? saveAdminIncidentStatus : saveServiceIncident;

    await save(resolved, changes);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `/api/${panel}/incydenty/report-1/sprawdzenie`,
      expect.objectContaining({ body: '{"sprawdzenie_incydentu":true}' }),
    );
  },
);

it('saves the service role and its service key in one request', async () => {
  const fetch = stubFetch().mockResolvedValueOnce(new Response(null, { status: 204 }));

  await expect(updateUserPermissions(incident.email, 'sluzby', null)).rejects.toThrow();
  await updateUserPermissions(incident.email, 'sluzby', 'roads');

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    '/api/admin/uzytkownicy/service-key',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ email: incident.email, uprawnienia: 'sluzby', serviceKey: 'roads' }),
    }),
  );
});
