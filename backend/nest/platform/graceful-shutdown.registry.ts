import { Injectable } from '@nestjs/common';
import { shutdownObservability } from '@zglosto/observability/register';
import { StructuredLogger } from './structured-logger.ts';

export interface GracefulShutdownResource {
  close(): Promise<void>;
  readonly name: string;
}

@Injectable()
export class GracefulShutdownRegistry {
  private readonly resources = new Map<string, GracefulShutdownResource>();
  private drainPromise: Promise<void> | null = null;

  constructor(private readonly logger: StructuredLogger) {
    this.resources.set('open-telemetry', {
      close: shutdownObservability,
      name: 'open-telemetry',
    });
  }

  register(resource: GracefulShutdownResource): () => void {
    if (this.drainPromise !== null) {
      throw new Error(`Cannot register ${resource.name} after shutdown has started`);
    }
    if (this.resources.has(resource.name)) {
      throw new Error(`Shutdown resource already registered: ${resource.name}`);
    }
    this.resources.set(resource.name, resource);
    return () => {
      this.resources.delete(resource.name);
    };
  }

  drain(): Promise<void> {
    if (this.drainPromise === null) {
      this.drainPromise = this.closeResources([...this.resources.values()].reverse());
    }
    return this.drainPromise;
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.drain();
  }

  private async closeResources(resources: readonly GracefulShutdownResource[]): Promise<void> {
    const failures: unknown[] = [];
    for (const resource of resources) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Reverse-order shutdown preserves resource dependencies.
        await resource.close();
        this.logger.log(
          { event: 'shutdown.resource.closed', resource: resource.name },
          GracefulShutdownRegistry.name,
        );
      } catch (error: unknown) {
        failures.push(error);
        this.logger.error(
          { event: 'shutdown.resource.failed', resource: resource.name },
          GracefulShutdownRegistry.name,
        );
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, 'One or more resources failed to close');
    }
  }
}
