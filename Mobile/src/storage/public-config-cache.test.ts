import { describe, expect, test } from 'vitest';

import { publicConfigFixture } from '@/test/fixtures/public-config';

import { createPublicConfigCache, type KeyValueStorage } from './public-config-cache';

function createMemoryStorage(initialValue: string | null = null): KeyValueStorage {
  let value = initialValue;
  return {
    getItem: async () => value,
    removeItem: async () => {
      value = null;
    },
    setItem: async (_key, nextValue) => {
      value = nextValue;
    },
  };
}

describe('public config cache', () => {
  test('round-trips a validated public configuration', async () => {
    const cache = createPublicConfigCache(createMemoryStorage());
    const entry = {
      etag: '"config-etag"',
      response: publicConfigFixture,
      savedAt: '2026-08-19T19:00:00.000Z',
    };
    await cache.write(entry);
    await expect(cache.read()).resolves.toEqual(entry);
  });

  test('discards invalid or unknown cache versions', async () => {
    const storage = createMemoryStorage(JSON.stringify({ version: 99 }));
    await expect(createPublicConfigCache(storage).read()).resolves.toBeNull();
    await expect(storage.getItem('ignored')).resolves.toBeNull();
  });
});
