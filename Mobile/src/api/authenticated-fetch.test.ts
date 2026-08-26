import { describe, expect, test, vi } from 'vitest';

import { createAuthenticatedFetch } from './authenticated-fetch';

describe('authenticated mobile fetch', () => {
  test('injects the SecureStore cookie and omits native credential handling', async () => {
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Response(null, { status: 200 });
    });
    const authenticatedFetch = createAuthenticatedFetch({
      fetcher,
      getCookie: () => 'better-auth.session_token=secret',
      onForbidden: vi.fn(),
      onUnauthorized: vi.fn(),
    });

    await authenticatedFetch('https://city.example/api/private');

    expect(capturedInit?.credentials).toBe('omit');
    expect(new Headers(capturedInit?.headers).get('cookie')).toBe(
      'better-auth.session_token=secret',
    );
  });

  test('clears local authentication on 401', async () => {
    const onUnauthorized = vi.fn(async () => undefined);
    const authenticatedFetch = createAuthenticatedFetch({
      fetcher: async () => new Response(null, { status: 401 }),
      getCookie: () => '',
      onForbidden: vi.fn(),
      onUnauthorized,
    });

    await authenticatedFetch('https://city.example/api/private');

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  test('refreshes authorization without logging out on 403', async () => {
    const onForbidden = vi.fn(async () => undefined);
    const onUnauthorized = vi.fn();
    const authenticatedFetch = createAuthenticatedFetch({
      fetcher: async () => new Response(null, { status: 403 }),
      getCookie: () => '',
      onForbidden,
      onUnauthorized,
    });

    await authenticatedFetch('https://city.example/api/private');

    expect(onForbidden).toHaveBeenCalledOnce();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
