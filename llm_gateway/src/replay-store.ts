import { createHash } from 'node:crypto';
import type { TransientStore } from '@zglosto/transient-store';

// A new Redis generation must outlive all signatures issued before data loss.
// Deploy Redis with noeviction: evicting live nonce keys would permit replay.
export function sharedNonceConsumer(store: TransientStore | null, skewSeconds: number) {
  const epochKey = 'llm:replay:epoch';
  const windowMs = (2 * skewSeconds + 1) * 1_000;
  let connection: Promise<void> | null = null;
  const ready = async (): Promise<string> => {
    if (store === null) throw new Error('Shared replay protection is unavailable');
    // Recover after the Redis client's bounded reconnect attempts are exhausted.
    // Share a single attempt so concurrent requests cannot destroy each other's socket.
    connection ??= store.connect().finally(() => {
      connection = null;
    });
    await connection;
    let readyAt = await store.get(epochKey);
    if (readyAt === null) {
      await store.acquireLease(epochKey, String(Date.now() + windowMs), 86_400_000);
      readyAt = await store.get(epochKey);
    }
    if (readyAt === null || !/^\d+$/u.test(readyAt) || Date.now() < Number(readyAt)) {
      throw new Error('Shared replay protection is warming up');
    }
    return readyAt;
  };
  const consume = async (identifier: string): Promise<boolean> => {
    const readyAt = await ready();
    if (store === null) throw new Error('Shared replay protection is unavailable');
    const digest = createHash('sha256').update(identifier).digest('hex');
    const acquired = await store.acquireLease(`llm:nonce:${digest}`, 'used', windowMs);
    if ((await store.get(epochKey)) !== readyAt) throw new Error('Redis generation changed');
    return acquired;
  };
  return Object.assign(consume, { ready });
}
