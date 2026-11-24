import type { AMQPMessage } from '@cloudamqp/amqp-client';
import { afterEach, expect, test, vi } from 'vitest';
import type { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import type { StructuredLogger } from '../../platform/structured-logger.ts';
import { RabbitMqConsumerService, type RabbitMqSubscription } from './rabbitmq-consumer.service.ts';
import type { MessageBrokerPublisher, RabbitMqService } from './rabbitmq.service.ts';

const { waitForRetry } = vi.hoisted(() => ({
  waitForRetry: vi.fn<(delayMs: number) => Promise<void>>(),
}));
vi.mock('node:timers/promises', () => ({ setTimeout: waitForRetry }));

afterEach(() => {
  vi.unstubAllEnvs();
  waitForRetry.mockReset();
});

test('backs off requeues for database and retry publication errors, then resets on success', async () => {
  vi.stubEnv('RABBITMQ_URL', 'amqps://app:secret@rabbitmq:5671/zglosto');
  vi.stubEnv('RABBITMQ_TLS_CA_PATH', '/tmp/rabbitmq-ca.crt');
  vi.stubEnv('RABBITMQ_SERVER_NAME', 'rabbitmq');
  vi.stubEnv('RABBITMQ_RECONNECT_DELAY_MS', '1000');

  const consume =
    vi.fn<
      (queue: string, options: { noAck: boolean }, deliver: (message: AMQPMessage) => void) => void
    >();
  const channel = {
    basicConsume: consume,
    exchangeDeclare: vi.fn(),
    prefetch: vi.fn(),
    queueBind: vi.fn(),
    queueDeclare: vi.fn(),
  };
  const publishConfirmed = vi.fn().mockRejectedValue(new Error('broker unavailable'));
  const service = new RabbitMqConsumerService(
    { publishConfirmed } as unknown as MessageBrokerPublisher,
    { createChannel: async () => channel, closeChannel: vi.fn() } as unknown as RabbitMqService,
    { warn: vi.fn() } as unknown as StructuredLogger,
    { register: vi.fn() } as unknown as GracefulShutdownRegistry,
  );
  try {
    const handle = vi
      .fn<RabbitMqSubscription['handle']>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ kind: 'retry', body: new Uint8Array(0), retryQueue: 'retry' })
      .mockResolvedValueOnce({ kind: 'ack' })
      .mockRejectedValueOnce(new Error('database unavailable again'));
    await service.subscribe({ consumerName: 'test', handle, prefetch: 1, queue: 'process' });
    const deliver = consume.mock.calls[0]![2];
    const ack = vi.fn();
    const nack = vi.fn();
    const message = { ack, nack, properties: {} } as unknown as AMQPMessage;

    let finishFirstDelay: (() => void) | undefined;
    waitForRetry
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstDelay = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    deliver(message);
    await vi.waitFor(() => expect(waitForRetry).toHaveBeenCalledOnce());
    expect(nack).not.toHaveBeenCalled();
    expect(finishFirstDelay).toBeDefined();
    finishFirstDelay?.();
    await vi.waitFor(() => expect(nack).toHaveBeenCalledExactlyOnceWith(true));

    deliver(message);
    await vi.waitFor(() => expect(nack).toHaveBeenCalledTimes(2));
    expect(publishConfirmed).toHaveBeenCalledOnce();

    deliver(message);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());

    deliver(message);
    await vi.waitFor(() => expect(nack).toHaveBeenCalledTimes(3));
    expect(waitForRetry.mock.calls.map(([delayMs]) => delayMs)).toEqual([1_000, 2_000, 1_000]);
  } finally {
    await service.close();
  }
});
