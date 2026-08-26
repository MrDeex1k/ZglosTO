import { INCIDENT_STATUSES } from '@zglosto/contracts';
import { describe, expect, test } from 'vitest';

import { ApiError } from '@/api/errors';

import { SERVICE_FILTERS, serviceMutationFailureAction } from './service-phase5-policy';

describe('Phase 5 service contract', () => {
  test('keeps the queue filters aligned with the shared status contract', () => {
    expect(SERVICE_FILTERS).toEqual(['all', ...INCIDENT_STATUSES]);
  });

  test.each([
    [new ApiError('cancelled', { kind: 'aborted' }), 'silent'],
    [new ApiError('offline', { kind: 'network' }), 'retry-manually'],
    [new ApiError('timeout', { kind: 'timeout' }), 'retry-manually'],
    [new ApiError('unauthorized', { kind: 'http', status: 401 }), 'session-expired'],
    [new ApiError('forbidden', { kind: 'http', status: 403 }), 'scope-changed'],
    [new ApiError('not found', { kind: 'http', status: 404 }), 'incident-unavailable'],
    [new ApiError('conflict', { kind: 'http', status: 409 }), 'conflict-refresh'],
    [new ApiError('limited', { kind: 'http', status: 429 }), 'retry-manually'],
    [new ApiError('unavailable', { kind: 'http', status: 503 }), 'retry-manually'],
    [new ApiError('invalid', { kind: 'contract' }), 'show-error'],
  ] as const)('maps %s to %s', (error, expected) => {
    expect(serviceMutationFailureAction(error)).toBe(expected);
  });

  test('does not infer recovery for an untyped error', () => {
    expect(serviceMutationFailureAction(new Error('unknown'))).toBe('show-error');
  });
});
