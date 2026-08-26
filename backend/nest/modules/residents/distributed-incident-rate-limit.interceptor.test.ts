import { HttpException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfiguration } from '../../platform/runtime-configuration.ts';
import type { AuthRequestContext } from '../auth-bridge/auth-request-context.ts';
import { DistributedIncidentRateLimitInterceptor } from './distributed-incident-rate-limit.interceptor.ts';
import type { DistributedIncidentRateLimiter } from './distributed-incident-rate-limiter.ts';

const configuration = {
  clientAddress: { trustedProxyHops: 1 },
} as RuntimeConfiguration;

function executionContext(response: Response): ExecutionContext {
  const request = {
    get: () => '198.51.100.1, 203.0.113.7',
    socket: { remoteAddress: '172.20.0.4' },
  } as unknown as Request;
  return {
    switchToHttp: () => ({
      getNext: vi.fn(),
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('DistributedIncidentRateLimitInterceptor', () => {
  it('uses the verified user and returns the shared 429 headers', async () => {
    const response = { setHeader: vi.fn() } as unknown as Response;
    const check = vi.fn(async () => ({
      allowed: false as const,
      outcome: 'rejected' as const,
      retryAfterSeconds: 12,
      scope: 'user' as const,
    }));
    const interceptor = new DistributedIncidentRateLimitInterceptor(
      { user: vi.fn(() => ({ id: 'verified-user' })) } as unknown as AuthRequestContext,
      { check } as unknown as DistributedIncidentRateLimiter,
      configuration,
    );
    const next = { handle: vi.fn(() => of('created')) } as unknown as CallHandler;

    const error = await interceptor
      .intercept(executionContext(response), next)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).errorCode).toBe('RATE_LIMITED');
    expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('retry-after', '12');
    expect(check).toHaveBeenCalledWith({
      clientAddress: '203.0.113.7',
      userId: 'verified-user',
    });
    expect(next.handle).not.toHaveBeenCalled();
  });
});
