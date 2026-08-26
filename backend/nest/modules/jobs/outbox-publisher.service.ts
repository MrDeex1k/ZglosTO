import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { addCounter } from '@zglosto/observability';
import { validateRabbitMqEnvironment } from '../../../config/env.ts';
import { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import { StructuredLogger } from '../../platform/structured-logger.ts';
import { OutboxRepository } from './outbox.repository.ts';
import { MessageBrokerPublisher } from './rabbitmq.service.ts';

const OUTBOX_PUBLISH_ERROR = 'broker_publish_failed';

@Injectable()
export class OutboxPublisherService implements OnApplicationBootstrap {
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly broker: MessageBrokerPublisher,
    private readonly outbox: OutboxRepository,
    private readonly logger: StructuredLogger,
    shutdown: GracefulShutdownRegistry,
  ) {
    shutdown.register({ name: 'outbox-publisher', close: () => this.close() });
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    const environment = validateRabbitMqEnvironment();
    if (!environment.publisherEnabled) return;
    this.schedule(0);
  }

  async tickOnce(): Promise<void> {
    const environment = validateRabbitMqEnvironment();
    let messages: Awaited<ReturnType<OutboxRepository['claimBatch']>>;
    try {
      messages = await this.outbox.claimBatch(environment.batchSize, environment.lockTimeoutMs);
    } catch (error: unknown) {
      addCounter('zglosto_outbox_messages', 1, { result: 'claim_failed' });
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : 'unknown',
          event: 'outbox.claim.failed',
        },
        OutboxPublisherService.name,
      );
      return;
    }
    if (messages.length === 0) return;
    const ids = messages.map(({ id }) => id);

    try {
      await this.broker.publishConfirmed(
        messages.map(({ envelope, exchange, routingKey }) => ({
          body: Buffer.from(JSON.stringify(envelope)),
          correlationId: envelope.correlationId,
          exchange,
          messageId: envelope.messageId,
          messageType: envelope.messageType,
          routingKey,
          traceparent: envelope.traceparent,
        })),
      );
      await this.outbox.markPublished(ids);
      addCounter('zglosto_outbox_messages', ids.length, { result: 'published' });
      this.logger.log(
        { count: ids.length, event: 'outbox.batch.published' },
        OutboxPublisherService.name,
      );
    } catch (error: unknown) {
      await this.outbox.markFailed(ids, OUTBOX_PUBLISH_ERROR, environment.reconnectDelayMs);
      addCounter('zglosto_outbox_messages', ids.length, { result: 'failed' });
      this.logger.warn(
        {
          count: ids.length,
          error: error instanceof Error ? error.message : 'unknown',
          event: 'outbox.batch.failed',
        },
        OutboxPublisherService.name,
      );
    }
  }

  async close(): Promise<void> {
    this.stopping = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.activeTick;
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const environment = validateRabbitMqEnvironment();
      this.activeTick = this.tickOnce().finally(() => {
        this.activeTick = null;
        this.schedule(environment.pollIntervalMs);
      });
    }, delayMs);
    this.timer.unref();
  }
}
