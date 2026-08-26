import { RateLimitKeyHasher } from '@zglosto/rate-limiting';
import type { TransientIncrementResult, TransientStore } from '@zglosto/transient-store';
import { describe, expect, it, vi } from 'vitest';
import { createBetterAuthRateLimitStorage } from './better-auth-rate-limit-storage.ts';

function transientStore(
  increment: (key: string, ttlMs: number) => Promise<TransientIncrementResult>,
): TransientStore {
  return {
    acquireLease: vi.fn(),
    close: vi.fn(),
    connect: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    increment,
    ping: vi.fn(),
    releaseLease: vi.fn(),
    set: vi.fn(),
  };
}

describe('Better Auth distributed rate-limit storage', () => {
  it('uses an opaque stable key and converts the Better Auth window to milliseconds', async () => {
    const increment = vi.fn<TransientStore['increment']>(async (_key: string, _ttlMs: number) => ({
      resetAfterMs: 4_200,
      value: 4,
    }));
    const storage = createBetterAuthRateLimitStorage(
      transientStore(increment),
      new RateLimitKeyHasher(Buffer.alloc(32, 7)),
    );

    await expect(
      storage.consume?.('203.0.113.7-/sign-in/email', { max: 3, window: 10 }),
    ).resolves.toEqual({ allowed: false, retryAfter: 5 });
    expect(increment).toHaveBeenCalledWith(
      expect.stringMatching(/^rate-limit:better-auth:[A-Za-z0-9_-]{43}$/),
      10_000,
    );
    expect(increment.mock.calls[0]?.[0]).not.toContain('203.0.113.7');
  });

  it('allows the request when Redis fails because the local limiter remains active', async () => {
    const storage = createBetterAuthRateLimitStorage(
      transientStore(async () => {
        throw new Error('Redis unavailable');
      }),
      new RateLimitKeyHasher(Buffer.alloc(32, 8)),
    );

    await expect(
      storage.consume?.('client-/sign-up/email', { max: 3, window: 10 }),
    ).resolves.toEqual({ allowed: true, retryAfter: null });
  });
});
