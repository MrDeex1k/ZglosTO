// oxlint-disable-next-line import/no-unassigned-import -- Module metadata requires reflect-metadata.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  StructuredApiErrorResponseSchema,
  type CurrentCreateIncidentResponse,
  type CurrentDatabaseIncidentDto,
  type ServiceIncidentListItemDto,
  type UserRole,
  type VerifiedAuthSession,
} from '@zglosto/contracts';
import { ExpressAdapter } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.ts';
import {
  AuthorizationSessionVerifier,
  InvalidAuthorizationSessionError,
} from './modules/auth-bridge/authorization.gateway.ts';
import {
  IncidentDomainPort,
  PendingIncidentInfrastructureAdapter,
} from './modules/incidents/incident-domain.port.ts';
import { PublicResolvedIncidentCache } from './modules/incidents/public-resolved-incident-cache.ts';

const incident: CurrentDatabaseIncidentDto = {
  id_zgloszenia: 'incident-1',
  data_zgloszenia: '2026-07-20',
  godzina_zgloszenia: '12:00:00',
  opis_zgloszenia: 'Dziura w drodze',
  mail_zglaszajacego: 'resident@example.com',
  reporter_user_id: 'resident-1',
  adres_zgloszenia: 'ul. Testowa 1',
  latitude: null,
  longitude: null,
  zdjecie_incydentu_zglaszanego: null,
  zdjecie_incydentu_rozwiazanego: null,
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  typ_sluzby: 'roads',
  llm_odpowiedz: null,
  llm_classification: 'unknown',
  llm_model_available: false,
  llm_source: 'fallback',
  llm_reason: 'unavailable',
  data_rozwiazania: null,
  godzina_rozwiazania: null,
};

const createdIncident: CurrentCreateIncidentResponse = {
  success: true,
  incydent: incident,
  classification: {
    classification: 'unknown',
    serviceKey: 'roads',
    modelAvailable: false,
    source: 'fallback',
    reason: 'unavailable',
  },
};

function serviceIncident(
  id: string,
  serviceKey: string,
  revision: number,
): ServiceIncidentListItemDto {
  return {
    id_zgloszenia: id,
    opis_zgloszenia: 'Scoped incident',
    mail_zglaszajacego: 'resident@example.com',
    adres_zgloszenia: 'ul. Testowa 1',
    latitude: null,
    longitude: null,
    zdjecie_incydentu_zglaszanego: null,
    zdjecie_incydentu_rozwiazanego: null,
    sprawdzenie_incydentu: false,
    status_incydentu: 'reported',
    typ_sluzby: serviceKey,
    llm_odpowiedz: null,
    llm_classification: 'unknown',
    llm_model_available: false,
    llm_source: 'fallback',
    llm_reason: 'unavailable',
    data_godzina_zgloszenia: '21.08.2026 12:00',
    data_godzina_rozwiazania: null,
    revision,
  };
}

function session(role: UserRole, serviceKey: string | null = null): VerifiedAuthSession {
  return {
    success: true,
    user: {
      id: `${role}-1`,
      email: role === 'mieszkaniec' ? 'resident@example.com' : `${role}@example.com`,
      name: null,
      emailVerified: true,
      image: null,
      uprawnienia: role,
      serviceKey,
    },
    session: { id: `${role}-session` },
  };
}

function authVerifier(): AuthorizationSessionVerifier {
  return {
    verifySession: vi.fn(async (cookie: string) => {
      if (cookie.includes('mieszkaniec')) return session('mieszkaniec');
      if (cookie.includes('sluzby-other')) return session('sluzby', 'other');
      if (cookie.includes('sluzby')) return session('sluzby', 'roads');
      if (cookie.includes('admin')) return session('admin');
      throw new InvalidAuthorizationSessionError();
    }),
  };
}

function configurePort(): PendingIncidentInfrastructureAdapter {
  const port = new PendingIncidentInfrastructureAdapter();
  vi.spyOn(port, 'claimAnonymousIncidents').mockResolvedValue();
  vi.spyOn(port, 'createIncident').mockResolvedValue(createdIncident);
  vi.spyOn(port, 'listAdminIncidents').mockResolvedValue([]);
  vi.spyOn(port, 'listAdminStatistics').mockResolvedValue([]);
  vi.spyOn(port, 'listResidentIncidents').mockResolvedValue([]);
  vi.spyOn(port, 'listResolvedIncidents').mockResolvedValue([]);
  vi.spyOn(port, 'listServiceIncidents').mockResolvedValue([]);
  vi.spyOn(port, 'listServiceStatistics').mockResolvedValue([]);
  vi.spyOn(port, 'updateAdminIncidentService').mockResolvedValue(incident);
  vi.spyOn(port, 'updateAdminIncidentStatus').mockResolvedValue(incident);
  vi.spyOn(port, 'updateAdminIncidentVerification').mockResolvedValue(incident);
  const versionedIncident = { kind: 'updated', value: { incident, revision: 2 } } as const;
  vi.spyOn(port, 'updateServiceIncidentService').mockResolvedValue(versionedIncident);
  vi.spyOn(port, 'updateServiceIncidentStatus').mockResolvedValue(versionedIncident);
  vi.spyOn(port, 'updateServiceIncidentVerification').mockResolvedValue(versionedIncident);
  vi.spyOn(port, 'updateUserPermissions').mockResolvedValue({
    id_uzytkownika: 'service-1',
    uprawnienia: 'sluzby',
    serviceKey: 'roads',
  });
  vi.spyOn(port, 'uploadResolutionImage').mockResolvedValue(incident);
  return port;
}

interface RequestOptions {
  body: unknown | null;
  cookie: string | null;
  headers?: Readonly<Record<string, string>>;
  method: 'GET' | 'PATCH' | 'POST';
}

async function apiRequest(
  baseUrl: string,
  path: string,
  options: RequestOptions,
): Promise<Response> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  if (options.cookie !== null) headers.set('Cookie', options.cookie);
  const init: RequestInit = { headers, method: options.method };
  if (options.body !== null) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }
  return fetch(`${baseUrl}${path}`, init);
}

const cookie = (role: UserRole): string => `better-auth.session_token=${role}`;
let application: INestApplication;
let baseUrl: string;
let port: PendingIncidentInfrastructureAdapter;
const publicResolvedIncidentCache = {
  invalidate: vi.fn(async () => {}),
  list: vi.fn(async (loader: () => Promise<readonly unknown[]>): Promise<readonly unknown[]> =>
    loader(),
  ),
};

beforeAll(async () => {
  port = configurePort();
  const moduleReference = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IncidentDomainPort)
    .useValue(port)
    .overrideProvider(AuthorizationSessionVerifier)
    .useValue(authVerifier())
    .overrideProvider(PublicResolvedIncidentCache)
    .useValue(publicResolvedIncidentCache)
    .compile();
  application = moduleReference.createNestApplication(new ExpressAdapter(), { logger: false });
  await application.listen(0, '127.0.0.1');
  baseUrl = await application.getUrl();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await application.close();
});

describe('NestJS domain controllers', () => {
  it('implements the three resident routes and normalized create command', async () => {
    const own = await apiRequest(baseUrl, '/mieszkaniec/incydenty', {
      body: null,
      cookie: cookie('mieszkaniec'),
      method: 'GET',
    });
    const resolved = await apiRequest(baseUrl, '/mieszkaniec/incydenty/glowna', {
      body: null,
      cookie: null,
      method: 'GET',
    });
    const created = await apiRequest(baseUrl, '/mieszkaniec/incydenty', {
      body: {
        opis_zgloszenia: '  Dziura w drodze  ',
        mail_zglaszajacego: 'RESIDENT@example.com',
        adres_zgloszenia: '  ul. Testowa 1  ',
        typ_sluzby: 'roads',
      },
      cookie: null,
      method: 'POST',
    });

    expect(own.status).toBe(200);
    expect(await own.json()).toEqual([]);
    expect(port.claimAnonymousIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mieszkaniec-1' }),
    );
    expect(port.listResidentIncidents).toHaveBeenCalledWith('mieszkaniec-1');
    expect(resolved.status).toBe(200);
    expect(resolved.headers.get('x-accel-expires')).toBe('900');
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(createdIncident);
    expect(port.createIncident).toHaveBeenCalledWith({
      address: 'ul. Testowa 1',
      description: 'Dziura w drodze',
      imageUploadId: null,
      latitude: null,
      longitude: null,
      reporterEmail: 'resident@example.com',
      reporterUserId: null,
      requestedServiceKey: 'roads',
    });
  });

  it('implements all six service routes with an isolated serviceKey', async () => {
    const serviceCookie = cookie('sluzby');
    const [list, statistics, status, verification, targetService, resolutionImage] =
      await Promise.all([
        apiRequest(baseUrl, '/sluzby/incydenty', {
          body: null,
          cookie: serviceCookie,
          method: 'GET',
        }),
        apiRequest(baseUrl, '/sluzby/statystyki', {
          body: null,
          cookie: serviceCookie,
          method: 'GET',
        }),
        apiRequest(baseUrl, '/sluzby/incydenty/incident-1/status', {
          body: { status_incydentu: 'resolved' },
          cookie: serviceCookie,
          headers: { 'If-Match': '"incident-1"' },
          method: 'PATCH',
        }),
        apiRequest(baseUrl, '/sluzby/incydenty/incident-1/sprawdzenie', {
          body: { sprawdzenie_incydentu: true },
          cookie: serviceCookie,
          headers: { 'If-Match': '"incident-1"' },
          method: 'PATCH',
        }),
        apiRequest(baseUrl, '/sluzby/incydenty/incident-1/typ', {
          body: { typ_sluzby: 'other' },
          cookie: serviceCookie,
          headers: { 'If-Match': '"incident-1"' },
          method: 'PATCH',
        }),
        apiRequest(baseUrl, '/sluzby/incydenty/incident-1/zdjecie_rozwiazane', {
          body: { uploadId: '00000000-0000-4000-8000-000000000001' },
          cookie: serviceCookie,
          method: 'POST',
        }),
      ]);

    expect([list.status, statistics.status, status.status, verification.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(targetService.status).toBe(200);
    expect(resolutionImage.status).toBe(200);
    expect(port.listServiceIncidents).toHaveBeenCalledWith('roads');
    expect(port.listServiceStatistics).toHaveBeenCalledWith('roads');
    expect(port.updateServiceIncidentStatus).toHaveBeenCalledWith(
      'incident-1',
      'roads',
      'resolved',
      1,
    );
    expect(port.updateServiceIncidentVerification).toHaveBeenCalledWith(
      'incident-1',
      'roads',
      true,
      1,
    );
    expect(port.updateServiceIncidentService).toHaveBeenCalledWith(
      'incident-1',
      'roads',
      'other',
      1,
    );
    expect(port.uploadResolutionImage).toHaveBeenCalledWith(
      'incident-1',
      'roads',
      '00000000-0000-4000-8000-000000000001',
    );
    expect(publicResolvedIncidentCache.invalidate).toHaveBeenCalledTimes(3);
  });

  it('isolates two service scopes and returns a typed conflict for a stale revision', async () => {
    vi.mocked(port.listServiceIncidents).mockImplementation(async (serviceKey) =>
      serviceKey === 'roads'
        ? [serviceIncident('roads-only', 'roads', 3)]
        : [serviceIncident('other-only', 'other', 7)],
    );
    const roads = await apiRequest(baseUrl, '/sluzby/incydenty', {
      body: null,
      cookie: cookie('sluzby'),
      method: 'GET',
    });
    const otherCookie = 'better-auth.session_token=sluzby-other';
    const list = await apiRequest(baseUrl, '/sluzby/incydenty', {
      body: null,
      cookie: otherCookie,
      method: 'GET',
    });
    expect(await roads.json()).toEqual([serviceIncident('roads-only', 'roads', 3)]);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([serviceIncident('other-only', 'other', 7)]);
    expect(port.listServiceIncidents).toHaveBeenCalledWith('other');

    vi.mocked(port.updateServiceIncidentStatus).mockResolvedValueOnce({ kind: 'conflict' });
    const stale = await apiRequest(baseUrl, '/sluzby/incydenty/incident-1/status', {
      body: { status_incydentu: 'resolved' },
      cookie: otherCookie,
      headers: { 'If-Match': '"incident-7"' },
      method: 'PATCH',
    });
    expect(stale.status).toBe(409);
    expect(StructuredApiErrorResponseSchema.parse(await stale.json()).errorCode).toBe('CONFLICT');
    expect(port.updateServiceIncidentStatus).toHaveBeenCalledWith(
      'incident-1',
      'other',
      'resolved',
      7,
    );

    const missingPrecondition = await apiRequest(baseUrl, '/sluzby/incydenty/incident-1/status', {
      body: { status_incydentu: 'resolved' },
      cookie: otherCookie,
      method: 'PATCH',
    });
    expect(missingPrecondition.status).toBe(400);
  });

  it('implements all six admin routes and validates service assignments', async () => {
    const adminCookie = cookie('admin');
    const [statistics, list, verification, targetService, status, permissions] = await Promise.all([
      apiRequest(baseUrl, '/admin/statystyki', {
        body: null,
        cookie: adminCookie,
        method: 'GET',
      }),
      apiRequest(baseUrl, '/admin/incydenty', {
        body: null,
        cookie: adminCookie,
        method: 'GET',
      }),
      apiRequest(baseUrl, '/admin/incydenty/incident-1/sprawdzenie', {
        body: { sprawdzenie_incydentu: true },
        cookie: adminCookie,
        method: 'PATCH',
      }),
      apiRequest(baseUrl, '/admin/incydenty/incident-1/typ', {
        body: { typ_sluzby: 'other' },
        cookie: adminCookie,
        method: 'PATCH',
      }),
      apiRequest(baseUrl, '/admin/incydenty/incident-1/status', {
        body: { status_incydentu: 'in_progress' },
        cookie: adminCookie,
        method: 'PATCH',
      }),
      apiRequest(baseUrl, '/admin/uzytkownicy/service-key', {
        body: {
          email: 'SERVICE@example.com',
          uprawnienia: 'sluzby',
          serviceKey: 'roads',
        },
        cookie: adminCookie,
        method: 'PATCH',
      }),
    ]);

    expect([
      statistics.status,
      list.status,
      verification.status,
      targetService.status,
      status.status,
      permissions.status,
    ]).toEqual([200, 200, 200, 200, 200, 200]);
    expect(port.updateAdminIncidentVerification).toHaveBeenCalledWith('incident-1', true);
    expect(port.updateAdminIncidentService).toHaveBeenCalledWith('incident-1', 'other');
    expect(port.updateAdminIncidentStatus).toHaveBeenCalledWith('incident-1', 'in_progress');
    expect(port.updateUserPermissions).toHaveBeenCalledWith({
      email: 'service@example.com',
      role: 'sluzby',
      serviceKey: 'roads',
    });
    expect(publicResolvedIncidentCache.invalidate).toHaveBeenCalledTimes(2);
  });

  it('maps invalid input, missing resources and an unbound infrastructure port safely', async () => {
    const invalid = await apiRequest(baseUrl, '/sluzby/incydenty/incident-1/status', {
      body: { status_incydentu: 'legacy' },
      cookie: cookie('sluzby'),
      method: 'PATCH',
    });
    expect(invalid.status).toBe(400);
    expect(StructuredApiErrorResponseSchema.parse(await invalid.json()).errorCode).toBe(
      'VALIDATION_FAILED',
    );

    vi.mocked(port.updateAdminIncidentStatus).mockResolvedValueOnce(null);
    const missing = await apiRequest(baseUrl, '/admin/incydenty/missing/status', {
      body: { status_incydentu: 'reported' },
      cookie: cookie('admin'),
      method: 'PATCH',
    });
    expect(missing.status).toBe(404);
    expect(StructuredApiErrorResponseSchema.parse(await missing.json()).errorCode).toBe(
      'NOT_FOUND',
    );

    await expect(
      new PendingIncidentInfrastructureAdapter().listAdminIncidents(),
    ).rejects.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE', statusCode: 503 });
  });
});
