export interface LocalRateLimiterConfiguration {
  cleanupIntervalMs: number;
  maxKeys: number;
  maxRequests: number;
  windowMs: number;
}

export type LocalRateLimitRejectionReason = 'capacity' | 'limit';

export type LocalRateLimitDecision =
  | {
      activeKeys: number;
      allowed: true;
      remaining: number;
      resetAfterMs: number;
    }
  | {
      activeKeys: number;
      allowed: false;
      reason: LocalRateLimitRejectionReason;
      retryAfterSeconds: number;
    };

interface Counter {
  count: number;
  resetAt: number;
}

interface LocalRateLimiterDependencies {
  now?: () => number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function retryAfterSeconds(resetAfterMs: number): number {
  return Math.max(1, Math.ceil(resetAfterMs / 1_000));
}

export class LocalRateLimiter {
  readonly #configuration: LocalRateLimiterConfiguration;
  readonly #counters = new Map<string, Counter>();
  readonly #now: () => number;
  readonly #clearInterval: typeof globalThis.clearInterval;
  readonly #cleanupTimer: ReturnType<typeof globalThis.setInterval>;
  #closed = false;

  constructor(
    configuration: LocalRateLimiterConfiguration,
    dependencies: LocalRateLimiterDependencies = {},
  ) {
    this.#configuration = {
      cleanupIntervalMs: positiveInteger('cleanupIntervalMs', configuration.cleanupIntervalMs),
      maxKeys: positiveInteger('maxKeys', configuration.maxKeys),
      maxRequests: positiveInteger('maxRequests', configuration.maxRequests),
      windowMs: positiveInteger('windowMs', configuration.windowMs),
    };
    this.#now = dependencies.now ?? (() => performance.now());
    this.#clearInterval = dependencies.clearInterval ?? globalThis.clearInterval;
    const schedule = dependencies.setInterval ?? globalThis.setInterval;
    this.#cleanupTimer = schedule(() => this.cleanup(), this.#configuration.cleanupIntervalMs);
    this.#cleanupTimer.unref?.();
  }

  get activeKeys(): number {
    return this.#counters.size;
  }

  check(key: string): LocalRateLimitDecision {
    if (this.#closed) {
      throw new Error('LocalRateLimiter is closed');
    }
    if (!key) {
      throw new Error('Rate limit key must not be empty');
    }

    const now = this.#now();
    const existing = this.#counters.get(key);
    if (existing !== undefined && existing.resetAt > now) {
      const resetAfterMs = existing.resetAt - now;
      if (existing.count >= this.#configuration.maxRequests) {
        return {
          activeKeys: this.#counters.size,
          allowed: false,
          reason: 'limit',
          retryAfterSeconds: retryAfterSeconds(resetAfterMs),
        };
      }

      existing.count += 1;
      return {
        activeKeys: this.#counters.size,
        allowed: true,
        remaining: this.#configuration.maxRequests - existing.count,
        resetAfterMs,
      };
    }

    if (existing !== undefined) {
      this.#counters.delete(key);
    }
    if (this.#counters.size >= this.#configuration.maxKeys) {
      this.cleanup(now);
    }
    if (this.#counters.size >= this.#configuration.maxKeys) {
      let earliestReset = Number.POSITIVE_INFINITY;
      for (const counter of this.#counters.values()) {
        earliestReset = Math.min(earliestReset, counter.resetAt);
      }
      return {
        activeKeys: this.#counters.size,
        allowed: false,
        reason: 'capacity',
        retryAfterSeconds: retryAfterSeconds(Math.max(1, earliestReset - now)),
      };
    }

    this.#counters.set(key, {
      count: 1,
      resetAt: now + this.#configuration.windowMs,
    });
    return {
      activeKeys: this.#counters.size,
      allowed: true,
      remaining: this.#configuration.maxRequests - 1,
      resetAfterMs: this.#configuration.windowMs,
    };
  }

  cleanup(now = this.#now()): number {
    let removed = 0;
    for (const [key, counter] of this.#counters) {
      if (counter.resetAt <= now) {
        this.#counters.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#clearInterval(this.#cleanupTimer);
    this.#counters.clear();
  }
}
