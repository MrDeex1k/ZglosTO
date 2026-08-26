import { INCIDENT_STATUSES } from '@zglosto/contracts';

import { ApiError } from '@/api/errors';

export const SERVICE_FILTERS = ['all', ...INCIDENT_STATUSES] as const;

export type ServiceFilter = (typeof SERVICE_FILTERS)[number];

export type ServiceMutationFailureAction =
  | 'conflict-refresh'
  | 'incident-unavailable'
  | 'retry-manually'
  | 'scope-changed'
  | 'session-expired'
  | 'silent'
  | 'show-error';

/**
 * Frozen Phase 5 error semantics. Mutations are never queued for automatic replay;
 * every retry remains an explicit field-worker decision.
 */
export function serviceMutationFailureAction(error: unknown): ServiceMutationFailureAction {
  if (!(error instanceof ApiError)) return 'show-error';
  if (error.kind === 'aborted') return 'silent';
  if (error.kind === 'network' || error.kind === 'timeout') return 'retry-manually';
  if (error.kind !== 'http') return 'show-error';

  if (error.status === 401) return 'session-expired';
  if (error.status === 403) return 'scope-changed';
  if (error.status === 404) return 'incident-unavailable';
  if (error.status === 409) return 'conflict-refresh';
  if (error.status === 429 || (error.status !== null && error.status >= 500)) {
    return 'retry-manually';
  }
  return 'show-error';
}
