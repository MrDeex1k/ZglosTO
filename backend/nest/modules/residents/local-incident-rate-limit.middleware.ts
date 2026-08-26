import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type NestMiddleware,
  type OnModuleDestroy,
} from '@nestjs/common';
import { addCounter, recordHistogram } from '@zglosto/observability';
import {
  LocalRateLimiter,
  RateLimitKeyHasher,
  resolveClientAddress,
  type LocalRateLimitDecision,
} from '@zglosto/rate-limiting';
import type { NextFunction, Request, Response } from 'express';
import {
  RUNTIME_CONFIGURATION,
  type RuntimeConfiguration,
} from '../../platform/runtime-configuration.ts';

@Injectable()
export class LocalIncidentRateLimitMiddleware implements NestMiddleware, OnModuleDestroy {
  readonly #configuration: RuntimeConfiguration;
  readonly #hasher = new RateLimitKeyHasher();
  readonly #limiter: LocalRateLimiter;

  constructor(@Inject(RUNTIME_CONFIGURATION) configuration: RuntimeConfiguration) {
    this.#configuration = configuration;
    this.#limiter = new LocalRateLimiter(configuration.incidentRateLimit.local);
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const clientAddress = resolveClientAddress({
      forwardedFor: request.get('x-forwarded-for') ?? null,
      peerAddress: request.socket.remoteAddress ?? null,
      trustedProxyHops: this.#configuration.clientAddress.trustedProxyHops,
    });
    const decision = this.#limiter.check(this.#hasher.hash('incident-submit:ip', clientAddress));
    recordIncidentRateLimitDecision(decision);
    if (decision.allowed) {
      next();
      return;
    }

    response.setHeader('cache-control', 'no-store');
    response.setHeader('retry-after', decision.retryAfterSeconds.toString());
    next(
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS, {
        errorCode: 'RATE_LIMITED',
      }),
    );
  }

  onModuleDestroy(): void {
    this.#limiter.close();
  }
}

function recordIncidentRateLimitDecision(decision: LocalRateLimitDecision): void {
  const attributes = {
    outcome: decision.allowed ? 'allowed' : 'rejected',
    reason: decision.allowed ? 'within_limit' : decision.reason,
    scope: 'incident-submit',
    service: 'backend',
  };
  addCounter('zglosto_rate_limit_local_requests', 1, attributes);
  recordHistogram('zglosto_rate_limit_local_active_keys', decision.activeKeys, {
    scope: 'incident-submit',
    service: 'backend',
  });
}
