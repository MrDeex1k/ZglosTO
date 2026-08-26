export interface TransientIncrementResult {
  value: number;
  resetAfterMs: number;
}

export interface TransientStore {
  acquireLease(key: string, token: string, ttlMs: number): Promise<boolean>;
  close(): void;
  connect(): Promise<void>;
  delete(key: string): Promise<boolean>;
  get(key: string): Promise<string | null>;
  increment(key: string, ttlMs: number): Promise<TransientIncrementResult>;
  ping(): Promise<void>;
  releaseLease(key: string, token: string): Promise<boolean>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
}

export class TransientStoreOperationError extends Error {
  constructor(
    readonly operation:
      | 'acquire-lease'
      | 'connect'
      | 'delete'
      | 'get'
      | 'increment'
      | 'ping'
      | 'release-lease'
      | 'set',
    options: ErrorOptions,
  ) {
    super(`Transient store operation failed: ${operation}`, options);
    this.name = 'TransientStoreOperationError';
  }
}
