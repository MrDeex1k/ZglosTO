import { describe, expect, it } from 'vitest';
import {
  ClientAddressEnvironmentSchema,
  HomepageCacheEnvironmentSchema,
  IncidentRateLimitEnvironmentSchema,
  LocalRateLimitEnvironmentSchema,
  RedisConnectionEnvironmentSchema,
  RedisModeSchema,
} from './runtime.js';

describe('runtime configuration contracts', () => {
  it('accepts all supported Redis modes', () => {
    expect(RedisModeSchema.options).toEqual(['disabled', 'local', 'external']);
  });

  it('requires no Redis secret in disabled mode', () => {
    expect(
      RedisConnectionEnvironmentSchema.parse({
        commandTimeoutMs: 500,
        connectTimeoutMs: 1000,
        identityHmacKeyFile: null,
        keyPrefix: 'zglosto',
        mode: 'disabled',
        tlsCaPath: null,
        urlFile: null,
      }),
    ).toMatchObject({
      mode: 'disabled',
      tlsCaPath: null,
      urlFile: null,
    });
  });

  it.each(['local', 'external'] as const)('requires a Redis URL file in %s mode', (mode) => {
    const result = RedisConnectionEnvironmentSchema.safeParse({
      commandTimeoutMs: 500,
      connectTimeoutMs: 1000,
      identityHmacKeyFile: null,
      keyPrefix: 'zglosto',
      mode,
      tlsCaPath: null,
      urlFile: null,
    });

    expect(result.success).toBe(false);
  });

  it.each(['local', 'external'] as const)(
    'accepts both Redis and HMAC secret files in %s mode',
    (mode) => {
      expect(
        RedisConnectionEnvironmentSchema.parse({
          commandTimeoutMs: 500,
          connectTimeoutMs: 1000,
          identityHmacKeyFile: '/run/secrets/redis/rate-limit-hmac',
          keyPrefix: 'zglosto',
          mode,
          tlsCaPath: null,
          urlFile: '/run/secrets/redis/url',
        }),
      ).toMatchObject({
        identityHmacKeyFile: '/run/secrets/redis/rate-limit-hmac',
        mode,
        urlFile: '/run/secrets/redis/url',
      });
    },
  );

  it('rejects invalid Redis prefixes and non-positive timeouts', () => {
    expect(
      RedisConnectionEnvironmentSchema.safeParse({
        commandTimeoutMs: 0,
        connectTimeoutMs: 1000,
        keyPrefix: 'City Name',
        mode: 'disabled',
        tlsCaPath: null,
        urlFile: null,
      }).success,
    ).toBe(false);
  });

  it('accepts positive local and distributed limiter thresholds', () => {
    expect(
      LocalRateLimitEnvironmentSchema.parse({
        cleanupIntervalMs: 60_000,
        maxKeys: 50_000,
        maxRequests: 5,
        windowMs: 10_000,
      }),
    ).toEqual({
      cleanupIntervalMs: 60_000,
      maxKeys: 50_000,
      maxRequests: 5,
      windowMs: 10_000,
    });

    expect(
      IncidentRateLimitEnvironmentSchema.parse({
        global: { maxRequests: 300, windowMs: 60_000 },
        ip: { maxRequests: 10, windowMs: 900_000 },
        local: {
          cleanupIntervalMs: 60_000,
          maxKeys: 50_000,
          maxRequests: 5,
          windowMs: 10_000,
        },
        user: { maxRequests: 20, windowMs: 900_000 },
      }),
    ).toBeDefined();
  });

  it('rejects zero and fractional limiter thresholds', () => {
    expect(
      LocalRateLimitEnvironmentSchema.safeParse({
        cleanupIntervalMs: 60_000,
        maxKeys: 0,
        maxRequests: 1.5,
        windowMs: 10_000,
      }).success,
    ).toBe(false);
  });

  it('accepts the agreed homepage cache TTLs', () => {
    expect(
      HomepageCacheEnvironmentSchema.parse({
        nginxDisabledTtlSeconds: 900,
        nginxMicrocacheSeconds: 30,
        ttlSeconds: 900,
      }),
    ).toEqual({
      nginxDisabledTtlSeconds: 900,
      nginxMicrocacheSeconds: 30,
      ttlSeconds: 900,
    });
  });

  it('requires at least one explicitly trusted reverse-proxy hop', () => {
    expect(ClientAddressEnvironmentSchema.parse({ trustedProxyHops: 1 })).toEqual({
      trustedProxyHops: 1,
    });
    expect(ClientAddressEnvironmentSchema.safeParse({ trustedProxyHops: 0 }).success).toBe(false);
  });
});
