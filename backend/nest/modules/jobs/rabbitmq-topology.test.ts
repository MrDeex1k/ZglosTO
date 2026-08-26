import { describe, expect, it, vi } from 'vitest';
import { declareRabbitMqTopology, type RabbitMqTopologyChannel } from './rabbitmq-topology.ts';

describe('declareRabbitMqTopology', () => {
  it('declares durable quorum main, retry and dead-letter queues', async () => {
    const channel: RabbitMqTopologyChannel = {
      exchangeDeclare: vi.fn().mockResolvedValue({}),
      queueDeclare: vi.fn().mockResolvedValue({}),
      queueBind: vi.fn().mockResolvedValue({}),
    };

    await declareRabbitMqTopology(channel);

    expect(channel.exchangeDeclare).toHaveBeenCalledTimes(4);
    expect(channel.queueDeclare).toHaveBeenCalledTimes(10);
    expect(channel.queueBind).toHaveBeenCalledTimes(4);
    expect(channel.queueDeclare).toHaveBeenCalledWith(
      'zglosto.media.process.retry.5s.v1',
      { durable: true },
      {
        'x-dead-letter-exchange': 'zglosto.media.v1',
        'x-dead-letter-routing-key': 'media.image.process.v1',
        'x-message-ttl': 5_000,
        'x-queue-type': 'quorum',
      },
    );
  });
});
