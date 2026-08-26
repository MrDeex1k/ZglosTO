import { HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import type { RuntimeConfiguration } from '../../platform/runtime-configuration.ts';
import { LocalIncidentRateLimitMiddleware } from './local-incident-rate-limit.middleware.ts';

function configuration(): RuntimeConfiguration {
  return {
    clientAddress: { trustedProxyHops: 1 },
    homepageCache: {
      nginxDisabledTtlSeconds: 900,
      nginxMicrocacheSeconds: 30,
      ttlSeconds: 900,
    },
    incidentRateLimit: {
      global: { maxRequests: 300, windowMs: 60_000 },
      ip: { maxRequests: 10, windowMs: 900_000 },
      local: {
        cleanupIntervalMs: 60_000,
        maxKeys: 10,
        maxRequests: 1,
        windowMs: 10_000,
      },
      user: { maxRequests: 20, windowMs: 900_000 },
    },
    redis: {
      commandTimeoutMs: 500,
      connectTimeoutMs: 1_000,
      identityHmacKeyFile: null,
      keyPrefix: 'zglosto',
      mode: 'disabled',
      tlsCaPath: null,
      urlFile: null,
    },
  };
}

function request(address: string): Request {
  return {
    get: () => address,
    socket: { remoteAddress: '172.20.0.4' },
  } as unknown as Request;
}

const resources: LocalIncidentRateLimitMiddleware[] = [];

afterEach(() => {
  for (const resource of resources.splice(0)) resource.onModuleDestroy();
});

describe('LocalIncidentRateLimitMiddleware', () => {
  it('allows the first request and rejects the next one with Retry-After', () => {
    const middleware = new LocalIncidentRateLimitMiddleware(configuration());
    resources.push(middleware);
    const response = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware.use(request('203.0.113.7'), response, next);
    middleware.use(request('203.0.113.7'), response, next);

    expect(next).toHaveBeenNthCalledWith(1);
    const rejection = (next as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
    expect(rejection).toBeInstanceOf(HttpException);
    expect((rejection as HttpException).getStatus()).toBe(429);
    expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('retry-after', '10');
  });

  it('uses the trusted proxy position instead of a spoofed leftmost address', () => {
    const middleware = new LocalIncidentRateLimitMiddleware(configuration());
    resources.push(middleware);
    const response = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware.use(request('198.51.100.1, 203.0.113.7'), response, next);
    middleware.use(request('198.51.100.2, 203.0.113.7'), response, next);

    const rejection = (next as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
    expect(rejection).toBeInstanceOf(HttpException);
  });
});
