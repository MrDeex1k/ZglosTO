import { afterEach, expect, test, vi } from 'vitest';
import { sharedNonceConsumer } from './replay-store.ts';
afterEach(() => vi.useRealTimers());

test('shares atomic nonces across replicas and quarantines after Redis data loss', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const entries = new Map<string, { value: string; expiresAt: number | null }>();
  function get(key: string): string | null {
    const entry = entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }
    return entry.value;
  }
  const store = {
    connect: async () => {},
    get: async (key: string) => get(key),
    getOrCreatePersistent: async (key: string, value: string) => {
      const current = get(key) ?? value;
      entries.set(key, { value: current, expiresAt: null });
      return current;
    },
    acquireLease: async (key: string, value: string, ttlMs: number) => {
      if (get(key) !== null) return false;
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return true;
    },
  };
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
  vi.setSystemTime(1_122_002);
  await expect(firstReplica('key:nonce')).resolves.toBe(true);

  // Simulate a rolling upgrade from the original expiring epoch.
  entries.set('llm:replay:epoch', { value: '1061000', expiresAt: 87_400_000 });
  await expect(firstReplica.ready()).resolves.toBe('1061000');
  vi.setSystemTime(87_400_001);
  await expect(secondReplica.ready()).resolves.toBe('1061000');
  await expect(secondReplica('key:nonce')).resolves.toBe(true);

  entries.clear();
  await expect(secondReplica('key:nonce')).rejects.toThrow('warming up');
  vi.setSystemTime(87_461_002);
  await expect(secondReplica('key:nonce')).resolves.toBe(true);
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
    getOrCreatePersistent: async () => String(Date.now() - 1000),
    acquireLease: async () => true,
  };
  const consume = sharedNonceConsumer(store, 30);
  await expect(consume('key:nonce-a')).rejects.toThrow('Redis unavailable');
  await expect(consume('key:nonce-b')).resolves.toBe(true);
  expect(connect).toHaveBeenCalledTimes(2);
});
