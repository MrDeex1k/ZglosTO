export class MobileAuthOperationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    message: string,
    options: { code?: string | undefined; status?: number | undefined },
  ) {
    super(message);
    this.name = 'MobileAuthOperationError';
    this.code = options.code ?? 'UNKNOWN';
    this.status = options.status ?? 0;
  }
}
