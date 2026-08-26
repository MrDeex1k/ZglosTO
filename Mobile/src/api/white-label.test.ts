import { describe, expect, test } from 'vitest';

import { createApiClient } from '@/api/client';
import { createPublicConfigCache, type KeyValueStorage } from '@/storage/public-config-cache';
import { publicConfigFixture } from '@/test/fixtures/public-config';

import { loadPublicConfig, resolvePublicAssetUrl } from './white-label';

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

describe('public White-Label loading', () => {
  test('stores a validated 200 response and reuses it after 304', async () => {
    const cache = createPublicConfigCache(memoryStorage());
    const responses = [
      new Response(JSON.stringify(publicConfigFixture), {
        headers: { 'content-type': 'application/json', etag: '"config-etag"' },
      }),
      new Response(null, { status: 304 }),
    ];
    const client = createApiClient({
      fetcher: async () => responses.shift() ?? new Response(null, { status: 500 }),
      origin: 'https://city.example',
    });

    await expect(loadPublicConfig({ cache, client })).resolves.toMatchObject({
      isStale: false,
      source: 'remote',
    });
    await expect(loadPublicConfig({ cache, client })).resolves.toMatchObject({
      isStale: false,
      source: 'not-modified',
    });
  });

  test('falls back to the last valid cache on a network failure', async () => {
    const cache = createPublicConfigCache(memoryStorage());
    await cache.write({
      etag: '"config-etag"',
      response: publicConfigFixture,
      savedAt: '2026-08-19T19:00:00.000Z',
    });
    const client = createApiClient({
      fetcher: async () => {
        throw new TypeError('offline');
      },
      origin: 'https://city.example',
    });

    await expect(loadPublicConfig({ cache, client })).resolves.toMatchObject({
      isStale: true,
      response: publicConfigFixture,
      source: 'cache',
    });
  });

  test('does not hide a network failure when no valid cache exists', async () => {
    const client = createApiClient({
      fetcher: async () => {
        throw new TypeError('offline');
      },
      origin: 'https://city.example',
    });

    await expect(
      loadPublicConfig({ cache: createPublicConfigCache(memoryStorage()), client }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  test('resolves root-relative public assets against the configured origin', () => {
    expect(resolvePublicAssetUrl('https://city.example', '/assets/logo.svg')).toBe(
      'https://city.example/assets/logo.svg',
    );
  });
});
