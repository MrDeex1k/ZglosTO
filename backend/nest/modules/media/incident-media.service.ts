import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  CorrelationIdSchema,
  expectRecord,
  expectString,
  type AuthSessionUser,
  type IncidentImageKind,
  type IncidentImageRef,
} from '@zglosto/contracts';
import { ImageUploadValidationError, storeIncidentImage } from '../../../lib/incident-images.ts';
import { badRequest, forbidden, notFound, unauthorized } from '../../application-error.ts';
import { CorrelationContext } from '../../platform/correlation-context.ts';
import { IncidentImageAccessPolicy } from '../auth-bridge/incident-image-access.policy.ts';
import { DatabaseService } from '../database/database.service.ts';
import { ObjectStorageService } from '../storage/object-storage.service.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface IncidentImageHttpMetadata {
  cacheControl: 'private, no-store' | 'public, max-age=300, must-revalidate';
  checksumSha256: string;
  mimeType: string;
  objectKey: string;
}

export interface IncidentImageHttpBody {
  body: Uint8Array;
  sizeBytes: number;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return expectString(value, path);
}

@Injectable()
export class IncidentMediaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly accessPolicy: IncidentImageAccessPolicy,
    private readonly correlationContext: CorrelationContext,
  ) {}

  async store(
    incidentId: string,
    kind: IncidentImageKind,
    imageUploadId: string,
  ): Promise<IncidentImageRef> {
    try {
      return await storeIncidentImage(
        this.database,
        this.storage,
        incidentId,
        kind,
        imageUploadId,
        {
          correlationId:
            this.correlationContext.currentId() ?? CorrelationIdSchema.parse(randomUUID()),
          traceparent: this.correlationContext.currentTraceparent(),
        },
      );
    } catch (error: unknown) {
      if (error instanceof ImageUploadValidationError) throw badRequest(error.message);
      throw error;
    }
  }

  async authorizeForHttp(
    imageId: string,
    user: AuthSessionUser | null,
  ): Promise<IncidentImageHttpMetadata> {
    if (!UUID_PATTERN.test(imageId)) throw notFound('image not found');
    const result = await this.database.query(
      `SELECT image.kind::text,
              COALESCE(image.processed_object_key, image.original_object_key) AS object_key,
              COALESCE(image.processed_mime_type, image.original_mime_type) AS mime_type,
              COALESCE(image.processed_checksum_sha256, image.original_checksum_sha256) AS checksum,
              incident.reporter_user_id, incident.service_key,
              incident.status_incydentu::text AS incident_status
       FROM incident_images image
       JOIN incydenty incident ON incident.id_zgloszenia = image.incident_id
       WHERE image.id = $1`,
      [imageId],
    );
    const raw = result.rows[0] ?? null;
    if (raw === null) throw notFound('image not found');

    const row = expectRecord(raw, 'incidentImage');
    const access = this.accessPolicy.evaluate(user, {
      incidentStatus: expectString(row.incident_status, 'incidentImage.incident_status'),
      kind: expectString(row.kind, 'incidentImage.kind'),
      reporterUserId: nullableString(row.reporter_user_id, 'incidentImage.reporter_user_id'),
      serviceKey: expectString(row.service_key, 'incidentImage.service_key'),
    });
    if (!access.allowed) {
      if (user === null) throw unauthorized('image access denied');
      throw forbidden('image access denied');
    }

    const checksumSha256 = expectString(row.checksum, 'incidentImage.checksum');
    return {
      cacheControl: access.cacheControl,
      checksumSha256,
      mimeType: expectString(row.mime_type, 'incidentImage.mimeType'),
      objectKey: expectString(row.object_key, 'incidentImage.objectKey'),
    };
  }

  async loadBody(metadata: IncidentImageHttpMetadata): Promise<IncidentImageHttpBody> {
    const object = await this.storage.getObject(metadata.objectKey);
    if (object.checksumSha256 !== null && object.checksumSha256 !== metadata.checksumSha256) {
      throw new Error('Object Storage checksum does not match incident image metadata');
    }
    return { body: object.body, sizeBytes: object.sizeBytes };
  }
}
