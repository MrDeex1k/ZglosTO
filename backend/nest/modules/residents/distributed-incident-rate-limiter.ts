import type { DistributedRateLimitRule, IncidentRateLimitEnvironment } from '@zglosto/contracts';
import type { RateLimitKeyHasher } from '@zglosto/rate-limiting';
import type { TransientStore } from '@zglosto/transient-store';

export type DistributedRateLimitScope = 'global' | 'ip' | 'user';

export type DistributedIncidentRateLimitDecision =
  | { allowed: true; outcome: 'allowed' | 'disabled' | 'fallback' }
  | {
      allowed: false;
      outcome: 'rejected';
      retryAfterSeconds: number;
      scope: DistributedRateLimitScope;
    };

export interface DistributedIncidentRateLimitInput {
  clientAddress: string;
  userId: string | null;
}

export class DistributedIncidentRateLimiter {
  readonly #configuration: IncidentRateLimitEnvironment;
  readonly #hasher: RateLimitKeyHasher | null;
  readonly #store: TransientStore | null;

  constructor(
    store: TransientStore | null,
    hasher: RateLimitKeyHasher | null,
    configuration: IncidentRateLimitEnvironment,
  ) {
    if ((store === null) !== (hasher === null)) {
      throw new Error('Distributed limiter store and identity hasher must be enabled together');
    }
    this.#configuration = configuration;
    this.#hasher = hasher;
    this.#store = store;
  }

  async check(
    input: DistributedIncidentRateLimitInput,
  ): Promise<DistributedIncidentRateLimitDecision> {
    if (this.#store === null || this.#hasher === null) {
      return { allowed: true, outcome: 'disabled' };
    }

    try {
      const globalRejection = await this.#rejection(
        'rate-limit:incident-submit:global',
        'global',
        this.#configuration.global,
      );
      if (globalRejection !== null) return globalRejection;

      const ipRejection = await this.#rejection(
        `rate-limit:incident-submit:ip:${this.#hasher.hash(
          'incident-submit:ip',
          input.clientAddress,
        )}`,
        'ip',
        this.#configuration.ip,
      );
      if (ipRejection !== null) return ipRejection;

      if (input.userId !== null) {
        const userRejection = await this.#rejection(
          `rate-limit:incident-submit:user:${this.#hasher.hash(
            'incident-submit:user',
            input.userId,
          )}`,
          'user',
          this.#configuration.user,
        );
        if (userRejection !== null) return userRejection;
      }

      return { allowed: true, outcome: 'allowed' };
    } catch {
      return { allowed: true, outcome: 'fallback' };
    }
  }

  async #rejection(
    key: string,
    scope: DistributedRateLimitScope,
    rule: DistributedRateLimitRule,
  ): Promise<Extract<DistributedIncidentRateLimitDecision, { allowed: false }> | null> {
    if (this.#store === null) return null;
    const result = await this.#store.increment(key, rule.windowMs);
    return result.value <= rule.maxRequests
      ? null
      : {
          allowed: false,
          outcome: 'rejected',
          retryAfterSeconds: Math.max(1, Math.ceil(result.resetAfterMs / 1_000)),
          scope,
        };
  }
}
