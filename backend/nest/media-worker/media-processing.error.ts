import type { MediaProcessingFailureCode } from '@zglosto/contracts';

export class MediaProcessingError extends Error {
  readonly failureCode: MediaProcessingFailureCode;
  readonly retryable: boolean;

  constructor(
    failureCode: MediaProcessingFailureCode,
    retryable: boolean,
    message: string,
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.name = 'MediaProcessingError';
    this.failureCode = failureCode;
    this.retryable = retryable;
  }
}

export function asMediaProcessingError(error: unknown): MediaProcessingError {
  return error instanceof MediaProcessingError
    ? error
    : new MediaProcessingError('processing_failed', true, 'Sharp processing failed', {
        cause: error,
      });
}
