import type { MobileFetch } from './client';

interface AuthenticatedFetchOptions {
  fetcher: MobileFetch;
  getCookie: () => Promise<string>;
  onForbidden: () => Promise<void> | void;
  onUnauthorized: () => Promise<void> | void;
}

export function createAuthenticatedFetch({
  fetcher,
  getCookie,
  onForbidden,
  onUnauthorized,
}: AuthenticatedFetchOptions): MobileFetch {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    const cookie = await getCookie();
    if (cookie !== '') headers.set('Cookie', cookie);

    const response = await fetcher(input, {
      ...init,
      credentials: 'omit',
      headers,
    });

    if (response.status === 401) await onUnauthorized();
    else if (response.status === 403) await onForbidden();

    return response;
  };
}
