import { z } from 'zod';
import { INCIDENT_IMAGE_MAX_BYTES } from './images.js';

export const INCIDENT_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const InitiateImageUploadRequestSchema = z
  .object({
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
    mimeType: z.enum(INCIDENT_UPLOAD_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(INCIDENT_IMAGE_MAX_BYTES),
  })
  .strict();

export const InitiateImageUploadResponseSchema = z
  .object({
    expiresAt: z.iso.datetime(),
    headers: z.record(z.string(), z.string()),
    method: z.literal('PUT'),
    uploadId: z.uuid(),
    uploadUrl: z.url(),
  })
  .strict();

export const ImageUploadReferenceSchema = z.object({ uploadId: z.uuid() }).strict();

export type InitiateImageUploadRequest = z.infer<typeof InitiateImageUploadRequestSchema>;
export type InitiateImageUploadResponse = z.infer<typeof InitiateImageUploadResponseSchema>;
export type ImageUploadReference = z.infer<typeof ImageUploadReferenceSchema>;
