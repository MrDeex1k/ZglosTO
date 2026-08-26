import {
  CorrelationIdSchema,
  StructuredApiErrorResponseSchema,
  type CorrelationId,
} from '@zglosto/contracts';
import { LocalRateLimiter } from '@zglosto/rate-limiting';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAuthorizationLocalRateLimitMiddleware,
  type AuthorizationHonoEnvironment,
} from './local-rate-limit.js';

const correlationId: CorrelationId = CorrelationIdSchema.parse(
  '018f67c6-ee5c-7270-afa1-cacee418c27f',
);
const resources: LocalRateLimiter[] = [];

afterEach(() => {
  for (const resource of resources.splice(0)) resource.close();
});

function createApp(): Hono<AuthorizationHonoEnvironment> {
  const limiter = new LocalRateLimiter({
    cleanupIntervalMs: 60_000,
    maxKeys: 10,
    maxRequests: 1,
    windowMs: 10_000,
  });
  resources.push(limiter);
  const app = new Hono<AuthorizationHonoEnvironment>();
  app.use('*', async (context, next) => {
    context.set('correlationId', correlationId);
    await next();
  });
  app.use(
    '/api/auth/*',
    createAuthorizationLocalRateLimitMiddleware({
      localRateLimiter: limiter,
      peerAddress: () => '172.20.0.4',
      trustedProxyHops: 1,
    }),
  );
  app.get('/api/auth/session', (context) => context.json({ session: null }));
  return app;
}

describe('Authorization local rate limit middleware', () => {
  it('returns the shared 429 contract and Retry-After after the local budget', async () => {
    const app = createApp();
    const request = new Request('https://authorization/api/auth/session', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });

    expect((await app.request(request.clone())).status).toBe(200);
    const rejected = await app.request(request.clone());

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('cache-control')).toBe('no-store');
    expect(rejected.headers.get('retry-after')).toBe('10');
    expect(StructuredApiErrorResponseSchema.parse(await rejected.json())).toEqual({
      correlationId,
      error: 'Too many requests',
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests',
    });
  });

  it('does not consume the auth budget for a CORS preflight', async () => {
    const app = createApp();
    const preflight = await app.request(
      new Request('https://authorization/api/auth/session', { method: 'OPTIONS' }),
    );
    const firstRequest = await app.request('https://authorization/api/auth/session');

    expect(preflight.status).toBe(404);
    expect(firstRequest.status).toBe(200);
  });
});
