import { describe, expect, it } from 'vitest';

import { copyRequestHeaders, isAllowedMobileRequest } from './restricted-phase3-proxy.mjs';

describe('restricted mobile proxy policy', () => {
  it.each([
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/send-verification-email'],
    ['GET', '/api/auth/verify-email'],
    ['GET', '/api/auth/__test__/verification-email'],
  ])('allows the Phase 4.1 route %s %s', (method, pathname) => {
    expect(isAllowedMobileRequest(method, pathname)).toBe(true);
  });

  it.each([
    ['GET', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/__test__/verification-email'],
    ['GET', '/api/admin/users'],
    ['DELETE', '/api/mieszkaniec/incydenty/example'],
  ])('keeps unrelated routes blocked: %s %s', (method, pathname) => {
    expect(isAllowedMobileRequest(method, pathname)).toBe(false);
  });

  it('forwards optimistic concurrency without forwarding unrelated headers', () => {
    expect(
      copyRequestHeaders({
        headers: {
          authorization: 'must-not-pass',
          'if-match': '"incident-7"',
          'user-agent': 'test-client',
        },
      }),
    ).toEqual({ 'if-match': '"incident-7"', 'user-agent': 'test-client' });
  });
});
