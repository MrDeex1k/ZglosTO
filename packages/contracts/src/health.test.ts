import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AuthorizationReadinessResponseSchema,
  BackendLivenessResponseSchema,
  BackendReadinessDegradedResponseSchema,
  BackendReadinessFailureResponseSchema,
  BackendReadinessResponseSchema,
  type BackendLivenessResponse,
  type BackendReadinessResponse,
} from './health.js';

describe('backend health contracts', () => {
  it('accepts the stable liveness response', () => {
    const response = BackendLivenessResponseSchema.parse({
      service: 'backend',
      status: 'ok',
    });

    expect(response).toEqual({ service: 'backend', status: 'ok' });
    expectTypeOf(response).toEqualTypeOf<BackendLivenessResponse>();
  });

  it('accepts ready and unavailable responses as one discriminated contract', () => {
    const ready = BackendReadinessResponseSchema.parse({
      config: {
        checksum: 'a'.repeat(64),
        configVersion: 'gdansk-2026-07-20',
        status: 'valid',
      },
      database: 'up',
      objectStorage: 'up',
      redis: 'disabled',
      service: 'backend',
      status: 'ok',
    });
    const unavailable = BackendReadinessResponseSchema.parse({
      database: 'down',
      objectStorage: 'up',
      redis: 'down',
      service: 'backend',
      status: 'error',
    });

    expectTypeOf(ready).toMatchTypeOf<BackendReadinessResponse>();
    expectTypeOf(unavailable).toMatchTypeOf<BackendReadinessResponse>();
  });

  it('rejects a failure response when every dependency is up', () => {
    expect(() =>
      BackendReadinessFailureResponseSchema.parse({
        database: 'up',
        objectStorage: 'up',
        redis: 'up',
        service: 'backend',
        status: 'error',
      }),
    ).toThrow('at least one readiness dependency must be down');
  });

  it('represents optional Redis failure as degraded without weakening hard dependencies', () => {
    expect(
      BackendReadinessDegradedResponseSchema.parse({
        config: {
          checksum: 'b'.repeat(64),
          configVersion: 'gdansk-2026-07-25',
          status: 'valid',
        },
        database: 'up',
        objectStorage: 'up',
        redis: 'down',
        service: 'backend',
        status: 'degraded',
      }).status,
    ).toBe('degraded');

    expect(
      AuthorizationReadinessResponseSchema.parse({
        config: {
          checksum: 'c'.repeat(64),
          configVersion: 'gdansk-2026-07-25',
          status: 'valid',
        },
        database: 'up',
        redis: 'down',
        service: 'authorization',
        status: 'degraded',
      }).status,
    ).toBe('degraded');
  });
});
