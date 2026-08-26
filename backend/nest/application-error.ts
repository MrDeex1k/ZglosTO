import type { ApiErrorCode } from '@zglosto/contracts';

export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 403 | 404 | 409 | 503,
    readonly errorCode: ApiErrorCode,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export function unauthorized(message: string): ApplicationError {
  return new ApplicationError(message, 401, 'UNAUTHORIZED');
}

export function badRequest(message: string): ApplicationError {
  return new ApplicationError(message, 400, 'BAD_REQUEST');
}

export function forbidden(message: string): ApplicationError {
  return new ApplicationError(message, 403, 'FORBIDDEN');
}

export function notFound(message: string): ApplicationError {
  return new ApplicationError(message, 404, 'NOT_FOUND');
}

export function conflict(message: string): ApplicationError {
  return new ApplicationError(message, 409, 'CONFLICT');
}

export function unavailable(message: string): ApplicationError {
  return new ApplicationError(message, 503, 'SERVICE_UNAVAILABLE');
}
