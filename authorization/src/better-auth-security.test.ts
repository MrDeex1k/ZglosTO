import { betterAuth } from 'better-auth';
import { expo } from '@better-auth/expo';
import { expect, test } from 'vitest';

// Exercise the installed library without a database connection or an HTTP listener.
const auth = betterAuth({
  baseURL: 'https://city.example',
  secret: 'audit-fixture-only-not-a-deployment-secret-12345678',
  trustedOrigins: ['https://city.example', 'zglosto://'],
  emailAndPassword: { enabled: true },
  // Better Auth otherwise disables these checks automatically under NODE_ENV=test.
  advanced: { disableCSRFCheck: false, disableOriginCheck: false },
  plugins: [expo()],
  logger: { disabled: true },
});

test('the installed Better Auth uses host-scoped HttpOnly Secure SameSite cookies on HTTPS', async () => {
  const context = await auth.$context;
  expect(context.authCookies.sessionToken.attributes).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  expect(context.authCookies.sessionToken.attributes.domain).toBeUndefined();
});

test('the installed Better Auth rejects hostile origins even with a trusted expo-origin override', async () => {
  const response = await auth.handler(
    new Request('https://city.example/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=fixture',
        origin: 'https://attacker.example',
        'expo-origin': 'zglosto://',
      },
      body: JSON.stringify({ email: 'fixture@example.com', password: 'fixture-password' }),
    }),
  );
  expect(response.status).toBe(403);
});
