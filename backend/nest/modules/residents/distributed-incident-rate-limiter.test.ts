import type { IncidentRateLimitEnvironment } from '@zglosto/contracts';
import { RateLimitKeyHasher } from '@zglosto/rate-limiting';
import type { TransientStore } from '@zglosto/transient-store';
import { describe, expect, it, vi } from 'vitest';
import { DistributedIncidentRateLimiter } from './distributed-incident-rate-limiter.ts';

const configuration: IncidentRateLimitEnvironment = {
  global: { maxRequests: 300, windowMs: 60_000 },
  ip: { maxRequests: 10, windowMs: 900_000 },
  local: {
    cleanupIntervalMs: 60_000,
    maxKeys: 50_000,
    maxRequests: 5,
    windowMs: 10_000,
  },
  user: { maxRequests: 20, windowMs: 900_000 },
};

function transientStore(increment: TransientStore['increment']): TransientStore {
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

describe('DistributedIncidentRateLimiter', () => {
  it('checks global, opaque IP and opaque user buckets in order', async () => {
    const increment = vi.fn<TransientStore['increment']>(async (_key: string, _ttlMs: number) => ({
      resetAfterMs: 30_000,
      value: 1,
    }));
    const limiter = new DistributedIncidentRateLimiter(
      transientStore(increment),
      new RateLimitKeyHasher(Buffer.alloc(32, 3)),
      configuration,
    );

    await expect(
      limiter.check({ clientAddress: '203.0.113.7', userId: 'user-123' }),
    ).resolves.toEqual({ allowed: true, outcome: 'allowed' });

    expect(increment).toHaveBeenCalledTimes(3);
    expect(increment.mock.calls[0]).toEqual(['rate-limit:incident-submit:global', 60_000]);
    expect(increment.mock.calls[1]?.[0]).toMatch(
      /^rate-limit:incident-submit:ip:[A-Za-z0-9_-]{43}$/,
    );
    expect(increment.mock.calls[2]?.[0]).toMatch(
      /^rate-limit:incident-submit:user:[A-Za-z0-9_-]{43}$/,
    );
    expect(JSON.stringify(increment.mock.calls)).not.toContain('203.0.113.7');
    expect(JSON.stringify(increment.mock.calls)).not.toContain('user-123');
  });

  it('returns the precise rejecting scope and Redis TTL', async () => {
    const increment = vi
      .fn<TransientStore['increment']>()
      .mockResolvedValueOnce({ resetAfterMs: 30_000, value: 1 })
      .mockResolvedValueOnce({ resetAfterMs: 61_001, value: 11 });
    const limiter = new DistributedIncidentRateLimiter(
      transientStore(increment),
      new RateLimitKeyHasher(Buffer.alloc(32, 4)),
      configuration,
    );

    await expect(limiter.check({ clientAddress: '203.0.113.7', userId: null })).resolves.toEqual({
      allowed: false,
      outcome: 'rejected',
      retryAfterSeconds: 62,
      scope: 'ip',
    });
  });

  it('falls back to the mandatory local limiter when Redis is unavailable', async () => {
    const limiter = new DistributedIncidentRateLimiter(
      transientStore(async () => {
        throw new Error('Redis unavailable');
      }),
      new RateLimitKeyHasher(Buffer.alloc(32, 5)),
      configuration,
    );

    await expect(limiter.check({ clientAddress: '203.0.113.7', userId: null })).resolves.toEqual({
      allowed: true,
      outcome: 'fallback',
    });
  });

  it('does not require Redis in disabled mode', async () => {
    const limiter = new DistributedIncidentRateLimiter(null, null, configuration);
    await expect(limiter.check({ clientAddress: '203.0.113.7', userId: null })).resolves.toEqual({
      allowed: true,
      outcome: 'disabled',
    });
  });
});
