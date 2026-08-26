import { readFileSync } from 'node:fs';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { RedisDependencyStatus } from '@zglosto/contracts';
import { addCounter, recordHistogram, setGauge } from '@zglosto/observability';
import { RateLimitKeyHasher } from '@zglosto/rate-limiting';
import {
  createTransientStoreRuntime,
  type TransientStore,
  type TransientStoreOperationEvent,
  type TransientStoreRuntime,
} from '@zglosto/transient-store';
import { RUNTIME_CONFIGURATION, type RuntimeConfiguration } from './runtime-configuration.ts';
import { StructuredLogger } from './structured-logger.ts';

@Injectable()
export class TransientStoreService implements OnModuleInit, OnModuleDestroy {
  readonly #hasher: RateLimitKeyHasher | null;
  readonly #logger: StructuredLogger;
  readonly #mode: RuntimeConfiguration['redis']['mode'];
  readonly #runtime: TransientStoreRuntime;
  #status: RedisDependencyStatus;

  constructor(
    @Inject(RUNTIME_CONFIGURATION) configuration: RuntimeConfiguration,
    logger: StructuredLogger,
  ) {
    this.#logger = logger;
    this.#mode = configuration.redis.mode;
    this.#status = this.#mode === 'disabled' ? 'disabled' : 'down';
    this.#runtime = createTransientStoreRuntime(configuration.redis, {
      onOperation: (event) => this.#recordOperation(event),
    });
    this.#hasher =
      configuration.redis.mode === 'disabled'
        ? null
        : new RateLimitKeyHasher(readFileSync(configuration.redis.identityHmacKeyFile));
    this.#recordStatus(this.#status);
  }

  get hasher(): RateLimitKeyHasher | null {
    return this.#hasher;
  }

  get store(): TransientStore | null {
    return this.#runtime.store;
  }

  async readiness(): Promise<RedisDependencyStatus> {
    if (this.#runtime.store === null) return 'disabled';
    try {
      await this.#runtime.store.connect();
      await this.#runtime.store.ping();
    } catch {
      // The operation observer records the transition and metrics.
    }
    return this.#status;
  }

  async onModuleInit(): Promise<void> {
    if (this.#runtime.store === null) return;
    try {
      await this.#runtime.store.connect();
      addCounter('zglosto_redis_connections', 1, {
        outcome: 'connected',
        service: 'backend',
      });
    } catch {
      addCounter('zglosto_redis_connections', 1, {
        outcome: 'fallback',
        service: 'backend',
      });
      this.#logger.warn(
        { event: 'redis.connection.degraded', mode: this.#runtime.mode },
        TransientStoreService.name,
      );
    }
  }

  onModuleDestroy(): void {
    this.#runtime.store?.close();
  }

  #recordOperation(event: TransientStoreOperationEvent): void {
    const attributes = {
      operation: event.operation,
      outcome: event.outcome,
      redis_mode: this.#mode,
      service: 'backend',
    };
    addCounter('zglosto_redis_operations', 1, attributes);
    recordHistogram(
      'zglosto_redis_operation_duration_seconds',
      event.durationMs / 1_000,
      attributes,
    );
    this.#recordStatus(event.outcome === 'success' ? 'up' : 'down');
  }

  #recordStatus(status: RedisDependencyStatus): void {
    const previous = this.#status;
    this.#status = status;
    setGauge('zglosto_redis_dependency_up', status === 'down' ? 0 : 1, {
      redis_mode: this.#mode,
      service: 'backend',
    });
    if (previous !== status && status === 'down') {
      this.#logger.warn(
        { event: 'redis.connection.degraded', mode: this.#mode },
        TransientStoreService.name,
      );
    }
    if (previous === 'down' && status === 'up') {
      this.#logger.log(
        { event: 'redis.connection.recovered', mode: this.#mode },
        TransientStoreService.name,
      );
    }
  }
}
