import type { RedisClientType } from 'redis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransientStoreOperationError } from './port.js';
import { RedisTransientStore, type TransientStoreOperationEvent } from './redis-transient-store.js';

interface SetCommandOptions {
  condition?: 'NX';
  expiration: { type: 'PX'; value: number };
}

interface EvalCommandOptions {
  arguments: string[];
  keys: string[];
}

class FakeRedisClient {
  isOpen = false;
  isReady = false;
  destroyed = false;
  readonly del = vi.fn(async (_key: string) => 1);
  readonly eval = vi.fn<(script: string, options: EvalCommandOptions) => Promise<unknown>>(
    async (script: string, _options: EvalCommandOptions) =>
      script.includes("'INCR'") ? [3, 4_500] : 1,
  );
  readonly get = vi.fn<(_key: string) => Promise<string | null>>(async (_key: string) => 'cached');
  readonly ping = vi.fn(async () => 'PONG');
  readonly set = vi.fn(async (_key: string, _value: string, _options: SetCommandOptions) => 'OK');

  async connect(): Promise<this> {
    this.isOpen = true;
    this.isReady = true;
    return this;
  }

  withAbortSignal(_signal: AbortSignal): this {
    return this;
  }

  destroy(): void {
    this.destroyed = true;
    this.isOpen = false;
    this.isReady = false;
  }
}

const stores: RedisTransientStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

function createStore(
  client = new FakeRedisClient(),
  commandTimeoutMs = 500,
  onOperation?: (event: TransientStoreOperationEvent) => void,
): {
  client: FakeRedisClient;
  store: RedisTransientStore;
} {
  const store = new RedisTransientStore(client as unknown as RedisClientType, {
    commandTimeoutMs,
    connectTimeoutMs: 1_000,
    keyPrefix: 'zglosto',
    ...(onOperation === undefined ? {} : { onOperation }),
  });
  stores.push(store);
  return { client, store };
}

describe('RedisTransientStore', () => {
  it('qualifies keys and performs cache operations with millisecond TTL', async () => {
    const { client, store } = createStore();

    await store.connect();
    await store.ping();
    await expect(store.get('cache:homepage')).resolves.toBe('cached');
    await store.set('cache:homepage', '[]', 900_000);
    await expect(store.delete('cache:homepage')).resolves.toBe(true);

    expect(client.isOpen).toBe(true);
    expect(client.get).toHaveBeenCalledWith('zglosto:cache:homepage');
    expect(client.set).toHaveBeenCalledWith('zglosto:cache:homepage', '[]', {
      expiration: { type: 'PX', value: 900_000 },
    });
    expect(client.del).toHaveBeenCalledWith('zglosto:cache:homepage');
  });

  it('uses one Lua operation for atomic increment and TTL repair', async () => {
    const { client, store } = createStore();

    await expect(store.increment('rate-limit:incident:hash', 60_000)).resolves.toEqual({
      resetAfterMs: 4_500,
      value: 3,
    });

    const [script, options] = client.eval.mock.calls[0] ?? [];
    expect(script).toContain("redis.call('INCR', KEYS[1])");
    expect(script).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
    expect(options).toEqual({
      arguments: ['60000'],
      keys: ['zglosto:rate-limit:incident:hash'],
    });
  });

  it('reconnects a stale open client so readiness can recover after an outage', async () => {
    const { client, store } = createStore();
    await store.connect();
    client.isReady = false;

    await store.connect();

    expect(client.destroyed).toBe(true);
    expect(client.isOpen).toBe(true);
    expect(client.isReady).toBe(true);
  });

  it('acquires a lease with SET NX PX and releases only the matching token', async () => {
    const { client, store } = createStore();

    await expect(store.acquireLease('lock:homepage', 'lease-token', 5_000)).resolves.toBe(true);
    await expect(store.releaseLease('lock:homepage', 'lease-token')).resolves.toBe(true);

    expect(client.set).toHaveBeenCalledWith('zglosto:lock:homepage', 'lease-token', {
      condition: 'NX',
      expiration: { type: 'PX', value: 5_000 },
    });
    const [script, options] = client.eval.mock.calls[0] ?? [];
    expect(script).toContain("redis.call('GET', KEYS[1]) == ARGV[1]");
    expect(options).toEqual({
      arguments: ['lease-token'],
      keys: ['zglosto:lock:homepage'],
    });
  });

  it('wraps provider errors without including values or connection details', async () => {
    const client = new FakeRedisClient();
    client.get.mockRejectedValueOnce(new Error('redis://default:secret@redis:6379'));
    const { store } = createStore(client);

    const error = await store.get('cache:homepage').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TransientStoreOperationError);
    expect((error as TransientStoreOperationError).message).toBe(
      'Transient store operation failed: get',
    );
    expect((error as TransientStoreOperationError).message).not.toContain('secret');
  });

  it('bounds the complete operation even when an in-flight command does not settle', async () => {
    const client = new FakeRedisClient();
    client.get.mockImplementationOnce(() => new Promise<string | null>(() => {}));
    const { store } = createStore(client, 10);

    await expect(store.get('cache:homepage')).rejects.toThrow(
      'Transient store operation failed: get',
    );
  });

  it('reports successful and failed operations without exposing provider errors', async () => {
    const events: TransientStoreOperationEvent[] = [];
    const client = new FakeRedisClient();
    const { store } = createStore(client, 500, (event) => events.push(event));

    await store.ping();
    client.get.mockRejectedValueOnce(new Error('secret provider detail'));
    await expect(store.get('cache:homepage')).rejects.toThrow(
      'Transient store operation failed: get',
    );

    expect(events).toHaveLength(2);
    expect(events.map(({ operation, outcome }) => ({ operation, outcome }))).toEqual([
      { operation: 'ping', outcome: 'success' },
      { operation: 'get', outcome: 'error' },
    ]);
    expect(events.every(({ durationMs }) => durationMs >= 0)).toBe(true);
  });

  it('rejects unsafe keys, invalid TTLs and malformed Redis script replies', async () => {
    const { client, store } = createStore();

    await expect(store.get('contains spaces')).rejects.toThrow(
      'Transient store operation failed: get',
    );
    await expect(store.set('cache:key', 'value', 0)).rejects.toThrow(
      'ttlMs must be a positive integer',
    );
    client.eval.mockResolvedValueOnce(['invalid']);
    await expect(store.increment('rate-limit:key', 1_000)).rejects.toThrow(
      'Transient store operation failed: increment',
    );
  });

  it('destroys the client once and rejects operations after close', async () => {
    const { client, store } = createStore();

    store.close();
    store.close();

    expect(client.destroyed).toBe(true);
    await expect(store.get('cache:key')).rejects.toThrow('Transient store operation failed: get');
  });
});
