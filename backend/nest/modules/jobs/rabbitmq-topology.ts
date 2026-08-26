import { LLM_CLASSIFICATION_TOPOLOGY_V1, MEDIA_PROCESSING_TOPOLOGY_V1 } from '@zglosto/contracts';

export interface RabbitMqTopologyChannel {
  exchangeDeclare(exchange: string, type: string, options: { durable: boolean }): Promise<unknown>;
  queueDeclare(
    queue: string,
    options: { durable: boolean },
    arguments_: Readonly<Record<string, number | string>>,
  ): Promise<unknown>;
  queueBind(queue: string, exchange: string, routingKey: string): Promise<unknown>;
}

interface RetryQueueDefinition {
  readonly delayMs: number;
  readonly queue: string;
}

interface JobTopology {
  readonly deadLetterExchange: string;
  readonly deadLetterQueue: string;
  readonly deadLetterRoutingKey: string;
  readonly exchange: string;
  readonly processingQueue: string;
  readonly retryQueues: readonly RetryQueueDefinition[];
  readonly routingKey: string;
}

const topologies: readonly JobTopology[] = [
  MEDIA_PROCESSING_TOPOLOGY_V1,
  LLM_CLASSIFICATION_TOPOLOGY_V1,
];

async function assertTopology(
  channel: RabbitMqTopologyChannel,
  topology: JobTopology,
): Promise<void> {
  await channel.exchangeDeclare(topology.exchange, 'topic', { durable: true });
  await channel.exchangeDeclare(topology.deadLetterExchange, 'direct', { durable: true });
  await channel.queueDeclare(
    topology.processingQueue,
    { durable: true },
    {
      'x-dead-letter-exchange': topology.deadLetterExchange,
      'x-dead-letter-routing-key': topology.deadLetterRoutingKey,
      'x-queue-type': 'quorum',
    },
  );
  await channel.queueBind(topology.processingQueue, topology.exchange, topology.routingKey);

  for (const retry of topology.retryQueues) {
    // oxlint-disable-next-line no-await-in-loop -- RabbitMQ declarations are ordered and idempotent.
    await channel.queueDeclare(
      retry.queue,
      { durable: true },
      {
        'x-dead-letter-exchange': topology.exchange,
        'x-dead-letter-routing-key': topology.routingKey,
        'x-message-ttl': retry.delayMs,
        'x-queue-type': 'quorum',
      },
    );
  }

  await channel.queueDeclare(
    topology.deadLetterQueue,
    { durable: true },
    { 'x-queue-type': 'quorum' },
  );
  await channel.queueBind(
    topology.deadLetterQueue,
    topology.deadLetterExchange,
    topology.deadLetterRoutingKey,
  );
}

export async function declareRabbitMqTopology(channel: RabbitMqTopologyChannel): Promise<void> {
  for (const topology of topologies) {
    // oxlint-disable-next-line no-await-in-loop -- Each topology must be fully declared before use.
    await assertTopology(channel, topology);
  }
}
