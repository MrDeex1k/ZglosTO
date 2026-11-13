import { afterEach, expect, test, vi } from 'vitest';
import type { TransientStore } from '@zglosto/transient-store';
import { sharedNonceConsumer } from './replay-store.ts';
afterEach(() => vi.useRealTimers());

test('shares atomic nonces across replicas and quarantines after Redis data loss', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const entries = new Map<string, string>();
  const store = {
    connect: async () => {},
    get: async (key: string) => entries.get(key) ?? null,
    acquireLease: async (key: string, value: string) => {
      if (entries.has(key)) return false;
      entries.set(key, value);
      return true;
    },
  } as unknown as TransientStore;
  const firstReplica = sharedNonceConsumer(store, 30);
  const secondReplica = sharedNonceConsumer(store, 30);
  await expect(firstReplica('key:nonce')).rejects.toThrow('warming up');
  vi.setSystemTime(1_061_001);
  expect(await Promise.all([firstReplica('key:nonce'), secondReplica('key:nonce')])).toEqual([
    true,
    false,
  ]);
  // A new process shares the same nonce, unlike a fresh in-memory cache.
  await expect(sharedNonceConsumer(store, 30)('key:nonce')).resolves.toBe(false);
  entries.clear();
  await expect(secondReplica('key:nonce')).rejects.toThrow('warming up');
});

test('fails closed when shared replay protection is disabled', async () => {
  await expect(sharedNonceConsumer(null, 30)('key:nonce')).rejects.toThrow('unavailable');
});

test('recovers the shared connection after an outage while failing closed during it', async () => {
  const connect = vi
    .fn()
    .mockRejectedValueOnce(new Error('Redis unavailable'))
    .mockResolvedValue(null);
  const store = {
    connect,
    get: async () => String(Date.now() - 1000),
    acquireLease: async () => true,
  } as unknown as TransientStore;
  const consume = sharedNonceConsumer(store, 30);
  await expect(consume('key:nonce-a')).rejects.toThrow('Redis unavailable');
  await expect(consume('key:nonce-b')).resolves.toBe(true);
  expect(connect).toHaveBeenCalledTimes(2);
});
