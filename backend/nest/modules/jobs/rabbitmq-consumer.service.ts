import { Injectable } from '@nestjs/common';
import type { AMQPChannel, AMQPMessage } from '@cloudamqp/amqp-client';
import {
  addCounter,
  extractedTraceContext,
  recordHistogram,
  withSpan,
} from '@zglosto/observability';
import { validateRabbitMqEnvironment } from '../../../config/env.ts';
import { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import { StructuredLogger } from '../../platform/structured-logger.ts';
import { MessageBrokerPublisher, RabbitMqService } from './rabbitmq.service.ts';
import { declareRabbitMqTopology } from './rabbitmq-topology.ts';

export type MessageDisposition =
  | { kind: 'ack' }
  | { kind: 'dead-letter' }
  | { body: Uint8Array; kind: 'retry'; retryQueue: string };

export interface RabbitMqDelivery {
  body: Uint8Array;
  correlationId: string;
  messageId: string;
  messageType: string;
  traceparent: string | null;
}

export interface RabbitMqSubscription {
  consumerName: string;
  handle(message: RabbitMqDelivery): Promise<MessageDisposition>;
  prefetch: number;
  queue: string;
}

@Injectable()
export class RabbitMqConsumerService {
  private readonly subscriptions = new Map<
    string,
    { channel: AMQPChannel | null; definition: RabbitMqSubscription }
  >();
  private supervisor: NodeJS.Timeout | null = null;
  private activeReconciliation: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly broker: MessageBrokerPublisher,
    private readonly rabbitMq: RabbitMqService,
    private readonly logger: StructuredLogger,
    shutdown: GracefulShutdownRegistry,
  ) {
    shutdown.register({ name: 'rabbitmq-consumers', close: () => this.close() });
  }

  async subscribe(subscription: RabbitMqSubscription): Promise<void> {
    if (this.stopping) throw new Error('RabbitMQ consumers are stopping');
    if (this.subscriptions.has(subscription.consumerName)) {
      throw new Error(`RabbitMQ consumer is already registered: ${subscription.consumerName}`);
    }
    const registration = { channel: null, definition: subscription };
    this.subscriptions.set(subscription.consumerName, registration);
    try {
      await this.activate(registration);
    } catch (error: unknown) {
      this.logger.warn(
        {
          consumer: subscription.consumerName,
          error: error instanceof Error ? error.message : 'unknown',
          event: 'rabbitmq.consumer.initial_connection_failed',
        },
        RabbitMqConsumerService.name,
      );
    }
    this.scheduleSupervisor();
  }

  private async activate(registration: {
    channel: AMQPChannel | null;
    definition: RabbitMqSubscription;
  }): Promise<void> {
    const channel = await this.rabbitMq.createChannel();
    try {
      await declareRabbitMqTopology(channel);
      await channel.prefetch(registration.definition.prefetch);
      await channel.basicConsume(registration.definition.queue, { noAck: false }, (message) => {
        void this.handleDelivery(message, registration.definition);
      });
      registration.channel = channel;
    } catch (error: unknown) {
      await this.rabbitMq.closeChannel(channel);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.supervisor !== null) clearTimeout(this.supervisor);
    this.supervisor = null;
    await this.activeReconciliation;
    const channels = [...this.subscriptions.values()].flatMap(({ channel }) =>
      channel === null ? [] : [channel],
    );
    this.subscriptions.clear();
    await Promise.all(channels.map((channel) => this.rabbitMq.closeChannel(channel)));
  }

  private scheduleSupervisor(): void {
    if (this.stopping || this.supervisor !== null || this.subscriptions.size === 0) return;
    const delay = validateRabbitMqEnvironment().reconnectDelayMs;
    this.supervisor = setTimeout(() => {
      this.supervisor = null;
      this.activeReconciliation = this.reconcileSubscriptions().finally(() => {
        this.activeReconciliation = null;
        this.scheduleSupervisor();
      });
    }, delay);
  }

  private async reconcileSubscriptions(): Promise<void> {
    for (const registration of this.subscriptions.values()) {
      if (this.stopping) return;
      if (registration.channel !== null && !registration.channel.closed) continue;
      registration.channel = null;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each durable subscription recovers independently.
        await this.activate(registration);
        this.logger.log(
          {
            consumer: registration.definition.consumerName,
            event: 'rabbitmq.consumer.recovered',
          },
          RabbitMqConsumerService.name,
        );
      } catch (error: unknown) {
        this.logger.warn(
          {
            consumer: registration.definition.consumerName,
            error: error instanceof Error ? error.message : 'unknown',
            event: 'rabbitmq.consumer.recovery_failed',
          },
          RabbitMqConsumerService.name,
        );
      }
    }
  }

  private async handleDelivery(
    message: AMQPMessage,
    subscription: RabbitMqSubscription,
  ): Promise<void> {
    try {
      const body = message.body ?? new Uint8Array();
      const headers = this.stringHeaders(message.properties.headers);
      const startedAt = performance.now();
      const disposition = await withSpan(
        `rabbitmq ${subscription.queue} process`,
        {
          'messaging.destination.name': subscription.queue,
          'messaging.operation.name': 'process',
          'messaging.system': 'rabbitmq',
        },
        () =>
          subscription.handle({
            body,
            correlationId: this.stringProperty(message.properties.correlationId),
            messageId: this.stringProperty(message.properties.messageId),
            messageType: this.stringProperty(message.properties.type),
            traceparent: headers.traceparent ?? null,
          }),
        extractedTraceContext(headers),
      );
      const metricAttributes = {
        consumer: subscription.consumerName,
        disposition: disposition.kind,
        queue: subscription.queue,
      };
      addCounter('zglosto_rabbitmq_messages_consumed', 1, metricAttributes);
      recordHistogram(
        'zglosto_rabbitmq_processing_duration_seconds',
        (performance.now() - startedAt) / 1_000,
        metricAttributes,
      );
      if (disposition.kind === 'ack') {
        await message.ack();
        return;
      }
      if (disposition.kind === 'dead-letter') {
        await message.nack(false);
        return;
      }

      await this.broker.publishConfirmed([
        {
          body: disposition.body,
          correlationId: this.stringProperty(message.properties.correlationId),
          exchange: '',
          messageId: this.stringProperty(message.properties.messageId),
          messageType: this.stringProperty(message.properties.type),
          routingKey: disposition.retryQueue,
          traceparent: headers.traceparent ?? null,
        },
      ]);
      await message.ack();
    } catch (error: unknown) {
      this.logger.warn(
        {
          consumer: subscription.consumerName,
          error: error instanceof Error ? error.message : 'unknown',
          event: 'rabbitmq.delivery.failed',
        },
        RabbitMqConsumerService.name,
      );
      try {
        await message.nack(true);
      } catch {
        this.logger.warn(
          { consumer: subscription.consumerName, event: 'rabbitmq.delivery.requeue_failed' },
          RabbitMqConsumerService.name,
        );
      }
    }
  }

  private stringProperty(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private stringHeaders(value: unknown): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]: [string, unknown]) =>
        typeof entry === 'string' ? [[key, entry]] : [],
      ),
    );
  }
}
