import { randomUUID } from 'node:crypto';
import {
  MEDIA_CONTRACT_VERSION,
  MEDIA_PROCESS_IMAGE_EVENT,
  MEDIA_PROCESSING_TOPOLOGY_V1,
  expectInteger,
  expectRecord,
  expectString,
  parseMediaProcessImageRequestedV1,
  parseIncidentImageRef,
  type IncidentImageKind,
  type IncidentImageRef,
} from '@zglosto/contracts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { DatabaseClient, TransactionalDatabaseClient } from '../types.ts';

interface ExistingImage {
  id: string;
  originalObjectKey: string;
  processedObjectKey: string | null;
}

interface StoredImageState {
  existing: ExistingImage | null;
  imageId: string;
  imageRevision: number;
}

export interface MessagePublicationContext {
  correlationId: string;
  traceparent: string | null;
}

export class ImageUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadValidationError';
  }
}

async function findExistingImage(
  database: DatabaseClient,
  incidentId: string,
  kind: IncidentImageKind,
): Promise<ExistingImage | null> {
  const result = await database.query(
    `SELECT id::text, original_object_key, processed_object_key
     FROM incident_images WHERE incident_id = $1 AND kind = $2::incident_image_kind`,
    [incidentId, kind],
  );
  const raw = result.rows[0] ?? null;
  if (raw === null) return null;
  const row = expectRecord(raw, 'existingIncidentImage');
  const processedObjectKey = row.processed_object_key;
  if (processedObjectKey !== null && typeof processedObjectKey !== 'string') {
    throw new Error('Invalid processed object key in database');
  }
  return {
    id: expectString(row.id, 'existingIncidentImage.id'),
    originalObjectKey: expectString(
      row.original_object_key,
      'existingIncidentImage.original_object_key',
    ),
    processedObjectKey,
  };
}

async function loadIncidentImageRef(
  database: DatabaseClient,
  incidentId: string,
  kind: IncidentImageKind,
): Promise<IncidentImageRef | null> {
  const result = await database.query(
    `SELECT image_ref FROM incident_image_api_refs
     WHERE incident_id = $1 AND kind = $2::incident_image_kind`,
    [incidentId, kind],
  );
  const raw = result.rows[0] ?? null;
  if (raw === null) return null;
  return parseIncidentImageRef(expectRecord(raw, 'incidentImageRefRow').image_ref, 'imageRef');
}

export async function storeIncidentImage(
  database: TransactionalDatabaseClient,
  storage: ObjectStorage,
  incidentId: string,
  kind: IncidentImageKind,
  uploadId: string,
  messageContext: MessagePublicationContext | null,
): Promise<IncidentImageRef> {
  const uploadResult = await database.query(
    `SELECT kind::text, incident_id::text, object_key, mime_type, size_bytes,
            checksum_sha256, status, expires_at::text
     FROM image_uploads WHERE id = $1`,
    [uploadId],
  );
  const rawUpload = uploadResult.rows[0] ?? null;
  if (rawUpload === null) throw new ImageUploadValidationError('Image upload does not exist');
  const upload = expectRecord(rawUpload, 'imageUpload');
  const uploadKind = expectString(upload.kind, 'imageUpload.kind');
  const boundIncidentId =
    upload.incident_id === null ? null : expectString(upload.incident_id, 'imageUpload.incidentId');
  const objectKey = expectString(upload.object_key, 'imageUpload.objectKey');
  const mimeType = expectString(upload.mime_type, 'imageUpload.mimeType');
  const sizeBytes = expectInteger(upload.size_bytes, 'imageUpload.sizeBytes');
  const checksumSha256 = expectString(upload.checksum_sha256, 'imageUpload.checksumSha256');
  if (
    uploadKind !== kind ||
    expectString(upload.status, 'imageUpload.status') !== 'pending' ||
    new Date(expectString(upload.expires_at, 'imageUpload.expiresAt')).getTime() <= Date.now() ||
    (kind === 'report' ? boundIncidentId !== null : boundIncidentId !== incidentId)
  ) {
    throw new ImageUploadValidationError('Image upload is invalid, expired or already consumed');
  }
  const stored = await storage.headObject(objectKey);
  if (
    stored.sizeBytes !== sizeBytes ||
    stored.contentType !== mimeType ||
    stored.checksumSha256 !== checksumSha256
  ) {
    throw new ImageUploadValidationError(
      'Uploaded image metadata does not match its signed contract',
    );
  }
  const newImageId = randomUUID();
  const jobId = randomUUID();
  const eventId = randomUUID();
  const correlationId = messageContext?.correlationId ?? eventId;
  const causationId = correlationId;
  const traceparent = messageContext?.traceparent ?? null;
  const requestedAt = new Date().toISOString();

  let storedState: StoredImageState;
  storedState = await database.transaction(async (transaction) => {
    const consumedUpload = await transaction.query(
      `UPDATE image_uploads
         SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
         RETURNING id`,
      [uploadId],
    );
    if (consumedUpload.rowCount !== 1) {
      throw new ImageUploadValidationError('Image upload was already consumed or expired');
    }
    await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`, [
      incidentId,
      kind,
    ]);
    const existing = await findExistingImage(transaction, incidentId, kind);
    const imageId = existing?.id ?? newImageId;
    const imageResult = await transaction.query(
      `INSERT INTO incident_images (
           id, incident_id, kind, status, original_object_key, original_mime_type,
           original_size_bytes, original_checksum_sha256
         ) VALUES ($1, $2, $3::incident_image_kind, 'pending', $4, $5, $6, $7)
         ON CONFLICT (incident_id, kind) DO UPDATE SET
           revision = incident_images.revision + 1,
           status = 'pending',
           original_object_key = EXCLUDED.original_object_key,
           original_mime_type = EXCLUDED.original_mime_type,
           original_size_bytes = EXCLUDED.original_size_bytes,
           original_checksum_sha256 = EXCLUDED.original_checksum_sha256,
           processed_object_key = NULL,
           processed_mime_type = NULL,
           processed_size_bytes = NULL,
           processed_checksum_sha256 = NULL,
           width = NULL,
           height = NULL,
           original_deleted_at = NULL,
           failure_code = NULL,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id::text, revision`,
      [imageId, incidentId, kind, objectKey, mimeType, sizeBytes, checksumSha256],
    );
    const imageRow = expectRecord(imageResult.rows[0], 'storedIncidentImage');
    const storedImageId = expectString(imageRow.id, 'storedIncidentImage.id');
    const imageRevision = expectInteger(imageRow.revision, 'storedIncidentImage.revision');

    await transaction.query(
      `UPDATE media_processing_jobs
         SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
         WHERE image_id = $1 AND status IN ('pending', 'published', 'processing', 'failed')`,
      [storedImageId],
    );
    await transaction.query(
      `UPDATE outbox_events
         SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
         WHERE aggregate_id = $1 AND status IN ('pending', 'publishing', 'failed')`,
      [storedImageId],
    );

    await transaction.query(
      `INSERT INTO media_processing_jobs (
           id, image_id, image_revision, incident_id, contract_version, status,
           original_object_key, attempt_count, max_attempts, next_attempt_at
         ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, 0, $7, CURRENT_TIMESTAMP)`,
      [
        jobId,
        storedImageId,
        imageRevision,
        incidentId,
        MEDIA_CONTRACT_VERSION,
        objectKey,
        MEDIA_PROCESSING_TOPOLOGY_V1.maxAttempts,
      ],
    );

    const event = parseMediaProcessImageRequestedV1({
      contractVersion: MEDIA_CONTRACT_VERSION,
      eventType: MEDIA_PROCESS_IMAGE_EVENT,
      eventId,
      jobId,
      imageId: storedImageId,
      imageRevision,
      incidentId,
      imageKind: kind,
      original: {
        objectKey,
        mimeType,
        sizeBytes,
        checksumSha256,
      },
      requestedAt,
      attempt: 1,
      maxAttempts: MEDIA_PROCESSING_TOPOLOGY_V1.maxAttempts,
    });
    await transaction.query(
      `INSERT INTO outbox_events (
           id, job_id, event_type, aggregate_type, aggregate_id, aggregate_revision,
           contract_version, correlation_id, causation_id, traceparent, payload, status, available_at
         ) VALUES ($1, $2, $3, 'incident_image', $4, $5, $6, $7, $8, $9, $10::jsonb, 'pending', CURRENT_TIMESTAMP)`,
      [
        eventId,
        jobId,
        MEDIA_PROCESS_IMAGE_EVENT,
        storedImageId,
        imageRevision,
        MEDIA_CONTRACT_VERSION,
        correlationId,
        causationId,
        traceparent,
        JSON.stringify(event),
      ],
    );

    return { existing, imageId: storedImageId, imageRevision };
  });

  const { existing } = storedState;
  if (existing !== null && existing.originalObjectKey !== objectKey) {
    const obsoleteKeys = [existing.originalObjectKey];
    if (existing.processedObjectKey !== null) {
      obsoleteKeys.push(existing.processedObjectKey);
    }
    await Promise.all(
      obsoleteKeys.map(async (obsoleteKey) => {
        try {
          await storage.deleteObject(obsoleteKey);
        } catch (error) {
          console.error('Could not remove replaced incident image object', error);
        }
      }),
    );
  }

  const imageRef = await loadIncidentImageRef(database, incidentId, kind);
  if (imageRef === null) throw new Error('Database did not return stored image metadata');
  return imageRef;
}
