// oxlint-disable-next-line import/no-unassigned-import -- Module metadata requires reflect-metadata.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StructuredApiErrorResponseSchema, type VerifiedAuthSession } from '@zglosto/contracts';
import { ExpressAdapter } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.ts';
import {
  AuthorizationSessionVerifier,
  InvalidAuthorizationSessionError,
} from '../auth-bridge/authorization.gateway.ts';
import { DatabaseService } from '../database/database.service.ts';
import {
  IncidentDomainPort,
  PendingIncidentInfrastructureAdapter,
} from '../incidents/incident-domain.port.ts';
import { ObjectStorageService } from '../storage/object-storage.service.ts';

const IMAGE_ID = '019c0000-0000-7000-8000-000000000001';
const CHECKSUM = 'a'.repeat(64);
const IMAGE_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

const adminSession: VerifiedAuthSession = {
  success: true,
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: null,
    emailVerified: true,
    image: null,
    uprawnienia: 'admin',
    serviceKey: null,
  },
  session: { id: 'admin-session' },
};

let imageKind: 'report' | 'resolution' = 'resolution';
let incidentStatus: 'reported' | 'resolved' = 'resolved';
const databaseQuery = vi.fn(async () => ({
  rowCount: 1,
  rows: [
    {
      checksum: CHECKSUM,
      incident_status: incidentStatus,
      kind: imageKind,
      mime_type: 'image/png',
      object_key: 'incident/resolution/original.png',
      reporter_user_id: 'resident-1',
      service_key: 'roads',
    },
  ],
}));
const getObject = vi.fn(async () => ({
  body: IMAGE_BYTES,
  checksumSha256: CHECKSUM,
  contentType: 'image/png',
  objectKey: 'incident/resolution/original.png',
  sizeBytes: IMAGE_BYTES.byteLength,
}));

let application: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleReference = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IncidentDomainPort)
    .useValue(new PendingIncidentInfrastructureAdapter())
    .overrideProvider(DatabaseService)
    .useValue({ query: databaseQuery })
    .overrideProvider(ObjectStorageService)
    .useValue({ getObject })
    .overrideProvider(AuthorizationSessionVerifier)
    .useValue({
      verifySession: async (cookie: string) => {
        if (cookie.includes('admin')) return adminSession;
        throw new InvalidAuthorizationSessionError();
      },
    })
    .compile();
  application = moduleReference.createNestApplication(new ExpressAdapter(), { logger: false });
  await application.listen(0, '127.0.0.1');
  baseUrl = await application.getUrl();
});

beforeEach(() => {
  imageKind = 'resolution';
  incidentStatus = 'resolved';
  vi.clearAllMocks();
});

afterAll(async () => {
  await application.close();
});

describe('NestJS media HTTP', () => {
  it('serves a public resolved image with provider-neutral metadata and caching', async () => {
    const response = await fetch(`${baseUrl}/images/${IMAGE_ID}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, must-revalidate');
    expect(response.headers.get('etag')).toBe(`"sha256-${CHECKSUM}"`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(IMAGE_BYTES);
    expect(databaseQuery).toHaveBeenCalledWith(expect.stringContaining('incident_images'), [
      IMAGE_ID,
    ]);
    expect(getObject).toHaveBeenCalledWith('incident/resolution/original.png');
  });

  it('returns 304 without downloading the object again', async () => {
    const response = await fetch(`${baseUrl}/images/${IMAGE_ID}`, {
      headers: { 'If-None-Match': `"sha256-${CHECKSUM}"` },
    });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
    expect(getObject).not.toHaveBeenCalled();
  });

  it('protects private originals while allowing an administrator', async () => {
    imageKind = 'report';
    incidentStatus = 'reported';

    const anonymous = await fetch(`${baseUrl}/images/${IMAGE_ID}`);
    expect(anonymous.status).toBe(401);
    expect(StructuredApiErrorResponseSchema.parse(await anonymous.json())).toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });

    const admin = await fetch(`${baseUrl}/images/${IMAGE_ID}`, {
      headers: { Cookie: 'better-auth.session_token=admin' },
    });
    expect(admin.status).toBe(200);
    expect(admin.headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps malformed and unknown image identifiers indistinguishable', async () => {
    const response = await fetch(`${baseUrl}/images/not-a-uuid`);
    expect(response.status).toBe(404);
    expect(databaseQuery).not.toHaveBeenCalled();
  });
});
