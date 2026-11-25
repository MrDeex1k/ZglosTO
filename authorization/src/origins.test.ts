import { expect, test } from 'vitest';
import { authorizationOrigins, betterAuthTrustedOrigins, mobileAppLinkOrigin } from './origins.ts';

test('production trusts only its configured browser origin', () => {
  expect(authorizationOrigins('https://city.example', 'production')).toEqual([
    'https://city.example',
  ]);
});
test('local development retains Vite without duplicate origins', () => {
  expect(authorizationOrigins('http://localhost:5173', 'development')).toEqual([
    'http://localhost:5173',
  ]);
  expect(authorizationOrigins('https://city.example', 'test')).toContain('http://localhost:5173');
});

test('trusted origins support an exact app-link host without changing browser CORS', () => {
  const frontend = 'https://city.example';
  const mobile = mobileAppLinkOrigin('APP.City.example');

  expect(mobile).toBe('https://app.city.example');
  expect(authorizationOrigins(frontend, 'production')).toEqual([frontend]);
  expect(betterAuthTrustedOrigins(frontend, 'production', mobile)).toEqual([
    frontend,
    'zglosto://',
    'https://app.city.example',
  ]);
  expect(betterAuthTrustedOrigins(frontend, 'production', frontend)).toEqual([
    frontend,
    'zglosto://',
  ]);
  expect(mobileAppLinkOrigin(null)).toBeNull();
});

test.each([
  '*.city.example',
  'https://app.city.example',
  'app.city.example:443',
  'app.city.example/path',
  '127.0.0.1',
])('rejects invalid app-link host %s', (host) => {
  expect(() => mobileAppLinkOrigin(host)).toThrow('MOBILE_APP_LINK_HOST');
});
