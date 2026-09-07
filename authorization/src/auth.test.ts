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
beforeEach(() => mocks.query.mockReset());

test('database permission failures reject the session instead of returning an empty role', async () => {
  mocks.query.mockRejectedValueOnce(new Error('database unavailable'));
  const callback = mocks.session.mock.calls[0]![0];
  await expect(callback({ user: { id: 'user-1' }, session: {} })).rejects.toMatchObject({
    status: 'SERVICE_UNAVAILABLE',
  });
});

test('a missing application role grants no permissions', async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] });
  const callback = mocks.session.mock.calls[0]![0];
  await expect(callback({ user: { id: 'user-1' }, session: {} })).resolves.toMatchObject({
    user: { uprawnienia: null, serviceKey: null },
  });
});

test('email verification remains optional with production delivery disabled', () => {
  const config = mocks.configure.mock.calls[0]![0];
  expect(config.emailAndPassword).toMatchObject({ requireEmailVerification: false });
  expect(config.emailVerification).not.toHaveProperty('sendOnSignUp');
  expect(config.emailVerification).not.toHaveProperty('sendVerificationEmail');
  expect(config.trustedOrigins).toEqual(['https://city.example', 'zglosto://']);
});

test('idle pool errors have a handler', () => {
  const listener = mocks.on.mock.calls.find(([event]) => event === 'error')?.[1];
  expect(typeof listener).toBe('function');
});

test('the post-commit user hook leaves role provisioning to the database transaction', async () => {
  const config = mocks.configure.mock.calls[0]![0];
  const hooks = config.databaseHooks as {
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
