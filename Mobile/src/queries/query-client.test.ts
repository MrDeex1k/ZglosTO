import { describe, expect, test } from 'vitest';

import { ApiError } from '@/api/errors';

import { clearPrivateQueries, createMobileQueryClient, shouldRetry } from './query-client';
import { queryKeys } from './query-keys';

describe('mobile query policy', () => {
  test('retries transient network and server errors at most twice', () => {
    expect(shouldRetry(0, new ApiError('offline', { kind: 'network' }))).toBe(true);
    expect(shouldRetry(1, new ApiError('server', { kind: 'http', status: 503 }))).toBe(true);
    expect(shouldRetry(2, new ApiError('offline', { kind: 'network' }))).toBe(false);
  });

  test('does not retry contract or permanent client errors', () => {
    expect(shouldRetry(0, new ApiError('bad data', { kind: 'contract' }))).toBe(false);
    expect(shouldRetry(0, new ApiError('forbidden', { kind: 'http', status: 403 }))).toBe(false);
  });

  test('creates one client with the expected public stale time', () => {
    const options = createMobileQueryClient().getDefaultOptions();
    expect(options.queries?.staleTime).toBe(60_000);
    expect(options.mutations?.networkMode).toBe('always');
    expect(options.mutations?.retry).toBe(false);
  });

  test('clears private queries without touching public configuration', () => {
    const queryClient = createMobileQueryClient();
    queryClient.setQueryData(['public', 'config'], { version: 1 });
    queryClient.setQueryData(['private', 'resident', 'user-1'], { id: 'incident-1' });

    clearPrivateQueries(queryClient);

    expect(queryClient.getQueryData(['public', 'config'])).toEqual({ version: 1 });
    expect(queryClient.getQueryData(['private', 'resident', 'user-1'])).toBeUndefined();
  });

  test('isolates service queues by origin, user and server-verified service scope', () => {
    const roads = queryKeys.serviceIncidents('https://local.test', 'operator-1', 'roads');
    const other = queryKeys.serviceIncidents('https://local.test', 'operator-1', 'other');
    const anotherUser = queryKeys.serviceIncidents('https://local.test', 'operator-2', 'roads');

    expect(roads).not.toEqual(other);
    expect(roads).not.toEqual(anotherUser);
    expect(roads).toEqual([
      'private',
      'service',
      'operator-1',
      'roads',
      'incidents',
      'https://local.test',
    ]);
  });
});
