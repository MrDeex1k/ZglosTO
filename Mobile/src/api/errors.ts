const API_ERROR_KINDS = [
  'aborted',
  'configuration',
  'contract',
  'http',
  'network',
  'timeout',
] as const;

export type ApiErrorKind = (typeof API_ERROR_KINDS)[number];

interface ApiErrorOptions {
  cause?: unknown;
  correlationId?: string | null;
  kind: ApiErrorKind;
  status?: number;
}

export class ApiError extends Error {
  readonly correlationId: string | null;
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.correlationId = options.correlationId ?? null;
    this.kind = options.kind;
    this.status = options.status ?? null;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'network' || error.kind === 'timeout') return true;
  return error.kind === 'http' && error.status !== null && error.status >= 500;
}
