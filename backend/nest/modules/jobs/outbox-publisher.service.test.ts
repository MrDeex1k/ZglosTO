import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import { StructuredLogger } from '../../platform/structured-logger.ts';
import { OutboxPublisherService } from './outbox-publisher.service.ts';
import { OutboxRepository, type ClaimedOutboxMessage } from './outbox.repository.ts';
import { MessageBrokerPublisher, type BrokerPublication } from './rabbitmq.service.ts';

const message: ClaimedOutboxMessage = {
  envelope: {
    causationId: '019b1234-5678-7123-8123-123456789abc',
    contractVersion: 1,
    correlationId: '019b1234-5678-7123-8123-123456789abc',
    messageId: '019b1234-5678-7123-8123-123456789abd',
    messageType: 'media.image.process.requested',
    occurredAt: '2026-07-20T10:00:00.000Z',
    payload: {
      attempt: 1,
      contractVersion: 1,
      eventId: '019b1234-5678-7123-8123-123456789abd',
      eventType: 'media.image.process.requested',
      imageId: '019b1234-5678-7123-8123-123456789abe',
      imageKind: 'report',
      imageRevision: 1,
      incidentId: '019b1234-5678-7123-8123-123456789abf',
      jobId: '019b1234-5678-7123-8123-123456789ac0',
      maxAttempts: 4,
      original: {
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        objectKey: 'incidents/example/original.jpg',
        sizeBytes: 10,
      },
      requestedAt: '2026-07-20T10:00:00.000Z',
    },
    traceparent: null,
  },
  exchange: 'zglosto.media.v1',
  id: '019b1234-5678-7123-8123-123456789abd',
  publishAttempts: 1,
  routingKey: 'media.image.process.v1',
};

class BrokerStub extends MessageBrokerPublisher {
  readonly publishConfirmed = vi.fn<(messages: readonly BrokerPublication[]) => Promise<void>>();
}

function makeService(broker: BrokerStub, outbox: OutboxRepository): OutboxPublisherService {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as StructuredLogger;
  const shutdown = { register: vi.fn() } as unknown as GracefulShutdownRegistry;
  return new OutboxPublisherService(broker, outbox, logger, shutdown);
}

describe('OutboxPublisherService', () => {
  beforeEach(() => {
    process.env.RABBITMQ_URL = 'amqps://app:secret@rabbitmq:5671/zglosto';
    process.env.RABBITMQ_TLS_CA_PATH = '/tmp/rabbitmq-ca.crt';
    process.env.RABBITMQ_SERVER_NAME = 'rabbitmq';
  });

  it('marks a batch published only after broker confirmation', async () => {
    const order: string[] = [];
    const broker = new BrokerStub();
    broker.publishConfirmed.mockImplementation(async () => {
      order.push('confirm');
    });
    const outbox = {
      claimBatch: vi.fn().mockResolvedValue([message]),
      markFailed: vi.fn(),
      markPublished: vi.fn().mockImplementation(async () => {
        order.push('published');
      }),
    } as unknown as OutboxRepository;

    await makeService(broker, outbox).tickOnce();

    expect(order).toEqual(['confirm', 'published']);
    expect(outbox.markFailed).not.toHaveBeenCalled();
    expect(
      JSON.parse(Buffer.from(broker.publishConfirmed.mock.calls[0]![0][0]!.body).toString()),
    ).toEqual(message.envelope);
  });

  it('releases a failed batch for retry when confirmation fails', async () => {
    const broker = new BrokerStub();
    broker.publishConfirmed.mockRejectedValue(new Error('broker unavailable'));
    const outbox = {
      claimBatch: vi.fn().mockResolvedValue([message]),
      markFailed: vi.fn().mockImplementation(async () => {}),
      markPublished: vi.fn(),
    } as unknown as OutboxRepository;

    await makeService(broker, outbox).tickOnce();

    expect(outbox.markFailed).toHaveBeenCalledWith([message.id], 'broker_publish_failed', 1_000);
    expect(outbox.markPublished).not.toHaveBeenCalled();
  });

  it('keeps the publisher loop alive while the database is temporarily unavailable', async () => {
    const broker = new BrokerStub();
    const outbox = {
      claimBatch: vi.fn().mockRejectedValue(new Error('database unavailable')),
      markFailed: vi.fn(),
      markPublished: vi.fn(),
    } as unknown as OutboxRepository;

    await expect(makeService(broker, outbox).tickOnce()).resolves.toBeUndefined();

    expect(broker.publishConfirmed).not.toHaveBeenCalled();
    expect(outbox.markFailed).not.toHaveBeenCalled();
    expect(outbox.markPublished).not.toHaveBeenCalled();
  });
});
