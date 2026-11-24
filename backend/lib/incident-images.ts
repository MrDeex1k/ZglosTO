import { randomUUID } from 'node:crypto';
import {
  MEDIA_CONTRACT_VERSION,
  MEDIA_PROCESS_IMAGE_EVENT,
  MEDIA_PROCESSING_TOPOLOGY_V1,
  expectInteger,
  expectRecord,
  expectString,
  parseMediaProcessImageRequestedV1,
  type IncidentImageKind,
} from '@zglosto/contracts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { DatabaseClient } from '../types.ts';

interface ExistingImage {
  id: string;
  originalObjectKey: string;
  processedObjectKey: string | null;
}

export interface VerifiedImageUpload {
  id: string;
  kind: IncidentImageKind;
  incidentId: string | null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
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

export async function verifyIncidentImageUpload(
  database: DatabaseClient,
  storage: ObjectStorage,
  kind: IncidentImageKind,
  incidentId: string | null,
  uploadId: string,
): Promise<VerifiedImageUpload> {
  const uploadResult = await database.query(
    `SELECT kind::text, incident_id::text, object_key, mime_type, size_bytes,
            checksum_sha256, status
     FROM image_uploads WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP`,
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
    boundIncidentId !== incidentId
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
  return { id: uploadId, kind, incidentId, objectKey, mimeType, sizeBytes, checksumSha256 };
}

// The caller owns the transaction and must already hold the incident row lock
// or have inserted the incident in that transaction.
export async function attachIncidentImage(
  transaction: DatabaseClient,
  incidentId: string,
  upload: VerifiedImageUpload,
  messageContext: MessagePublicationContext,
): Promise<readonly string[]> {
  const { kind, objectKey, mimeType, sizeBytes, checksumSha256 } = upload;
  if (kind === 'resolution' && upload.incidentId !== incidentId) {
    throw new ImageUploadValidationError('Image upload does not belong to the incident');
  }
  const newImageId = randomUUID();
  const jobId = randomUUID();
  const eventId = randomUUID();
  const correlationId = messageContext.correlationId;
  const causationId = correlationId;
  const traceparent = messageContext.traceparent;
  const requestedAt = new Date().toISOString();

  const consumedUpload = await transaction.query(
    `UPDATE image_uploads
       SET status = 'consumed', consumed_at = clock_timestamp()
       WHERE id = $1 AND status = 'pending' AND expires_at > clock_timestamp()
         AND kind = $2 AND incident_id IS NOT DISTINCT FROM $3::uuid
         AND object_key = $4 AND mime_type = $5 AND size_bytes = $6 AND checksum_sha256 = $7
       RETURNING id`,
    [upload.id, kind, upload.incidentId, objectKey, mimeType, sizeBytes, checksumSha256],
  );
  if (consumedUpload.rowCount !== 1) {
    throw new ImageUploadValidationError('Image upload changed, was already consumed or expired');
  }
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

  if (existing === null || existing.originalObjectKey === objectKey) return [];
  return existing.processedObjectKey === null
    ? [existing.originalObjectKey]
    : [existing.originalObjectKey, existing.processedObjectKey];
}
