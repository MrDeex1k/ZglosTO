import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  CorrelationIdSchema,
  MEDIA_PROCESS_IMAGE_EVENT,
  MEDIA_PROCESSING_TOPOLOGY_V1,
  parseMediaProcessImageRequestedV1,
  parseMessageEnvelopeV1,
  type MediaProcessImageRequestedV1,
  type MessageEnvelopeV1,
} from '@zglosto/contracts';
import { addCounter, recordHistogram } from '@zglosto/observability';
import { ObjectStorageService } from '../modules/storage/object-storage.service.ts';
import { CorrelationContext } from '../platform/correlation-context.ts';
import { StructuredLogger } from '../platform/structured-logger.ts';
import type {
  MessageDisposition,
  RabbitMqDelivery,
} from '../modules/jobs/rabbitmq-consumer.service.ts';
import { MediaJobRepository } from './media-job.repository.ts';
import { MediaOriginalCleanupService } from './media-original-cleanup.service.ts';
import { asMediaProcessingError, MediaProcessingError } from './media-processing.error.ts';
import { SharpImageProcessor } from './sharp-image.processor.ts';

const MAX_MESSAGE_BYTES = 64 * 1024;

@Injectable()
export class MediaMessageHandler {
  constructor(
    private readonly correlationContext: CorrelationContext,
    private readonly jobs: MediaJobRepository,
    private readonly logger: StructuredLogger,
    private readonly originalCleanup: MediaOriginalCleanupService,
    private readonly processor: SharpImageProcessor,
    private readonly storage: ObjectStorageService,
  ) {}

  async handle(delivery: RabbitMqDelivery): Promise<MessageDisposition> {
    let envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>;
    try {
      envelope = this.parseDelivery(delivery);
    } catch (error: unknown) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : 'unknown',
          event: 'media_worker.message.invalid',
        },
        MediaMessageHandler.name,
      );
      return { kind: 'dead-letter' };
    }

    return this.correlationContext.run(
      CorrelationIdSchema.parse(envelope.correlationId),
      envelope.traceparent,
      () => this.process(envelope),
    );
  }

  private async process(
    envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>,
  ): Promise<MessageDisposition> {
    if ((await this.jobs.claim(envelope)) === 'terminal') return { kind: 'ack' };
    const startedAt = performance.now();
    const outputKey = `${envelope.payload.incidentId}/${envelope.payload.imageKind}/${envelope.payload.imageId}/revision-${envelope.payload.imageRevision}.webp`;

    try {
      const source = await this.loadSource(envelope.payload.original.objectKey);
      const processed = await this.processor.process(source, envelope.payload.original, outputKey);
      await this.storeResult(processed);
      const completion = await this.jobs.complete(envelope, processed);
      if (completion === 'superseded') {
        await this.deleteBestEffort(outputKey);
      } else {
        await this.originalCleanup.cleanupOne(
          envelope.payload.imageId,
          envelope.payload.imageRevision,
          envelope.payload.original.objectKey,
        );
      }
      this.logger.log(
        {
          event: 'media_worker.image.succeeded',
          height: processed.height,
          imageId: envelope.payload.imageId,
          result: completion,
          width: processed.width,
        },
        MediaMessageHandler.name,
      );
      addCounter('zglosto_media_images_processed', 1, { result: completion });
      recordHistogram(
        'zglosto_media_processing_duration_seconds',
        (performance.now() - startedAt) / 1_000,
        { result: completion },
      );
      return { kind: 'ack' };
    } catch (error: unknown) {
      return this.handleFailure(envelope, asMediaProcessingError(error));
    }
  }

  private async handleFailure(
    envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>,
    error: MediaProcessingError,
  ): Promise<MessageDisposition> {
    const { attempt, maxAttempts } = envelope.payload;
    if (!error.retryable || attempt >= maxAttempts) {
      const deadLettered = error.retryable && attempt >= maxAttempts;
      await this.jobs.markTerminalFailure(envelope, error.failureCode, deadLettered);
      this.logger.warn(
        {
          attempt,
          event: 'media_worker.image.failed',
          failureCode: error.failureCode,
          imageId: envelope.payload.imageId,
          terminalState: deadLettered ? 'dead_lettered' : 'failed',
        },
        MediaMessageHandler.name,
      );
      addCounter('zglosto_media_images_failed', 1, {
        failure_code: error.failureCode,
        terminal_state: deadLettered ? 'dead_lettered' : 'failed',
      });
      return { kind: 'dead-letter' };
    }

    const retry = MEDIA_PROCESSING_TOPOLOGY_V1.retryQueues[attempt - 1];
    if (!retry) {
      await this.jobs.markTerminalFailure(envelope, error.failureCode, true);
      return { kind: 'dead-letter' };
    }
    await this.jobs.markRetry(envelope.payload, error.failureCode, retry.delayMs);
    const retryEnvelope: MessageEnvelopeV1<MediaProcessImageRequestedV1> = {
      ...envelope,
      causationId: envelope.messageId,
      occurredAt: new Date().toISOString(),
      payload: { ...envelope.payload, attempt: attempt + 1 },
    };
    return {
      body: Buffer.from(JSON.stringify(retryEnvelope)),
      kind: 'retry',
      retryQueue: retry.queue,
    };
  }

  private parseDelivery(
    delivery: RabbitMqDelivery,
  ): MessageEnvelopeV1<MediaProcessImageRequestedV1> {
    if (delivery.body.byteLength === 0 || delivery.body.byteLength > MAX_MESSAGE_BYTES) {
      throw new Error('RabbitMQ media message has an invalid size');
    }
    const value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(delivery.body),
    ) as unknown;
    const envelope = parseMessageEnvelopeV1(value, parseMediaProcessImageRequestedV1);
    if (
      envelope.messageType !== MEDIA_PROCESS_IMAGE_EVENT ||
      delivery.messageId !== envelope.messageId ||
      delivery.messageType !== envelope.messageType ||
      delivery.correlationId !== envelope.correlationId
    ) {
      throw new Error('RabbitMQ properties do not match the media envelope');
    }
    return envelope;
  }

  private async loadSource(objectKey: string) {
    try {
      return await this.storage.getObject(objectKey);
    } catch (error: unknown) {
      throw new MediaProcessingError('storage_read_failed', true, 'Could not read source image', {
        cause: error,
      });
    }
  }

  private async storeResult(
    processed: Awaited<ReturnType<SharpImageProcessor['process']>>,
  ): Promise<void> {
    try {
      await this.storage.putObject({
        body: processed.body,
        checksumSha256: processed.metadata.checksumSha256,
        contentType: processed.metadata.mimeType,
        objectKey: processed.metadata.objectKey,
      });
    } catch (error: unknown) {
      throw new MediaProcessingError('storage_write_failed', true, 'Could not store WebP', {
        cause: error,
      });
    }
  }

  private async deleteBestEffort(objectKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(objectKey);
    } catch (error: unknown) {
      this.logger.warn(
        {
          cleanupId: randomUUID(),
          error: error instanceof Error ? error.message : 'unknown',
          event: 'media_worker.superseded_object.cleanup_failed',
          objectKey,
        },
        MediaMessageHandler.name,
      );
    }
  }
}
