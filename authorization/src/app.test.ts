import { LocalRateLimiter } from '@zglosto/rate-limiting';
import type { WhiteLabelConfigReadiness } from '@zglosto/white-label-config';
import { afterAll, afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  handler: vi.fn(async () => Response.json({ ok: true })),
}));
vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: () => ({ remote: { address: '127.0.0.1' } }),
}));
vi.mock('./auth.ts', () => ({
  auth: { handler: mocks.handler, api: { getSession: mocks.getSession } },
  checkAuthDatabase: vi.fn(),
  setTestUserRole: vi.fn(),
}));
vi.mock('./env.ts', () => ({
  env: {
    nodeEnv: 'production',
    frontendOrigin: 'https://city.example',
    clientAddress: { trustedProxyHops: 1 },
    emailDeliveryMode: 'disabled',
  },
}));
vi.mock('./distributed-rate-limit.ts', () => ({ authorizationRedisReadiness: vi.fn() }));
vi.mock('./logger.ts', () => ({
  logApiRequest: vi.fn(async () => {}),
  runWithAuthorizationLogContext: (_id: string, next: () => Promise<void>) => next(),
}));
import { createAuthorizationApp } from './app.ts';

const limiter = new LocalRateLimiter({
  maxKeys: 100,
  maxRequests: 100,
  windowMs: 1000,
  cleanupIntervalMs: 1000,
});
const app = createAuthorizationApp({
  configReadiness: {} as WhiteLabelConfigReadiness,
  localRateLimiter: limiter,
});
afterEach(() => {
  mocks.handler.mockClear();
});
// Avoid keeping the limiter's cleanup timer alive after the suite.
afterAll(() => limiter.close());

test('session database failures return a non-cacheable 503', async () => {
  mocks.getSession.mockRejectedValueOnce(new Error('database detail must remain private'));
  const response = await app.request('/api/verify-session');
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).not.toContain('database detail');
});

test('absent sessions still return 401', async () => {
  mocks.getSession.mockResolvedValueOnce(null);
  expect((await app.request('/api/verify-session')).status).toBe(401);
});

test('oversized auth bodies are rejected before password processing', async () => {
  const response = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'x'.repeat(65 * 1024),
  });
  expect(response.status).toBe(413);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.handler).not.toHaveBeenCalled();
});

test('test email outbox is unavailable in production', async () => {
  expect(
    (await app.request('/api/auth/__test__/verification-email?email=test@example.com')).status,
  ).toBe(404);
});
