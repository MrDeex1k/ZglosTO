import { readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { AMQPChannel, AMQPClient, type AMQPMessage } from '@cloudamqp/amqp-client';
import { MEDIA_PROCESSING_TOPOLOGY_V1 } from '@zglosto/contracts';
import { addCounter, injectTraceContext } from '@zglosto/observability';
import { validateRabbitMqEnvironment } from '../../../config/env.ts';
import { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import { PLATFORM_ENVIRONMENT, type PlatformEnvironment } from '../../platform/environment.ts';
import { StructuredLogger } from '../../platform/structured-logger.ts';
import { declareRabbitMqTopology } from './rabbitmq-topology.ts';

export interface BrokerPublication {
  body: Uint8Array;
  correlationId: string;
  exchange: string;
  messageId: string;
  messageType: string;
  routingKey: string;
  traceparent: string | null;
}

export abstract class MessageBrokerPublisher {
  abstract publishConfirmed(messages: readonly BrokerPublication[]): Promise<void>;
}

@Injectable()
export class RabbitMqService extends MessageBrokerPublisher {
  private connection: AMQPClient | null = null;
  private connectionPromise: Promise<AMQPClient> | null = null;
  private closed = false;

  constructor(
    shutdown: GracefulShutdownRegistry,
    private readonly logger: StructuredLogger,
    @Inject(PLATFORM_ENVIRONMENT) private readonly platform: PlatformEnvironment,
  ) {
    super();
    shutdown.register({ name: 'rabbitmq-connection', close: () => this.close() });
  }

  async publishConfirmed(messages: readonly BrokerPublication[]): Promise<void> {
    if (messages.length === 0) return;
    const channel = await this.createChannel();
    const returnedMessageIds = new Set<string>();
    channel.onReturn = (message: AMQPMessage): void => {
      if (typeof message.properties.messageId === 'string') {
        returnedMessageIds.add(message.properties.messageId);
      }
    };

    try {
      await this.withTimeout(
        declareRabbitMqTopology(channel),
        10_000,
        'RabbitMQ topology declaration timed out',
      );
      await channel.confirmSelect();
      for (const message of messages) {
        const traceHeaders = injectTraceContext();
        if (message.traceparent !== null && !('traceparent' in traceHeaders)) {
          traceHeaders.traceparent = message.traceparent;
        }
        // Sequential confirms keep the batch outcome unambiguous for the PostgreSQL outbox.
        // oxlint-disable-next-line no-await-in-loop
        await this.withTimeout(
          channel.basicPublish(
            message.exchange,
            message.routingKey,
            message.body,
            {
              appId: `zglosto-${this.platform.serviceName.replace('_', '-')}`,
              contentType: 'application/json',
              correlationId: message.correlationId,
              deliveryMode: 2,
              headers: traceHeaders,
              messageId: message.messageId,
              timestamp: new Date(),
              type: message.messageType,
            },
            true,
          ),
          10_000,
          `RabbitMQ publisher confirm timed out for ${message.messageId}`,
        );
        addCounter('zglosto_rabbitmq_messages_published', 1, {
          'messaging.destination.name': message.exchange,
          'messaging.operation.name': 'publish',
        });
      }
      if (returnedMessageIds.size > 0) {
        throw new Error(
          `RabbitMQ returned unroutable messages: ${[...returnedMessageIds].join(', ')}`,
        );
      }
    } finally {
      await this.closeChannel(channel);
    }
  }

  async createChannel(): Promise<AMQPChannel> {
    return (await this.connect()).channel();
  }

  async closeChannel(channel: AMQPChannel): Promise<void> {
    const closed = await this.settleWithin(channel.close(), 2_000);
    if (!closed) {
      this.logger.warn({ event: 'rabbitmq.channel.close_timeout' }, RabbitMqService.name);
      this.destroySocket(channel.connection);
    }
  }

  async check(): Promise<void> {
    const channel = await this.createChannel();
    try {
      await declareRabbitMqTopology(channel);
      await channel.exchangeDeclare(MEDIA_PROCESSING_TOPOLOGY_V1.exchange, 'topic', {
        passive: true,
      });
    } finally {
      await this.closeChannel(channel);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const connection = this.connection ?? (await this.connectionPromise?.catch(() => null)) ?? null;
    this.connection = null;
    this.connectionPromise = null;
    if (connection !== null) {
      const closed = await this.settleWithin(connection.close(), 2_000);
      if (!closed) {
        this.logger.warn({ event: 'rabbitmq.connection.close_timeout' }, RabbitMqService.name);
        this.destroySocket(connection);
      }
    }
  }

  private connect(): Promise<AMQPClient> {
    if (this.closed) return Promise.reject(new Error('RabbitMQ connection is closed'));
    if (this.connection !== null && !this.connection.closed)
      return Promise.resolve(this.connection);
    this.connection = null;

    if (this.connectionPromise === null) {
      const environment = validateRabbitMqEnvironment();
      const url = new URL(environment.url);
      url.searchParams.set('heartbeat', String(environment.heartbeatSeconds));
      url.searchParams.set('name', `zglosto-${this.platform.serviceName.replace('_', '-')}`);
      const tlsOptions = {
        ca: readFileSync(environment.tlsCaPath),
        minVersion: 'TLSv1.3' as const,
        rejectUnauthorized: true,
        servername: environment.serverName,
      };
      const client = new AMQPClient(url.toString(), tlsOptions);
      client.onerror = (error): void => {
        this.logger.warn(
          { error: error.message, event: 'rabbitmq.connection.error' },
          RabbitMqService.name,
        );
      };
      client.ondisconnect = (error): void => {
        if (this.connection === client) this.connection = null;
        if (error instanceof Error) {
          this.logger.warn(
            { error: error.message, event: 'rabbitmq.connection.disconnected' },
            RabbitMqService.name,
          );
        }
      };
      this.connectionPromise = client.connect().then(
        () => {
          this.connection = client;
          this.connectionPromise = null;
          return client;
        },
        (error: unknown) => {
          this.connectionPromise = null;
          throw error;
        },
      );
    }
    return this.connectionPromise;
  }

  private withTimeout<Result>(
    operation: Promise<Result>,
    timeoutMs: number,
    message: string,
  ): Promise<Result> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => finish(() => reject(new Error(message))), timeoutMs);
      operation.then(
        (result) => finish(() => resolve(result)),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  private async settleWithin(operation: Promise<void>, timeoutMs: number): Promise<boolean> {
    const timeoutResult = Symbol('timeout');
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
      const result = await Promise.race([
        operation.then(
          () => true,
          () => true,
        ),
        new Promise<typeof timeoutResult>((resolve) => {
          timer = setTimeout(() => resolve(timeoutResult), timeoutMs);
        }),
      ]);

      return result !== timeoutResult;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  private destroySocket(connection: unknown): void {
    const runtime = connection as { socket?: { destroy(): void } };
    runtime.socket?.destroy();
  }
}
