import { describe, expect, it } from 'vitest';
import {
  ApiErrorCodeSchema,
  CorrelationIdSchema,
  StructuredApiErrorResponseSchema,
} from './platform.js';

describe('platform contracts', () => {
  it('accepts stable error codes and UUID correlation identifiers', () => {
    const correlationId = '018f67c6-ee5c-7270-afa1-cacee418c27f';

    expect(CorrelationIdSchema.parse(correlationId)).toBe(correlationId);
    expect(ApiErrorCodeSchema.parse('VALIDATION_FAILED')).toBe('VALIDATION_FAILED');
    expect(
      StructuredApiErrorResponseSchema.parse({
        correlationId,
        error: 'Invalid request',
        errorCode: 'VALIDATION_FAILED',
        message: 'Invalid request',
      }),
    ).toEqual({
      correlationId,
      error: 'Invalid request',
      errorCode: 'VALIDATION_FAILED',
      message: 'Invalid request',
    });
  });

  it('rejects an unstable error code and non-UUID correlation value', () => {
    expect(ApiErrorCodeSchema.safeParse('some message').success).toBe(false);
    expect(CorrelationIdSchema.safeParse('request-1').success).toBe(false);
  });
});
