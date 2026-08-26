import { readFileSync } from 'node:fs';
import { createClient, type RedisClientType } from 'redis';
import { RedisTransientStore, type TransientStoreOperationEvent } from './redis-transient-store.js';
import type { TransientStore } from './port.js';

interface DisabledRedisConfiguration {
  commandTimeoutMs: number;
  connectTimeoutMs: number;
  keyPrefix: string;
  mode: 'disabled';
  tlsCaPath: null;
  urlFile: null;
}

interface EnabledRedisConfiguration {
  commandTimeoutMs: number;
  connectTimeoutMs: number;
  keyPrefix: string;
  mode: 'external' | 'local';
  tlsCaPath: string | null;
  urlFile: string;
}

export type TransientStoreConfiguration = DisabledRedisConfiguration | EnabledRedisConfiguration;

export type TransientStoreRuntime =
  | { mode: 'disabled'; store: null }
  | { mode: 'external' | 'local'; store: TransientStore };

interface RuntimeDependencies {
  createRedisClient?: typeof createClient;
  onOperation?: (event: TransientStoreOperationEvent) => void;
  readSecretFile?: (path: string) => string;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function redisUrl(value: string): URL {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('Redis URL must use redis:// or rediss://');
  }
  if (!parsed.hostname) {
    throw new Error('Redis URL must include a hostname');
  }
  if (!parsed.password) {
    throw new Error('Redis URL must include credentials');
  }
  return parsed;
}

export function createTransientStoreRuntime(
  configuration: TransientStoreConfiguration,
  dependencies: RuntimeDependencies = {},
): TransientStoreRuntime {
  if (configuration.mode === 'disabled') {
    return { mode: 'disabled', store: null };
  }

  const readSecretFile =
    dependencies.readSecretFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const parsedUrl = redisUrl(readSecretFile(configuration.urlFile));
  const connectTimeoutMs = positiveInteger('connectTimeoutMs', configuration.connectTimeoutMs);
  const createRedisClient = dependencies.createRedisClient ?? createClient;
  const tlsCa = configuration.tlsCaPath === null ? null : readSecretFile(configuration.tlsCaPath);

  if (parsedUrl.protocol === 'redis:' && tlsCa !== null) {
    throw new Error('REDIS_TLS_CA_PATH requires a rediss:// URL');
  }

  const tlsSocket = {
    connectTimeout: connectTimeoutMs,
    reconnectStrategy: false as const,
    rejectUnauthorized: true,
    servername: parsedUrl.hostname,
    tls: true as const,
  };
  const socket =
    parsedUrl.protocol === 'rediss:'
      ? tlsCa === null
        ? tlsSocket
        : { ...tlsSocket, ca: tlsCa }
      : {
          connectTimeout: connectTimeoutMs,
          reconnectStrategy: false as const,
        };
  const client = createRedisClient({
    socket,
    url: parsedUrl.toString(),
  }) as RedisClientType;
  client.on('error', () => {
    // Adapter errors are surfaced by operations; the mandatory listener prevents EventEmitter crashes.
  });

  return {
    mode: configuration.mode,
    store: new RedisTransientStore(client, {
      commandTimeoutMs: configuration.commandTimeoutMs,
      connectTimeoutMs: configuration.connectTimeoutMs,
      keyPrefix: configuration.keyPrefix,
      ...(dependencies.onOperation === undefined ? {} : { onOperation: dependencies.onOperation }),
    }),
  };
}
