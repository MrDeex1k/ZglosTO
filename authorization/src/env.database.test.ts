import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('BETTER_AUTH_SECRET', 'fixture-only-better-auth-secret-at-least-32-characters');
  vi.stubEnv('DATABASE_TLS_CA_PATH', '/fixture/ca.crt');
  vi.stubEnv('BETTER_AUTH_URL', 'https://city.example/api/auth');
  vi.stubEnv('FRONTEND_ORIGIN', 'https://city.example');
  vi.stubEnv('AUTHORIZATION_MTLS_PORT', '9956');
  for (const name of ['CA', 'CERT', 'KEY'])
    vi.stubEnv(`AUTHORIZATION_MTLS_${name}_PATH`, '/fixture/tls');
  for (const name of ['BACKEND', 'NGINX', 'HEALTHCHECK'])
    vi.stubEnv(
      `AUTHORIZATION_MTLS_${name}_IDENTITY`,
      `spiffe://zglosto.local/workload/${name.toLowerCase()}`,
    );
  vi.stubEnv('REDIS_MODE', 'disabled');
  vi.stubEnv('REDIS_URL_FILE', '');
  vi.stubEnv('REDIS_TLS_CA_PATH', '');
  vi.stubEnv('RATE_LIMIT_HMAC_KEY_FILE', '');
  vi.stubEnv(
    'DATABASE_URL_FILE',
    new URL('../../tests/fixtures/database/auth-url', import.meta.url).pathname,
  );
  vi.stubEnv('DATABASE_URL', '');
});
afterEach(() => vi.unstubAllEnvs());
test('auth reads its own URL file without a shared inline database credential', async () => {
  const { env } = await import('./env.ts');
  expect(new URL(env.databaseUrl).username).toBe('zglosto_auth');
});
test('a missing selected URL file fails closed rather than using an inline administrator URL', async () => {
  vi.stubEnv('DATABASE_URL_FILE', '/nonexistent-fixture/database-url');
  vi.stubEnv('DATABASE_URL', 'postgresql://administrator:fixture@database/db');
  await expect(import('./env.ts')).rejects.toThrow();
});
