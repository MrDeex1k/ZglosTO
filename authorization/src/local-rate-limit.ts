import {
  CorrelationIdSchema,
  StructuredApiErrorResponseSchema,
  type CorrelationId,
} from '@zglosto/contracts';
import { getConnInfo } from '@hono/node-server/conninfo';
import { addCounter, recordHistogram } from '@zglosto/observability';
import {
  RateLimitKeyHasher,
  resolveClientAddress,
  type LocalRateLimiter,
  type LocalRateLimitDecision,
} from '@zglosto/rate-limiting';
import type { Context, MiddlewareHandler } from 'hono';

interface AuthorizationVariables {
  clientAddress: string;
  correlationId: CorrelationId;
}

export type AuthorizationHonoEnvironment = { Variables: AuthorizationVariables };

interface AuthorizationLocalRateLimitOptions {
  localRateLimiter: LocalRateLimiter;
  peerAddress?: (context: Context<AuthorizationHonoEnvironment>) => string | null;
  trustedProxyHops: number;
}

export function createAuthorizationLocalRateLimitMiddleware(
  options: AuthorizationLocalRateLimitOptions,
): MiddlewareHandler<AuthorizationHonoEnvironment> {
  const keyHasher = new RateLimitKeyHasher();
  const peerAddress =
    options.peerAddress ?? ((context) => getConnInfo(context).remote.address ?? null);

  return async (context, next) => {
    if (context.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const clientAddress = resolveClientAddress({
      forwardedFor: context.req.header('x-forwarded-for') ?? null,
      peerAddress: peerAddress(context),
      trustedProxyHops: options.trustedProxyHops,
    });
    const decision = options.localRateLimiter.check(
      keyHasher.hash('authorization:ip', clientAddress),
    );
    context.set('clientAddress', clientAddress);
    recordAuthorizationRateLimitDecision(decision);
    if (decision.allowed) {
      await next();
      return;
    }

    context.header('cache-control', 'no-store');
    context.header('retry-after', decision.retryAfterSeconds.toString());
    return context.json(
      StructuredApiErrorResponseSchema.parse({
        correlationId: CorrelationIdSchema.parse(context.get('correlationId')),
        error: 'Too many requests',
        errorCode: 'RATE_LIMITED',
        message: 'Too many requests',
      }),
      429,
    );
  };
}

function recordAuthorizationRateLimitDecision(decision: LocalRateLimitDecision): void {
  const attributes = {
    outcome: decision.allowed ? 'allowed' : 'rejected',
    reason: decision.allowed ? 'within_limit' : decision.reason,
    scope: 'authorization',
    service: 'authorization',
  };
  addCounter('zglosto_rate_limit_local_requests', 1, attributes);
  recordHistogram('zglosto_rate_limit_local_active_keys', decision.activeKeys, {
    scope: 'authorization',
    service: 'authorization',
  });
}
