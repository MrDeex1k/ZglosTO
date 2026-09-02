import { addCounter, recordHistogram } from '@zglosto/observability';
import { RateLimitKeyHasher } from '@zglosto/rate-limiting';
import type { TransientStore } from '@zglosto/transient-store';
import type { BetterAuthRateLimitOptions } from 'better-auth';

export type BetterAuthRateLimitStorage = NonNullable<BetterAuthRateLimitOptions['customStorage']>;

function retryAfterSeconds(resetAfterMs: number): number {
  return Math.max(1, Math.ceil(resetAfterMs / 1_000));
}

function recordDecision(outcome: 'allowed' | 'fallback' | 'rejected', durationMs: number): void {
  const attributes = {
    outcome,
    scope: 'better-auth',
    service: 'authorization',
    storage: 'redis',
  };
  addCounter('zglosto_rate_limit_distributed_requests', 1, attributes);
  recordHistogram('zglosto_rate_limit_distributed_duration_seconds', durationMs / 1_000, {
    outcome,
    scope: 'better-auth',
    service: 'authorization',
  });
}

export function createBetterAuthRateLimitStorage(
  store: TransientStore,
  keyHasher: RateLimitKeyHasher,
): BetterAuthRateLimitStorage {
  return {
    consume: async (key, rule) => {
      const startedAt = performance.now();
      try {
        const result = await store.increment(
          `rate-limit:better-auth:${keyHasher.hash('better-auth', key)}`,
          rule.window * 1_000,
        );
        const allowed = result.value <= rule.max;
        recordDecision(allowed ? 'allowed' : 'rejected', performance.now() - startedAt);
        return {
          allowed,
          retryAfter: allowed ? null : retryAfterSeconds(result.resetAfterMs),
        };
      } catch {
        recordDecision('fallback', performance.now() - startedAt);
        return { allowed: true, retryAfter: null };
      }
    },
  };
}
