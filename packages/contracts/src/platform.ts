import { z } from 'zod';

export const CorrelationIdSchema = z.uuid();

export const ApiErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export const StructuredApiErrorResponseSchema = z
  .object({
    correlationId: CorrelationIdSchema,
    error: z.string(),
    errorCode: ApiErrorCodeSchema,
    message: z.string(),
  })
  .strict();

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type StructuredApiErrorResponse = z.infer<typeof StructuredApiErrorResponseSchema>;
