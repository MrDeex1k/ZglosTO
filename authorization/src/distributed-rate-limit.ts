import { readFileSync } from 'node:fs';
import type { RedisDependencyStatus } from '@zglosto/contracts';
import { addCounter, recordHistogram, setGauge } from '@zglosto/observability';
import { RateLimitKeyHasher } from '@zglosto/rate-limiting';
import {
  createTransientStoreRuntime,
  type TransientStoreOperationEvent,
  type TransientStoreRuntime,
} from '@zglosto/transient-store';
import type { BetterAuthRateLimitOptions } from 'better-auth';
import { createBetterAuthRateLimitStorage } from './better-auth-rate-limit-storage.ts';
import { env } from './env.ts';

let redisStatus: RedisDependencyStatus = env.redis.mode === 'disabled' ? 'disabled' : 'down';

function recordRedisStatus(status: RedisDependencyStatus): void {
  redisStatus = status;
  setGauge('zglosto_redis_dependency_up', status === 'down' ? 0 : 1, {
    redis_mode: env.redis.mode,
    service: 'authorization',
  });
}

function recordRedisOperation(event: TransientStoreOperationEvent): void {
  const attributes = {
    operation: event.operation,
    outcome: event.outcome,
    redis_mode: env.redis.mode,
    service: 'authorization',
  };
  addCounter('zglosto_redis_operations', 1, attributes);
  recordHistogram('zglosto_redis_operation_duration_seconds', event.durationMs / 1_000, attributes);
  recordRedisStatus(event.outcome === 'success' ? 'up' : 'down');
}

const runtime: TransientStoreRuntime = createTransientStoreRuntime(env.redis, {
  onOperation: recordRedisOperation,
});
recordRedisStatus(redisStatus);
const hasher =
  env.redis.mode === 'disabled'
    ? null
    : new RateLimitKeyHasher(readFileSync(env.redis.identityHmacKeyFile));

const customRules = {
  '/change-email': { max: 3, window: 10 },
  '/change-password': { max: 3, window: 10 },
  '/email-otp/request-password-reset': { max: 3, window: 60 },
  '/email-otp/send-verification-otp': { max: 3, window: 60 },
  '/forget-password': { max: 3, window: 60 },
  '/request-password-reset': { max: 3, window: 60 },
  '/send-verification-email': { max: 3, window: 60 },
  '/sign-in/*': { max: 3, window: 10 },
  '/sign-up/*': { max: 3, window: 10 },
} as const;

export const betterAuthRateLimitOptions: BetterAuthRateLimitOptions = {
  enabled: true,
  max: 100,
  window: 10,
  customRules,
  ...(runtime.store === null || hasher === null
    ? { storage: 'memory' as const }
    : { customStorage: createBetterAuthRateLimitStorage(runtime.store, hasher) }),
};

export async function initializeAuthorizationTransientStore(): Promise<void> {
  if (runtime.store === null) return;
  try {
    await runtime.store.connect();
    addCounter('zglosto_redis_connections', 1, {
      outcome: 'connected',
      service: 'authorization',
    });
  } catch {
    addCounter('zglosto_redis_connections', 1, {
      outcome: 'fallback',
      service: 'authorization',
    });
  }
}

export async function authorizationRedisReadiness(): Promise<RedisDependencyStatus> {
  if (runtime.store === null) return 'disabled';
  try {
    await runtime.store.connect();
    await runtime.store.ping();
  } catch {
    // The operation observer records the failure and keeps the product in fallback mode.
  }
  return redisStatus;
}

export function closeAuthorizationTransientStore(): void {
  runtime.store?.close();
}
