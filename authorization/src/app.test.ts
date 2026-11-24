import { LocalRateLimiter } from '@zglosto/rate-limiting';
import type { WhiteLabelConfigReadiness } from '@zglosto/white-label-config';
import { afterAll, afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addCounter: vi.fn(),
  recordHistogram: vi.fn(),
  env: {
    nodeEnv: 'production',
    frontendOrigin: 'https://city.example',
    clientAddress: { trustedProxyHops: 1 },
    emailDeliveryMode: 'disabled',
  },
  getSession: vi.fn(),
  logApiRequest: vi.fn(async () => {}),
  handler: vi.fn(async (_request: Request) => Response.json({ ok: true })),
}));
vi.mock('@zglosto/observability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zglosto/observability')>()),
  addCounter: mocks.addCounter,
  recordHistogram: mocks.recordHistogram,
}));
vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: () => ({ remote: { address: '127.0.0.1' } }),
}));
vi.mock('./auth.ts', () => ({
  auth: { handler: mocks.handler, api: { getSession: mocks.getSession } },
  checkAuthDatabase: vi.fn(),
  setTestUserRole: vi.fn(),
}));
vi.mock('./env.ts', () => ({ env: mocks.env }));
vi.mock('./distributed-rate-limit.ts', () => ({ authorizationRedisReadiness: vi.fn() }));
vi.mock('./logger.ts', () => ({
  logApiRequest: mocks.logApiRequest,
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
  vi.clearAllMocks();
  mocks.env.nodeEnv = 'production';
  mocks.env.emailDeliveryMode = 'disabled';
});
// Avoid keeping the limiter's cleanup timer alive after the suite.
afterAll(() => limiter.close());

test('session database failures return a non-cacheable 503', async () => {
  mocks.getSession.mockRejectedValueOnce(new Error('database detail must remain private'));
  const response = await app.request('/api/verify-session');
  expect(response.status).toBe(503);
  expect(mocks.logApiRequest.mock.calls).toEqual([
    ['GET', '/api/verify-session', 503, false, null],
  ]);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).not.toContain('database detail');
});

test('absent sessions return 401 and log one request', async () => {
  mocks.getSession.mockResolvedValueOnce(null);
  expect((await app.request('/api/verify-session')).status).toBe(401);
  expect(mocks.logApiRequest).toHaveBeenCalledExactlyOnceWith(
    'GET',
    '/api/verify-session',
    401,
    false,
    null,
  );
});

test('active sessions return 200 and log one request', async () => {
  mocks.getSession.mockResolvedValueOnce({ session: {}, user: {} });
  expect((await app.request('/api/verify-session')).status).toBe(200);
  expect(mocks.logApiRequest).toHaveBeenCalledExactlyOnceWith(
    'GET',
    '/api/verify-session',
    200,
    true,
    null,
  );
});

test('advertises disabled email delivery and rejects delivery requests without invoking Better Auth', async () => {
  const capabilities = await app.request('/api/auth/capabilities');
  expect(capabilities.status).toBe(200);
  expect(capabilities.headers.get('cache-control')).toBe('no-store');
  expect(await capabilities.json()).toEqual({ emailVerificationDelivery: false });

  const response = await app.request('/api/auth/send-verification-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'resident@example.com' }),
  });
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ errorCode: 'EMAIL_VERIFICATION_UNAVAILABLE' });
  expect(mocks.handler).not.toHaveBeenCalled();
});

test('advertises the test outbox and delegates delivery to Better Auth in test mode', async () => {
  mocks.env.nodeEnv = 'test';
  mocks.env.emailDeliveryMode = 'test';
  const capabilities = await app.request('/api/auth/capabilities');
  expect(await capabilities.json()).toEqual({ emailVerificationDelivery: true });

  const response = await app.request('/api/auth/send-verification-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'resident@example.com' }),
  });
  expect(response.status).toBe(200);
  expect(mocks.handler).toHaveBeenCalledOnce();
});

test('uses bounded route and method labels for both HTTP metrics', async () => {
  await app.request('/health/live');
  await app.request('/api/auth/capabilities');
  await app.request('/api/auth/provider/specific-id?token=private');
  mocks.handler.mockResolvedValueOnce(Response.json({ error: 'Not found' }, { status: 404 }));
  await app.request('/api/auth/unknown-path');
  await app.request('/arbitrary-path', { method: 'PROPFIND' });

  const expected = [
    {
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/health/live',
    },
    {
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/api/auth/capabilities',
    },
    { 'http.request.method': 'GET', 'http.response.status_code': 200, 'http.route': '/api/auth/*' },
    { 'http.request.method': 'GET', 'http.response.status_code': 404, 'http.route': 'unmatched' },
    {
      'http.request.method': '_OTHER',
      'http.response.status_code': 404,
      'http.route': 'unmatched',
    },
  ];
  expect(
    mocks.addCounter.mock.calls
      .filter(([name]) => name === 'zglosto_http_server_requests')
      .map(([, , labels]) => labels),
  ).toEqual(expected);
  expect(
    mocks.recordHistogram.mock.calls
      .filter(([name]) => name === 'zglosto_http_server_duration_seconds')
      .map(([, , labels]) => labels),
  ).toEqual(expected);
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

test('overwrites a client-supplied internal IP header before Better Auth', async () => {
  const response = await app.request('/api/auth/get-session', {
    headers: {
      'x-forwarded-for': '198.51.100.123, 203.0.113.7',
      'x-zglosto-client-ip': '198.51.100.99',
    },
  });
  expect(response.status).toBe(200);
  const forwarded = mocks.handler.mock.calls[0]?.[0] as Request | null;
  expect(forwarded?.headers.get('x-zglosto-client-ip')).toBe('203.0.113.7');
});

test('does not grant credentialed CORS access to an attacker origin', async () => {
  const response = await app.request('/api/auth/get-session', {
    headers: { origin: 'https://attacker.example' },
  });
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
});

test('test role modification is unavailable in production', async () => {
  const response = await app.request('/api/auth/__test__/role', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@example.com', role: 'admin', serviceKey: null }),
  });
  expect(response.status).toBe(404);
});
