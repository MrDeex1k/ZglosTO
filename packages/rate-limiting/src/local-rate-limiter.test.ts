import { describe, expect, it, vi } from 'vitest';
import { LocalRateLimiter } from './local-rate-limiter.js';

function createLimiter(overrides: Partial<ConstructorParameters<typeof LocalRateLimiter>[0]> = {}) {
  let now = 1_000;
  const clearInterval = vi.fn();
  const timer = { unref: vi.fn() };
  const setInterval = vi.fn(
    (_callback: () => void, _milliseconds: number) =>
      timer as unknown as ReturnType<typeof globalThis.setInterval>,
  );
  const limiter = new LocalRateLimiter(
    {
      cleanupIntervalMs: 60_000,
      maxKeys: 2,
      maxRequests: 2,
      windowMs: 10_000,
      ...overrides,
    },
    {
      clearInterval: clearInterval as typeof globalThis.clearInterval,
      now: () => now,
      setInterval: setInterval as unknown as typeof globalThis.setInterval,
    },
  );
  return {
    advanceBy: (milliseconds: number) => {
      now += milliseconds;
    },
    clearInterval,
    limiter,
    setInterval,
    timer,
  };
}

describe('LocalRateLimiter', () => {
  it('allows the configured fixed-window budget and returns an integer Retry-After', () => {
    const { limiter } = createLimiter();

    expect(limiter.check('client-a')).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('client-a')).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check('client-a')).toEqual({
      activeKeys: 1,
      allowed: false,
      reason: 'limit',
      retryAfterSeconds: 10,
    });
    limiter.close();
  });

  it('uses a monotonic injected clock and resets only after the window expires', () => {
    const { advanceBy, limiter } = createLimiter({ maxRequests: 1 });

    expect(limiter.check('client-a').allowed).toBe(true);
    advanceBy(9_001);
    expect(limiter.check('client-a')).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    advanceBy(999);
    expect(limiter.check('client-a')).toMatchObject({ allowed: true, remaining: 0 });
    limiter.close();
  });

  it('bounds memory and fails closed for a new key until capacity expires', () => {
    const { advanceBy, limiter } = createLimiter({ maxKeys: 2 });

    limiter.check('client-a');
    limiter.check('client-b');
    expect(limiter.activeKeys).toBe(2);
    expect(limiter.check('client-c')).toMatchObject({
      activeKeys: 2,
      allowed: false,
      reason: 'capacity',
    });

    advanceBy(10_000);
    expect(limiter.check('client-c')).toMatchObject({ activeKeys: 1, allowed: true });
    limiter.close();
  });

  it('schedules cleanup, releases all state on close and closes idempotently', () => {
    const { clearInterval, limiter, setInterval, timer } = createLimiter();
    limiter.check('client-a');

    expect(setInterval).toHaveBeenCalledOnce();
    expect(typeof setInterval.mock.calls[0]?.[0]).toBe('function');
    expect(setInterval.mock.calls[0]?.[1]).toBe(60_000);
    expect(timer.unref).toHaveBeenCalledOnce();
    limiter.close();
    limiter.close();

    expect(clearInterval).toHaveBeenCalledOnce();
    expect(limiter.activeKeys).toBe(0);
    expect(() => limiter.check('client-a')).toThrow('LocalRateLimiter is closed');
  });

  it('rejects invalid configuration and empty keys', () => {
    expect(() => createLimiter({ maxRequests: 0 })).toThrow(
      'maxRequests must be a positive integer',
    );
    const { limiter } = createLimiter();
    expect(() => limiter.check('')).toThrow('Rate limit key must not be empty');
    limiter.close();
  });
});
