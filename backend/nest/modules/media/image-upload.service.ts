import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type IncidentImageKind,
  type InitiateImageUploadRequest,
  type InitiateImageUploadResponse,
} from '@zglosto/contracts';
import { validateObjectStorageEnvironment } from '../../../config/env.ts';
import { notFound } from '../../application-error.ts';
import { DatabaseService } from '../database/database.service.ts';
import { ObjectStorageService } from '../storage/object-storage.service.ts';

const EXTENSION_BY_MIME: Readonly<Record<InitiateImageUploadRequest['mimeType'], string>> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ImageUploadService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
  ) {}

  async initiateReport(request: InitiateImageUploadRequest): Promise<InitiateImageUploadResponse> {
    return this.initiate('report', null, request);
  }

  async initiateResolution(
    incidentId: string,
    serviceKey: string,
    request: InitiateImageUploadRequest,
  ): Promise<InitiateImageUploadResponse> {
    const incident = await this.database.query(
      `SELECT 1 FROM incydenty WHERE id_zgloszenia = $1 AND service_key = $2`,
      [incidentId, serviceKey],
    );
    if (incident.rowCount !== 1) throw notFound('incydent not found');
    return this.initiate('resolution', incidentId, request);
  }

  private async initiate(
    kind: IncidentImageKind,
    incidentId: string | null,
    request: InitiateImageUploadRequest,
  ): Promise<InitiateImageUploadResponse> {
    const configuration = validateObjectStorageEnvironment();
    const uploadId = randomUUID();
    const objectKey = `staging/${kind}/${uploadId}/original.${EXTENSION_BY_MIME[request.mimeType]}`;
    const expiresAt = new Date(
      Date.now() + configuration.uploadExpirySeconds * 1_000,
    ).toISOString();

    await this.database.query(
      `INSERT INTO image_uploads (
         id, kind, incident_id, object_key, mime_type, size_bytes, checksum_sha256, expires_at
       ) VALUES ($1, $2::incident_image_kind, $3, $4, $5, $6, $7, $8::timestamptz)`,
      [
        uploadId,
        kind,
        incidentId,
        objectKey,
        request.mimeType,
        request.sizeBytes,
        request.checksumSha256,
        expiresAt,
      ],
    );

    try {
      const presigned = await this.storage.createPresignedUpload({
        checksumSha256: request.checksumSha256,
        contentType: request.mimeType,
        expiresInSeconds: configuration.uploadExpirySeconds,
        objectKey,
        sizeBytes: request.sizeBytes,
      });
      return { ...presigned, uploadId };
    } catch (error: unknown) {
      await this.database.query(`DELETE FROM image_uploads WHERE id = $1 AND status = 'pending'`, [
        uploadId,
      ]);
      throw error;
    }
  }
}
