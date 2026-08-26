import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { CorrelationIdSchema, TRACEPARENT_PATTERN, type CorrelationId } from '@zglosto/contracts';
import { addCounter, recordHistogram } from '@zglosto/observability';
import type { NextFunction, Request, Response } from 'express';
import { CorrelationContext } from './correlation-context.ts';
import { StructuredLogger } from './structured-logger.ts';

export const correlationIdHeader = 'x-correlation-id';

function requestCorrelationId(request: Request): CorrelationId {
  const parsed = CorrelationIdSchema.safeParse(request.get(correlationIdHeader));
  return parsed.success ? parsed.data : CorrelationIdSchema.parse(randomUUID());
}

function requestTraceparent(request: Request): string | null {
  const value = request.get('traceparent')?.trim().toLowerCase() ?? null;
  return value !== null && TRACEPARENT_PATTERN.test(value) ? value : null;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly correlationContext: CorrelationContext,
    private readonly logger: StructuredLogger,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = requestCorrelationId(request);
    const startedAt = performance.now();
    response.setHeader(correlationIdHeader, correlationId);

    this.correlationContext.run(correlationId, requestTraceparent(request), () => {
      response.once('finish', () => {
        const durationSeconds = (performance.now() - startedAt) / 1_000;
        const route = request.route?.path;
        const normalizedRoute = typeof route === 'string' ? route : 'unmatched';
        const metricAttributes = {
          'http.request.method': request.method,
          'http.response.status_code': response.statusCode,
          'http.route': normalizedRoute,
        };
        addCounter('zglosto_http_server_requests', 1, metricAttributes);
        recordHistogram('zglosto_http_server_duration_seconds', durationSeconds, metricAttributes);
        this.logger.log(
          {
            durationMs: Math.round(durationSeconds * 100_000) / 100,
            event: 'http.request.completed',
            method: request.method,
            route: normalizedRoute,
            statusCode: response.statusCode,
          },
          RequestContextMiddleware.name,
        );
      });
      next();
    });
  }
}
