import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../modules/database/database.service.ts';
import { ObjectStorageService } from '../modules/storage/object-storage.service.ts';
import { StructuredLogger } from '../platform/structured-logger.ts';

const CleanupRowSchema = z.object({
  id: z.string().uuid(),
  object_key: z.string().min(1),
  revision: z.number().int().positive(),
});

const ExpiredUploadRowSchema = z.object({
  id: z.string().uuid(),
  object_key: z.string().min(1),
});

@Injectable()
export class MediaOriginalCleanupService {
  constructor(
    private readonly database: DatabaseService,
    private readonly logger: StructuredLogger,
    private readonly storage: ObjectStorageService,
  ) {}

  async cleanupOne(imageId: string, revision: number, objectKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(objectKey);
      await this.database.query(
        `UPDATE incident_images
         SET original_deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND revision = $2 AND status = 'ready' AND original_object_key = $3`,
        [imageId, revision, objectKey],
      );
    } catch (error: unknown) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : 'unknown',
          event: 'media_worker.original.cleanup_failed',
          imageId,
        },
        MediaOriginalCleanupService.name,
      );
    }
  }

  async cleanupBatch(): Promise<void> {
    const images = await this.database.query(
      `SELECT id::text, revision, original_object_key AS object_key
       FROM incident_images
       WHERE status = 'ready' AND original_deleted_at IS NULL
       ORDER BY updated_at
       LIMIT 25`,
    );
    for (const raw of images.rows) {
      const row = CleanupRowSchema.parse(raw);
      // Cleanup is deliberately sequential to cap pressure on small local Object Storage.
      // oxlint-disable-next-line no-await-in-loop
      await this.cleanupOne(row.id, row.revision, row.object_key);
    }

    const expired = await this.database.query(
      `SELECT id::text, object_key
       FROM image_uploads
       WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP
       ORDER BY expires_at
       LIMIT 25`,
    );
    for (const raw of expired.rows) {
      const row = ExpiredUploadRowSchema.parse(raw);
      try {
        // S3 DeleteObject is idempotent, including uploads that were never completed.
        // oxlint-disable-next-line no-await-in-loop
        await this.storage.deleteObject(row.object_key);
        // oxlint-disable-next-line no-await-in-loop
        await this.database.query(
          `DELETE FROM image_uploads WHERE id = $1 AND status = 'pending'`,
          [row.id],
        );
      } catch (error: unknown) {
        this.logger.warn(
          {
            error: error instanceof Error ? error.message : 'unknown',
            event: 'media_worker.staging.cleanup_failed',
            uploadId: row.id,
          },
          MediaOriginalCleanupService.name,
        );
      }
    }
  }
}
