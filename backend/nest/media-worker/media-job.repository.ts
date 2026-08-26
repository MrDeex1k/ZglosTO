import { Injectable } from '@nestjs/common';
import { type MediaProcessImageRequestedV1, type MessageEnvelopeV1 } from '@zglosto/contracts';
import { z } from 'zod';
import type { DatabaseClient } from '../../types.ts';
import { DatabaseService } from '../modules/database/database.service.ts';
import { IdempotentMessageExecutor } from '../modules/jobs/idempotent-message.executor.ts';
import type { ProcessedImage } from './sharp-image.processor.ts';

const CONSUMER_NAME = 'media-worker-v1';
const JobStateRowSchema = z
  .object({
    consumed: z.boolean(),
    image_revision: z.number().int().positive(),
    image_status: z.enum(['pending', 'processing', 'ready', 'failed']),
    job_status: z.enum([
      'pending',
      'published',
      'processing',
      'succeeded',
      'failed',
      'dead_lettered',
      'superseded',
    ]),
    original_object_key: z.string().min(1),
  })
  .strict();

export type MediaJobClaimResult = 'claimed' | 'terminal';
export type MediaJobCompletionResult = 'applied' | 'duplicate' | 'superseded';

@Injectable()
export class MediaJobRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotentMessageExecutor,
  ) {}

  claim(envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>): Promise<MediaJobClaimResult> {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `SELECT job.status::text AS job_status, job.original_object_key,
                image.revision AS image_revision, image.status::text AS image_status,
                EXISTS (
                  SELECT 1 FROM consumed_messages consumed
                  WHERE consumed.consumer_name = $3 AND consumed.message_id = $4
                ) AS consumed
         FROM media_processing_jobs job
         JOIN incident_images image ON image.id = job.image_id
         WHERE job.id = $1 AND job.image_id = $2
         FOR UPDATE OF job, image`,
        [envelope.payload.jobId, envelope.payload.imageId, CONSUMER_NAME, envelope.messageId],
      );
      const raw = result.rows[0] ?? null;
      if (raw === null) return 'terminal';
      const row = JobStateRowSchema.parse(raw);
      if (
        row.consumed ||
        row.image_revision !== envelope.payload.imageRevision ||
        row.original_object_key !== envelope.payload.original.objectKey ||
        row.job_status === 'superseded' ||
        row.job_status === 'succeeded' ||
        row.job_status === 'dead_lettered' ||
        row.image_status === 'ready' ||
        row.image_status === 'failed'
      ) {
        if (!row.consumed && row.image_status !== 'failed') {
          await this.markSuperseded(client, envelope.payload.jobId);
        }
        return 'terminal';
      }

      await client.query(
        `UPDATE media_processing_jobs
         SET status = 'processing', attempt_count = GREATEST(attempt_count, $2),
             last_failure_code = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [envelope.payload.jobId, envelope.payload.attempt],
      );
      await client.query(
        `UPDATE incident_images
         SET status = 'processing', failure_code = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND revision = $2`,
        [envelope.payload.imageId, envelope.payload.imageRevision],
      );
      return 'claimed';
    });
  }

  async complete(
    envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>,
    processed: ProcessedImage,
  ): Promise<MediaJobCompletionResult> {
    let applied = false;
    const execution = await this.idempotency.execute(
      CONSUMER_NAME,
      envelope.messageId,
      envelope.messageType,
      async (client) => {
        const image = await client.query(
          `UPDATE incident_images
           SET status = 'ready', processed_object_key = $3, processed_mime_type = 'image/webp',
               processed_size_bytes = $4, processed_checksum_sha256 = $5,
               width = $6, height = $7, failure_code = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND revision = $2 AND original_object_key = $8
             AND status IN ('pending', 'processing')`,
          [
            envelope.payload.imageId,
            envelope.payload.imageRevision,
            processed.metadata.objectKey,
            processed.metadata.sizeBytes,
            processed.metadata.checksumSha256,
            processed.width,
            processed.height,
            envelope.payload.original.objectKey,
          ],
        );
        if (image.rowCount === 0) {
          await this.markSuperseded(client, envelope.payload.jobId);
          return;
        }
        await client.query(
          `UPDATE media_processing_jobs
           SET status = 'succeeded', attempt_count = GREATEST(attempt_count, $2),
               last_failure_code = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status <> 'superseded'`,
          [envelope.payload.jobId, envelope.payload.attempt],
        );
        applied = true;
      },
    );
    if (execution === 'duplicate') return 'duplicate';
    return applied ? 'applied' : 'superseded';
  }

  async markRetry(
    payload: MediaProcessImageRequestedV1,
    failureCode: string,
    retryDelayMs: number,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE media_processing_jobs
         SET status = 'failed', attempt_count = GREATEST(attempt_count, $2),
             last_failure_code = $3,
             next_attempt_at = CURRENT_TIMESTAMP + ($4 * INTERVAL '1 millisecond'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status NOT IN ('succeeded', 'dead_lettered', 'superseded')`,
        [payload.jobId, payload.attempt, failureCode, retryDelayMs],
      );
      await client.query(
        `UPDATE incident_images
         SET status = 'pending', failure_code = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND revision = $2 AND status = 'processing'`,
        [payload.imageId, payload.imageRevision],
      );
    });
  }

  async markTerminalFailure(
    envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>,
    failureCode: string,
    deadLettered: boolean,
  ): Promise<MediaJobCompletionResult> {
    let applied = false;
    const execution = await this.idempotency.execute(
      CONSUMER_NAME,
      envelope.messageId,
      envelope.messageType,
      async (client) => {
        const image = await client.query(
          `UPDATE incident_images
           SET status = 'failed', failure_code = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND revision = $2 AND status IN ('pending', 'processing')`,
          [envelope.payload.imageId, envelope.payload.imageRevision, failureCode],
        );
        if (image.rowCount === 0) {
          await this.markSuperseded(client, envelope.payload.jobId);
          return;
        }
        await client.query(
          `UPDATE media_processing_jobs
           SET status = $2::media_processing_job_status,
               attempt_count = GREATEST(attempt_count, $3), last_failure_code = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status <> 'superseded'`,
          [
            envelope.payload.jobId,
            deadLettered ? 'dead_lettered' : 'failed',
            envelope.payload.attempt,
            failureCode,
          ],
        );
        applied = true;
      },
    );
    if (execution === 'duplicate') return 'duplicate';
    return applied ? 'applied' : 'superseded';
  }

  private async markSuperseded(client: DatabaseClient, jobId: string): Promise<void> {
    await client.query(
      `UPDATE media_processing_jobs
       SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status NOT IN ('succeeded', 'dead_lettered', 'superseded')`,
      [jobId],
    );
  }
}
