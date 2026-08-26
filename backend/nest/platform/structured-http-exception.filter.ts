import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  ApiErrorCodeSchema,
  CorrelationIdSchema,
  StructuredApiErrorResponseSchema,
  type ApiErrorCode,
} from '@zglosto/contracts';
import type { Request, Response } from 'express';
import { ApplicationError } from '../application-error.ts';
import { CorrelationContext } from './correlation-context.ts';
import { correlationIdHeader } from './request-context.middleware.ts';
import { StructuredLogger } from './structured-logger.ts';

function statusErrorCode(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PAYLOAD_TOO_LARGE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

function statusMessage(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'Invalid request';
    case HttpStatus.UNAUTHORIZED:
      return 'Unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'Forbidden';
    case HttpStatus.NOT_FOUND:
      return 'Not found';
    case HttpStatus.CONFLICT:
      return 'Conflict';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'Payload too large';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too many requests';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'Service unavailable';
    default:
      return 'Internal server error';
  }
}

function exceptionErrorCode(exception: unknown, statusCode: number): ApiErrorCode {
  if (exception instanceof ApplicationError) {
    return exception.errorCode;
  }
  if (exception instanceof HttpException) {
    const parsed = ApiErrorCodeSchema.safeParse(exception.errorCode);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return statusErrorCode(statusCode);
}

function exceptionStatus(exception: unknown): number {
  if (exception instanceof ApplicationError) {
    return exception.statusCode;
  }
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (exception instanceof Error && exception.name === 'PayloadTooLargeError') {
    return HttpStatus.PAYLOAD_TOO_LARGE;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function exceptionSummary(exception: unknown): Record<string, string> {
  return exception instanceof Error
    ? { message: exception.message, name: exception.name }
    : { type: 'unknown' };
}

@Catch()
export class StructuredHttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly correlationContext: CorrelationContext,
    private readonly logger: StructuredLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const statusCode = exceptionStatus(exception);
    const errorCode = exceptionErrorCode(exception, statusCode);
    const message = statusMessage(statusCode);
    const correlationId =
      this.correlationContext.currentId() ?? CorrelationIdSchema.parse(randomUUID());

    response.setHeader(correlationIdHeader, correlationId);
    response.status(statusCode).json(
      StructuredApiErrorResponseSchema.parse({
        correlationId,
        error: message,
        errorCode,
        message,
      }),
    );

    const logEntry = {
      error: exceptionSummary(exception),
      errorCode,
      event: 'http.request.failed',
      method: request.method,
      path: request.originalUrl,
      statusCode,
    };
    const writeLog = () => {
      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(logEntry, StructuredHttpExceptionFilter.name);
        return;
      }
      this.logger.warn(logEntry, StructuredHttpExceptionFilter.name);
    };
    if (this.correlationContext.currentId() === null) {
      this.correlationContext.run(correlationId, null, writeLog);
      return;
    }
    writeLog();
  }
}
