import { describe, expect, it } from 'vitest';

import { copyRequestHeaders, isAllowedMobileRequest } from './restricted-phase3-proxy.mjs';

describe('restricted mobile proxy policy', () => {
  it.each([
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/send-verification-email'],
    ['GET', '/api/auth/verify-email'],
    ['GET', '/api/auth/capabilities'],
    ['GET', '/api/mieszkaniec/incydenty/glowna/9274cdd5-a76d-474f-8a61-bee6cd1a2116'],
    ['GET', '/api/auth/__test__/verification-email'],
  ])('allows the mobile route %s %s', (method, pathname) => {
    expect(isAllowedMobileRequest(method, pathname)).toBe(true);
  });

  it.each([
    ['GET', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/__test__/verification-email'],
    ['GET', '/api/admin/users'],
    ['POST', '/api/auth/capabilities'],
    ['GET', '/api/mieszkaniec/incydenty/glowna/not-a-uuid'],
    ['GET', '/api/mieszkaniec/incydenty/glowna/9274cdd5-a76d-474f-8a61-bee6cd1a2116/extra'],
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

  it('forwards the idempotency key for new reports only', () => {
    const key = '9274cdd5-a76d-474f-8a61-bee6cd1a2116';
    const request = { method: 'POST', headers: { 'idempotency-key': key } };
    expect(copyRequestHeaders(request, '/api/mieszkaniec/incydenty')).toEqual({
      'idempotency-key': key,
    });
    expect(copyRequestHeaders(request, '/api/mieszkaniec/obrazy/uploads')).toEqual({});
  });
});
