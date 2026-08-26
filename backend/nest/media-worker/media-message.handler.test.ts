import { createMessageEnvelopeV1, MEDIA_PROCESS_IMAGE_EVENT } from '@zglosto/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrelationContext } from '../platform/correlation-context.ts';
import { parsePlatformEnvironment } from '../platform/environment.ts';
import {
  StructuredLogger,
  type StructuredLogLevel,
  type StructuredLogRecord,
  type StructuredLogSink,
} from '../platform/structured-logger.ts';
import type { RabbitMqDelivery } from '../modules/jobs/rabbitmq-consumer.service.ts';
import type { ObjectStorageService } from '../modules/storage/object-storage.service.ts';
import type { MediaJobRepository } from './media-job.repository.ts';
import { MediaMessageHandler } from './media-message.handler.ts';
import { MediaProcessingError } from './media-processing.error.ts';
import type { ProcessedImage, SharpImageProcessor } from './sharp-image.processor.ts';

class MemorySink implements StructuredLogSink {
  readonly records: StructuredLogRecord[] = [];
  write(_level: StructuredLogLevel, record: StructuredLogRecord): void {
    this.records.push(record);
  }
}

const envelope = createMessageEnvelopeV1(
  {
    causationId: '019f67c6-ee5c-7270-afa1-cacee418c270',
    correlationId: '019f67c6-ee5c-7270-afa1-cacee418c271',
    messageId: '019f67c6-ee5c-7270-afa1-cacee418c272',
    messageType: MEDIA_PROCESS_IMAGE_EVENT,
    occurredAt: '2026-07-21T12:00:00.000Z',
    traceparent: null,
  },
  {
    attempt: 1,
    contractVersion: 1,
    eventId: '019f67c6-ee5c-7270-afa1-cacee418c272',
    eventType: MEDIA_PROCESS_IMAGE_EVENT,
    imageId: '019f67c6-ee5c-7270-afa1-cacee418c273',
    imageKind: 'report',
    imageRevision: 1,
    incidentId: '019f67c6-ee5c-7270-afa1-cacee418c274',
    jobId: '019f67c6-ee5c-7270-afa1-cacee418c275',
    maxAttempts: 4,
    original: {
      checksumSha256: 'a'.repeat(64),
      mimeType: 'image/png',
      objectKey: 'incident/report/original.png',
      sizeBytes: 68,
    },
    requestedAt: '2026-07-21T12:00:00.000Z',
  },
);

const delivery: RabbitMqDelivery = {
  body: Buffer.from(JSON.stringify(envelope)),
  correlationId: envelope.correlationId,
  messageId: envelope.messageId,
  messageType: envelope.messageType,
  traceparent: envelope.traceparent,
};

const processed: ProcessedImage = {
  body: Buffer.from('webp'),
  height: 20,
  metadata: {
    checksumSha256: 'b'.repeat(64),
    mimeType: 'image/webp',
    objectKey: `${envelope.payload.incidentId}/report/${envelope.payload.imageId}/revision-1.webp`,
    sizeBytes: 4,
  },
  width: 10,
};

function setup(processError: Error | null = null) {
  const jobs = {
    claim: vi.fn(async () => 'claimed' as const),
    complete: vi.fn(async () => 'applied' as const),
    markRetry: vi.fn(async () => Promise.resolve()),
    markTerminalFailure: vi.fn(async () => 'applied' as const),
  };
  const storage = {
    deleteObject: vi.fn(async () => Promise.resolve()),
    getObject: vi.fn(async () => ({
      body: Buffer.from('source'),
      checksumSha256: 'a'.repeat(64),
      contentType: 'image/png',
      objectKey: envelope.payload.original.objectKey,
      sizeBytes: 68,
    })),
    putObject: vi.fn(async () => ({
      checksumSha256: processed.metadata.checksumSha256,
      etag: null,
      objectKey: processed.metadata.objectKey,
      sizeBytes: processed.metadata.sizeBytes,
      versionId: null,
    })),
  };
  const processor = {
    process:
      processError === null
        ? vi.fn(async () => processed)
        : vi.fn(async () => Promise.reject(processError)),
  };
  const sink = new MemorySink();
  const originalCleanup = { cleanupOne: vi.fn(async () => Promise.resolve()) };
  const handler = new MediaMessageHandler(
    new CorrelationContext(),
    jobs as unknown as MediaJobRepository,
    new StructuredLogger(
      new CorrelationContext(),
      sink,
      parsePlatformEnvironment({ SERVICE_NAME: 'media_worker' }),
    ),
    originalCleanup as never,
    processor as unknown as SharpImageProcessor,
    storage as unknown as ObjectStorageService,
  );
  return { handler, jobs, originalCleanup, processor, sink, storage };
}

describe('MediaMessageHandler', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('stores WebP and atomically completes a valid job', async () => {
    const { handler, jobs, originalCleanup, storage } = setup();
    await expect(handler.handle(delivery)).resolves.toEqual({ kind: 'ack' });
    expect(storage.putObject).toHaveBeenCalledWith({
      body: processed.body,
      checksumSha256: processed.metadata.checksumSha256,
      contentType: 'image/webp',
      objectKey: processed.metadata.objectKey,
    });
    expect(jobs.complete).toHaveBeenCalledWith(envelope, processed);
    expect(originalCleanup.cleanupOne).toHaveBeenCalledWith(
      envelope.payload.imageId,
      envelope.payload.imageRevision,
      envelope.payload.original.objectKey,
    );
  });

  it('publishes retry with an incremented attempt after a transient failure', async () => {
    const { handler, jobs } = setup(
      new MediaProcessingError('processing_failed', true, 'temporary failure'),
    );
    const disposition = await handler.handle(delivery);
    expect(disposition.kind).toBe('retry');
    if (disposition.kind !== 'retry') throw new Error('Expected retry disposition');
    expect(disposition.retryQueue).toBe('zglosto.media.process.retry.5s.v1');
    expect(JSON.parse(Buffer.from(disposition.body).toString('utf8'))).toMatchObject({
      causationId: envelope.messageId,
      messageId: envelope.messageId,
      payload: { attempt: 2 },
    });
    expect(jobs.markRetry).toHaveBeenCalledWith(envelope.payload, 'processing_failed', 5_000);
  });

  it('dead-letters permanent failures and exhausted retries', async () => {
    const permanent = setup(new MediaProcessingError('invalid_content', false, 'invalid'));
    await expect(permanent.handler.handle(delivery)).resolves.toEqual({ kind: 'dead-letter' });
    expect(permanent.jobs.markTerminalFailure).toHaveBeenCalledWith(
      envelope,
      'invalid_content',
      false,
    );

    const exhaustedEnvelope = {
      ...envelope,
      payload: { ...envelope.payload, attempt: envelope.payload.maxAttempts },
    };
    const exhausted = setup(new MediaProcessingError('storage_read_failed', true, 'offline'));
    await expect(
      exhausted.handler.handle({
        ...delivery,
        body: Buffer.from(JSON.stringify(exhaustedEnvelope)),
      }),
    ).resolves.toEqual({ kind: 'dead-letter' });
    expect(exhausted.jobs.markTerminalFailure).toHaveBeenCalledWith(
      exhaustedEnvelope,
      'storage_read_failed',
      true,
    );
  });

  it('dead-letters malformed envelopes without touching infrastructure', async () => {
    const { handler, jobs, storage } = setup();
    await expect(handler.handle({ ...delivery, body: Buffer.from('{}') })).resolves.toEqual({
      kind: 'dead-letter',
    });
    expect(jobs.claim).not.toHaveBeenCalled();
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});
