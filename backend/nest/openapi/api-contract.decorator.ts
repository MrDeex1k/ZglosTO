import { applyDecorators, SerializeOptions } from '@nestjs/common';
import { StructuredApiErrorResponseSchema } from '@zglosto/contracts';
import { ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod';

type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

const errorDescriptions: Readonly<Record<ApiErrorStatus, string>> = {
  400: 'Invalid request',
  401: 'Authentication required or invalid',
  403: 'Insufficient permissions',
  404: 'Resource not found',
  409: 'State conflict',
  413: 'Payload too large',
  429: 'Rate limit exceeded',
  500: 'Internal server error',
  503: 'Required dependency unavailable',
};

export interface ApiContractOptions {
  authenticated: boolean;
  errorStatuses: readonly ApiErrorStatus[];
  serializationSchema?: z.ZodType;
  successSchema: z.ZodType;
  successStatus?: 200 | 201;
}

export function ApiContract(options: ApiContractOptions): MethodDecorator {
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    ApiResponse({
      description: 'Successful response',
      standardSchema: options.successSchema,
      status: options.successStatus ?? 200,
    }),
    SerializeOptions({ schema: options.serializationSchema ?? options.successSchema }),
    ...options.errorStatuses.map((status) =>
      ApiResponse({
        description: errorDescriptions[status],
        standardSchema: StructuredApiErrorResponseSchema,
        status,
      }),
    ),
  ];
  if (options.authenticated) decorators.push(ApiCookieAuth('session'));
  return applyDecorators(...decorators);
}
