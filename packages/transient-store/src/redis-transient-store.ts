import type { RedisClientType } from 'redis';
import {
  TransientStoreOperationError,
  type TransientIncrementResult,
  type TransientStore,
} from './port.js';

const INCREMENT_WITH_TTL_SCRIPT = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { value, ttl }
`;

const RELEASE_LEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface RedisTransientStoreOptions {
  commandTimeoutMs: number;
  connectTimeoutMs: number;
  keyPrefix: string;
  onOperation?: (event: TransientStoreOperationEvent) => void;
}

export interface TransientStoreOperationEvent {
  durationMs: number;
  operation: TransientStoreOperationError['operation'];
  outcome: 'error' | 'success';
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function validKey(value: string): string {
  if (!/^[A-Za-z0-9:_-]{1,512}$/.test(value)) {
    throw new Error('Transient store key contains unsupported characters or is too long');
  }
  return value;
}

function parsedInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Redis returned an invalid ${field}`);
  }
  return parsed;
}

function incrementResult(value: unknown): TransientIncrementResult {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error('Redis returned an invalid increment result');
  }
  const count = parsedInteger(value[0], 'counter value');
  const resetAfterMs = parsedInteger(value[1], 'counter TTL');
  if (count <= 0 || resetAfterMs <= 0) {
    throw new Error('Redis returned a non-positive counter value or TTL');
  }
  return { resetAfterMs, value: count };
}

export class RedisTransientStore implements TransientStore {
  readonly #client: RedisClientType;
  readonly #commandTimeoutMs: number;
  readonly #connectTimeoutMs: number;
  readonly #keyPrefix: string;
  readonly #onOperation: ((event: TransientStoreOperationEvent) => void) | null;
  #closed = false;

  constructor(client: RedisClientType, options: RedisTransientStoreOptions) {
    this.#client = client;
    this.#commandTimeoutMs = positiveInteger('commandTimeoutMs', options.commandTimeoutMs);
    this.#connectTimeoutMs = positiveInteger('connectTimeoutMs', options.connectTimeoutMs);
    this.#keyPrefix = validKey(options.keyPrefix);
    this.#onOperation = options.onOperation ?? null;
  }

  async connect(): Promise<void> {
    await this.#execute(
      'connect',
      async () => {
        if (this.#client.isReady) return;
        if (this.#client.isOpen) this.#client.destroy();
        await this.#client.connect();
      },
      this.#connectTimeoutMs,
    );
  }

  async ping(): Promise<void> {
    await this.#execute('ping', async (signal) => {
      await this.#client.withAbortSignal(signal).ping();
    });
  }

  async get(key: string): Promise<string | null> {
    return this.#execute('get', (signal) =>
      this.#client.withAbortSignal(signal).get(this.#qualifiedKey(key)),
    );
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    positiveInteger('ttlMs', ttlMs);
    await this.#execute('set', async (signal) => {
      await this.#client.withAbortSignal(signal).set(this.#qualifiedKey(key), value, {
        expiration: { type: 'PX', value: ttlMs },
      });
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.#execute(
      'delete',
      async (signal) =>
        (await this.#client.withAbortSignal(signal).del(this.#qualifiedKey(key))) > 0,
    );
  }

  async increment(key: string, ttlMs: number): Promise<TransientIncrementResult> {
    positiveInteger('ttlMs', ttlMs);
    return this.#execute('increment', async (signal) =>
      incrementResult(
        await this.#client.withAbortSignal(signal).eval(INCREMENT_WITH_TTL_SCRIPT, {
          arguments: [ttlMs.toString()],
          keys: [this.#qualifiedKey(key)],
        }),
      ),
    );
  }

  async acquireLease(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (!token) throw new Error('Lease token must not be empty');
    positiveInteger('ttlMs', ttlMs);
    return this.#execute(
      'acquire-lease',
      async (signal) =>
        (await this.#client.withAbortSignal(signal).set(this.#qualifiedKey(key), token, {
          condition: 'NX',
          expiration: { type: 'PX', value: ttlMs },
        })) === 'OK',
    );
  }

  async releaseLease(key: string, token: string): Promise<boolean> {
    if (!token) throw new Error('Lease token must not be empty');
    return this.#execute(
      'release-lease',
      async (signal) =>
        parsedInteger(
          await this.#client.withAbortSignal(signal).eval(RELEASE_LEASE_SCRIPT, {
            arguments: [token],
            keys: [this.#qualifiedKey(key)],
          }),
          'lease release result',
        ) === 1,
    );
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#client.destroy();
  }

  #qualifiedKey(key: string): string {
    return `${this.#keyPrefix}:${validKey(key)}`;
  }

  async #execute<Result>(
    operation: TransientStoreOperationError['operation'],
    command: (signal: AbortSignal) => Promise<Result>,
    timeoutMs = this.#commandTimeoutMs,
  ): Promise<Result> {
    if (this.#closed) {
      throw new TransientStoreOperationError(operation, {
        cause: new Error('Redis transient store is closed'),
      });
    }
    const controller = new AbortController();
    const startedAt = performance.now();
    let outcome: TransientStoreOperationEvent['outcome'] = 'error';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      const scheduledTimer = setTimeout(() => {
        controller.abort();
        reject(new Error('Redis command timed out'));
      }, timeoutMs);
      timer = scheduledTimer;
    });
    try {
      const result = await Promise.race([command(controller.signal), timeout]);
      outcome = 'success';
      return result;
    } catch (error: unknown) {
      throw new TransientStoreOperationError(operation, { cause: error });
    } finally {
      if (timer !== null) clearTimeout(timer);
      try {
        this.#onOperation?.({
          durationMs: performance.now() - startedAt,
          operation,
          outcome,
        });
      } catch {
        // Telemetry must never change the transient store operation result.
      }
    }
  }
}
