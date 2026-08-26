import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { addCounter } from '@zglosto/observability';
import { resolveClientAddress } from '@zglosto/rate-limiting';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import {
  RUNTIME_CONFIGURATION,
  type RuntimeConfiguration,
} from '../../platform/runtime-configuration.ts';
import { AuthRequestContext } from '../auth-bridge/auth-request-context.ts';
import {
  DistributedIncidentRateLimiter,
  type DistributedIncidentRateLimitDecision,
} from './distributed-incident-rate-limiter.ts';

@Injectable()
export class DistributedIncidentRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly authContext: AuthRequestContext,
    private readonly limiter: DistributedIncidentRateLimiter,
    @Inject(RUNTIME_CONFIGURATION) private readonly configuration: RuntimeConfiguration,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const decision = await this.limiter.check({
      clientAddress: resolveClientAddress({
        forwardedFor: request.get('x-forwarded-for') ?? null,
        peerAddress: request.socket.remoteAddress ?? null,
        trustedProxyHops: this.configuration.clientAddress.trustedProxyHops,
      }),
      userId: this.authContext.user(request)?.id ?? null,
    });
    recordDecision(decision);
    if (decision.allowed) return next.handle();

    response.setHeader('cache-control', 'no-store');
    response.setHeader('retry-after', decision.retryAfterSeconds.toString());
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS, {
      errorCode: 'RATE_LIMITED',
    });
  }
}

function recordDecision(decision: DistributedIncidentRateLimitDecision): void {
  addCounter('zglosto_rate_limit_distributed_requests', 1, {
    outcome: decision.outcome,
    scope: decision.allowed ? 'incident-submit' : decision.scope,
    service: 'backend',
    storage: 'redis',
  });
}
