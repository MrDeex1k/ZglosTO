import { betterAuth } from 'better-auth';
import { expo } from '@better-auth/expo';
import { expect, test } from 'vitest';

import { betterAuthTrustedOrigins, mobileAppLinkOrigin } from './origins.ts';

const appLinkOrigin = mobileAppLinkOrigin('app.city.example');

// Exercise the installed library without a database connection or an HTTP listener.
const auth = betterAuth({
  baseURL: 'https://city.example',
  secret: 'audit-fixture-only-not-a-deployment-secret-12345678',
  trustedOrigins: betterAuthTrustedOrigins('https://city.example', 'production', appLinkOrigin),
  emailVerification: { sendVerificationEmail: async () => {} },
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

test('the installed Better Auth accepts the configured HTTPS app-link callback on signup and resend', async () => {
  const email = 'mobile-signup@example.com';
  const callbackURL = 'https://app.city.example/auth/email-verified';
  const post = (path: string, body: object) =>
    auth.handler(
      new Request('https://city.example/api/auth/' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'zglosto://' },
        body: JSON.stringify({ ...body, email }),
      }),
    );

  const signup = await post('sign-up/email', {
    name: 'Mobile fixture',
    password: 'fixture-password',
    callbackURL,
  });
  expect(signup.status).toBe(200);

  const resend = await post('send-verification-email', { callbackURL });
  expect(resend.status).toBe(200);
});
