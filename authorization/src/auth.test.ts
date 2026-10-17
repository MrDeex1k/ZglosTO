import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  on: vi.fn(),
  configure: vi.fn((options: Record<string, unknown>) => options),
  session: vi.fn(
    (callback: (input: { user: { id: string }; session: object }) => Promise<unknown>) => callback,
  ),
}));
vi.mock('node:fs', () => ({ readFileSync: () => 'test-ca' }));
vi.mock('pg', () => ({
  Pool: class {
    query = mocks.query;
    on = mocks.on;
    end = vi.fn();
  },
}));
vi.mock('better-auth', () => ({ betterAuth: mocks.configure }));
vi.mock('better-auth/plugins', () => ({ customSession: mocks.session }));
vi.mock('@better-auth/expo', () => ({ expo: () => ({}) }));
vi.mock('./logger.ts', () => ({ logAuthOperation: vi.fn(async () => {}) }));
vi.mock('./distributed-rate-limit.ts', () => ({ betterAuthRateLimitOptions: {} }));
vi.mock('./env.ts', () => ({
  env: {
    databaseUrl: 'postgresql://test',
    databaseTlsCaPath: 'test-ca',
    databasePool: {},
    nodeEnv: 'production',
    frontendOrigin: 'https://city.example',
    betterAuthUrl: 'https://city.example/api/auth',
    betterAuthSecret: 'x'.repeat(32),
    emailDeliveryMode: 'disabled',
  },
}));

await import('./auth.ts');
// Vitest 5 clears spy histories before each test; preserve module initialization results.
const sessionCallback = mocks.session.mock.calls[0]![0];
const authConfig = mocks.configure.mock.calls[0]![0];
const poolErrorListener = mocks.on.mock.calls.find(([event]) => event === 'error')?.[1];
beforeEach(() => mocks.query.mockReset());

test('database permission failures reject the session instead of returning an empty role', async () => {
  mocks.query.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(sessionCallback({ user: { id: 'user-1' }, session: {} })).rejects.toMatchObject({
    status: 'SERVICE_UNAVAILABLE',
  });
});

test('a missing application role grants no permissions', async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] });
  await expect(sessionCallback({ user: { id: 'user-1' }, session: {} })).resolves.toMatchObject({
    user: { uprawnienia: null, serviceKey: null },
  });
});

test('email verification remains optional with production delivery disabled', () => {
  expect(authConfig.emailAndPassword).toMatchObject({ requireEmailVerification: false });
  expect(authConfig.emailVerification).not.toHaveProperty('sendOnSignUp');
  expect(authConfig.emailVerification).not.toHaveProperty('sendVerificationEmail');
  expect(authConfig.trustedOrigins).toEqual(['https://city.example', 'zglosto://']);
});

test('idle pool errors have a handler', () => {
  expect(typeof poolErrorListener).toBe('function');
});

test('the post-commit user hook leaves role provisioning to the database transaction', async () => {
  const hooks = authConfig.databaseHooks as {
    user: {
      create: {
        after: (user: { id: string; email: string; emailVerified: boolean }) => Promise<void>;
      };
    };
  };
  await hooks.user.create.after({
    id: 'user-1',
    email: 'resident@example.com',
    emailVerified: false,
  });
  expect(mocks.query).not.toHaveBeenCalled();
});
