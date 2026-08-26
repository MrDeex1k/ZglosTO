import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { CorrelationId } from '@zglosto/contracts';

interface CorrelationStore {
  correlationId: CorrelationId;
  traceparent: string | null;
}

@Injectable()
export class CorrelationContext {
  private readonly storage = new AsyncLocalStorage<CorrelationStore>();

  run<Result>(
    correlationId: CorrelationId,
    traceparent: string | null,
    operation: () => Result,
  ): Result {
    return this.storage.run({ correlationId, traceparent }, operation);
  }

  currentId(): CorrelationId | null {
    return this.storage.getStore()?.correlationId ?? null;
  }

  currentTraceparent(): string | null {
    return this.storage.getStore()?.traceparent ?? null;
  }
}
