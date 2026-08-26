// oxlint-disable-next-line import/no-unassigned-import -- Module metadata requires reflect-metadata.
import 'reflect-metadata';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  BackendLivenessResponseSchema,
  BackendReadinessResponseSchema,
  publicCityConfigResponseSchema,
} from '@zglosto/contracts';
import { loadWhiteLabelConfigFile } from '@zglosto/white-label-config';
import { ExpressAdapter } from '@nestjs/platform-express';
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_CONFIG_CACHE_CONTROL } from '../../lib/public-config.ts';
import { DatabaseReadinessProbe } from '../modules/database/database-readiness.probe.ts';
import { ObjectStorageReadinessProbe } from '../modules/storage/storage-readiness.probe.ts';
import { WHITE_LABEL_CONFIG } from '../modules/white-label/white-label-config.service.ts';
import { correlationIdHeader } from '../platform/request-context.middleware.ts';
import { TransientStoreService } from '../platform/transient-store.service.ts';
import { HealthModule } from './health.module.ts';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const loadedConfig = loadWhiteLabelConfigFile(
  resolve(backendDirectory, '../config/white-label/zglosto.yaml'),
);
const applications: INestApplication[] = [];

interface ReadinessScenario {
  database: 'down' | 'up';
  objectStorage: 'down' | 'up';
  redis: 'disabled' | 'down' | 'up';
}

function probe(status: 'down' | 'up'): DatabaseReadinessProbe {
  return {
    check: () =>
      status === 'up' ? Promise.resolve() : Promise.reject(new Error('dependency unavailable')),
  };
}

async function createApplication(scenario: ReadinessScenario): Promise<INestApplication> {
  const moduleReference = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(WHITE_LABEL_CONFIG)
    .useValue(loadedConfig)
    .overrideProvider(DatabaseReadinessProbe)
    .useValue(probe(scenario.database))
    .overrideProvider(ObjectStorageReadinessProbe)
    .useValue(probe(scenario.objectStorage))
    .overrideProvider(TransientStoreService)
    .useValue({ readiness: () => Promise.resolve(scenario.redis) })
    .compile();
  const application = moduleReference.createNestApplication(new ExpressAdapter(), {
    logger: false,
  });
  applications.push(application);
  await application.listen(0, '127.0.0.1');
  return application;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close()));
});

describe('NestJS health and White-Label HTTP contract', () => {
  it('serves liveness and both readiness paths with the active config state', async () => {
    const application = await createApplication({
      database: 'up',
      objectStorage: 'up',
      redis: 'disabled',
    });
    const baseUrl = await application.getUrl();

    const livenessResponse = await fetch(`${baseUrl}/health/live`);
    expect(livenessResponse.status).toBe(200);
    expect(BackendLivenessResponseSchema.parse(await livenessResponse.json())).toEqual({
      status: 'ok',
      service: 'backend',
    });

    await Promise.all(
      ['/health', '/health/ready'].map(async (path) => {
        const response = await fetch(`${baseUrl}${path}`);
        expect(response.status).toBe(200);
        expect(response.headers.get(correlationIdHeader)).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(BackendReadinessResponseSchema.parse(await response.json())).toEqual({
          status: 'ok',
          service: 'backend',
          database: 'up',
          objectStorage: 'up',
          redis: 'disabled',
          config: {
            status: 'valid',
            configVersion: loadedConfig.config.configVersion,
            checksum: loadedConfig.checksum,
          },
        });
      }),
    );
  });

  it('returns the backward-compatible 503 body when a dependency is unavailable', async () => {
    const application = await createApplication({
      database: 'down',
      objectStorage: 'up',
      redis: 'down',
    });
    const response = await fetch(`${await application.getUrl()}/health/ready`);

    expect(response.status).toBe(503);
    expect(BackendReadinessResponseSchema.parse(await response.json())).toEqual({
      status: 'error',
      service: 'backend',
      database: 'down',
      objectStorage: 'up',
      redis: 'down',
    });
  });

  it('returns HTTP 200 with degraded when optional Redis is unavailable', async () => {
    const application = await createApplication({
      database: 'up',
      objectStorage: 'up',
      redis: 'down',
    });
    const response = await fetch(`${await application.getUrl()}/health/ready`);

    expect(response.status).toBe(200);
    expect(BackendReadinessResponseSchema.parse(await response.json())).toEqual({
      status: 'degraded',
      service: 'backend',
      database: 'up',
      objectStorage: 'up',
      redis: 'down',
      config: {
        status: 'valid',
        configVersion: loadedConfig.config.configVersion,
        checksum: loadedConfig.checksum,
      },
    });
  });

  it('serves the exact public config representation with cache validators', async () => {
    const application = await createApplication({
      database: 'up',
      objectStorage: 'up',
      redis: 'up',
    });
    const url = `${await application.getUrl()}/config/public`;
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(PUBLIC_CONFIG_CACHE_CONTROL);
    const etag = response.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const payload = publicCityConfigResponseSchema.parse(await response.json());
    expect(payload.configVersion).toBe(loadedConfig.config.configVersion);
    expect(payload.checksum).toBe(loadedConfig.checksum);

    const notModifiedResponse = await fetch(url, {
      headers: { 'If-None-Match': `W/${etag}` },
    });
    expect(notModifiedResponse.status).toBe(304);
    expect(notModifiedResponse.headers.get('cache-control')).toBe(PUBLIC_CONFIG_CACHE_CONTROL);
    expect(notModifiedResponse.headers.get('etag')).toBe(etag);
    expect(await notModifiedResponse.text()).toBe('');
  });
});
