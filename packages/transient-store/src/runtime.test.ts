import { describe, expect, it, vi } from 'vitest';
import type { RedisClientType, createClient } from 'redis';
import { createTransientStoreRuntime } from './runtime.js';

class RuntimeRedisClient {
  readonly on = vi.fn(() => this);
}

function dependencies(files: Readonly<Record<string, string>>): {
  calls: unknown[];
  createRedisClient: typeof createClient;
  readSecretFile: (path: string) => string;
} {
  const calls: unknown[] = [];
  return {
    calls,
    createRedisClient: ((options: unknown) => {
      calls.push(options);
      return new RuntimeRedisClient() as unknown as RedisClientType;
    }) as typeof createClient,
    readSecretFile: (path: string) => {
      const value = files[path];
      if (typeof value !== 'string') throw new Error(`Missing fixture: ${path}`);
      return value;
    },
  };
}

const base = {
  commandTimeoutMs: 500,
  connectTimeoutMs: 1_000,
  keyPrefix: 'zglosto',
} as const;

describe('transient store runtime factory', () => {
  it('returns an explicit null store without reading secrets in disabled mode', () => {
    const readSecretFile = vi.fn(() => {
      throw new Error('must not be called');
    });

    expect(
      createTransientStoreRuntime(
        {
          ...base,
          mode: 'disabled',
          tlsCaPath: null,
          urlFile: null,
        },
        { readSecretFile },
      ),
    ).toEqual({ mode: 'disabled', store: null });
    expect(readSecretFile).not.toHaveBeenCalled();
  });

  it('creates an authenticated local Redis client with bounded connection retries', () => {
    const runtimeDependencies = dependencies({
      '/run/secrets/redis/url': 'redis://default:secret@redis:6379/0\n',
    });
    const runtime = createTransientStoreRuntime(
      {
        ...base,
        mode: 'local',
        tlsCaPath: null,
        urlFile: '/run/secrets/redis/url',
      },
      runtimeDependencies,
    );

    expect(runtime.mode).toBe('local');
    expect(runtimeDependencies.calls).toEqual([
      {
        socket: {
          connectTimeout: 1_000,
          reconnectStrategy: false,
        },
        url: 'redis://default:secret@redis:6379/0',
      },
    ]);
  });

  it('enables verified TLS and SNI for an external rediss endpoint', () => {
    const runtimeDependencies = dependencies({
      '/run/secrets/redis/ca.crt': 'test-ca',
      '/run/secrets/redis/url': 'rediss://default:secret@cache.example.invalid:6380/0',
    });
    const runtime = createTransientStoreRuntime(
      {
        ...base,
        mode: 'external',
        tlsCaPath: '/run/secrets/redis/ca.crt',
        urlFile: '/run/secrets/redis/url',
      },
      runtimeDependencies,
    );

    expect(runtime.mode).toBe('external');
    expect(runtimeDependencies.calls).toEqual([
      {
        socket: {
          ca: 'test-ca',
          connectTimeout: 1_000,
          reconnectStrategy: false,
          rejectUnauthorized: true,
          servername: 'cache.example.invalid',
          tls: true,
        },
        url: 'rediss://default:secret@cache.example.invalid:6380/0',
      },
    ]);
  });

  it.each([
    ['http://default:secret@redis:6379', null, 'redis:// or rediss://'],
    ['redis://redis:6379', null, 'must include credentials'],
    ['redis://default:secret@redis:6379', '/run/secrets/redis/ca.crt', 'requires a rediss://'],
  ] as const)('rejects an unsafe Redis configuration', (url, tlsCaPath, message) => {
    const runtimeDependencies = dependencies({
      '/run/secrets/redis/ca.crt': 'test-ca',
      '/run/secrets/redis/url': url,
    });

    expect(() =>
      createTransientStoreRuntime(
        {
          ...base,
          mode: 'external',
          tlsCaPath,
          urlFile: '/run/secrets/redis/url',
        },
        runtimeDependencies,
      ),
    ).toThrow(message);
  });
});
