import { Injectable } from '@nestjs/common';
import {
  createMessageEnvelopeV1,
  MEDIA_PROCESS_IMAGE_EVENT,
  MEDIA_PROCESSING_TOPOLOGY_V1,
  parseMediaProcessImageRequestedV1,
  type MediaProcessImageRequestedV1,
  type MessageEnvelopeV1,
} from '@zglosto/contracts';
import { z } from 'zod';
import type { DatabaseClient } from '../../../types.ts';
import { DatabaseService } from '../database/database.service.ts';

const ClaimedOutboxRowSchema = z
  .object({
    causation_id: z.uuid(),
    correlation_id: z.uuid(),
    created_at: z.coerce.date(),
    event_type: z.literal(MEDIA_PROCESS_IMAGE_EVENT),
    id: z.uuid(),
    payload: z.unknown(),
    publish_attempts: z.number().int().positive(),
    traceparent: z.string().nullable(),
  })
  .strict();

export interface ClaimedOutboxMessage {
  envelope: MessageEnvelopeV1<MediaProcessImageRequestedV1>;
  exchange: string;
  id: string;
  publishAttempts: number;
  routingKey: string;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  async claimBatch(batchSize: number, lockTimeoutMs: number): Promise<ClaimedOutboxMessage[]> {
    const result = await this.database.query(
      `WITH claimable AS (
         SELECT id
         FROM outbox_events
         WHERE (
           status IN ('pending', 'failed') AND available_at <= CURRENT_TIMESTAMP
         ) OR (
           status = 'publishing'
           AND locked_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')
         )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE outbox_events AS event
       SET status = 'publishing',
           publish_attempts = event.publish_attempts + 1,
           locked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           last_error_code = NULL
       FROM claimable
       WHERE event.id = claimable.id
       RETURNING event.id, event.event_type, event.payload, event.correlation_id,
                 event.causation_id, event.traceparent, event.created_at,
                 event.publish_attempts`,
      [batchSize, lockTimeoutMs],
    );

    return result.rows.map((unknownRow) => {
      const row = ClaimedOutboxRowSchema.parse(unknownRow);
      const payload = parseMediaProcessImageRequestedV1(row.payload, 'outbox.payload');
      return {
        envelope: createMessageEnvelopeV1(
          {
            causationId: row.causation_id,
            correlationId: row.correlation_id,
            messageId: row.id,
            messageType: row.event_type,
            occurredAt: row.created_at.toISOString(),
            traceparent: row.traceparent,
          },
          payload,
        ),
        exchange: MEDIA_PROCESSING_TOPOLOGY_V1.exchange,
        id: row.id,
        publishAttempts: row.publish_attempts,
        routingKey: MEDIA_PROCESSING_TOPOLOGY_V1.routingKey,
      };
    });
  }

  async markPublished(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.database.transaction(async (client) => {
      await this.markJobsPublished(client, ids);
      await client.query(
        `UPDATE outbox_events
         SET status = 'published', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, updated_at = CURRENT_TIMESTAMP, last_error_code = NULL
         WHERE id = ANY($1::uuid[]) AND status = 'publishing'`,
        [this.uuidArray(ids)],
      );
    });
  }

  async markFailed(ids: readonly string[], errorCode: string, retryDelayMs: number): Promise<void> {
    if (ids.length === 0) return;
    await this.database.query(
      `UPDATE outbox_events
       SET status = 'failed', locked_at = NULL,
           available_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
           updated_at = CURRENT_TIMESTAMP, last_error_code = $2
       WHERE id = ANY($1::uuid[]) AND status = 'publishing'`,
      [this.uuidArray(ids), errorCode, retryDelayMs],
    );
  }

  private async markJobsPublished(
    client: DatabaseClient,
    eventIds: readonly string[],
  ): Promise<void> {
    await client.query(
      `UPDATE media_processing_jobs AS job
       SET status = 'published', updated_at = CURRENT_TIMESTAMP
       FROM outbox_events AS event
       WHERE event.id = ANY($1::uuid[])
         AND job.id = event.job_id
         AND job.status = 'pending'`,
      [this.uuidArray(eventIds)],
    );
  }

  private uuidArray(ids: readonly string[]): string {
    return `{${ids.join(',')}}`;
  }
}
