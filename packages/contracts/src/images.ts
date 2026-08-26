import {
  ContractValidationError,
  expectInteger,
  expectNullableString,
  expectRecord,
  expectString,
} from './common.js';
import { z } from 'zod';

export const INCIDENT_IMAGE_KINDS = ['report', 'resolution'] as const;
export type IncidentImageKind = (typeof INCIDENT_IMAGE_KINDS)[number];

export const INCIDENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const API_JSON_REQUEST_MAX_BYTES = 256 * 1024;

export const INCIDENT_IMAGE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type IncidentImageStatus = (typeof INCIDENT_IMAGE_STATUSES)[number];

export const ImageObjectMetadataSchema = z
  .object({
    objectKey: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    checksumSha256: z.string(),
  })
  .strict();

export const IncidentImageRefSchema = z
  .object({
    id: z.string(),
    kind: z.enum(INCIDENT_IMAGE_KINDS),
    status: z.enum(INCIDENT_IMAGE_STATUSES),
    original: ImageObjectMetadataSchema,
    processed: ImageObjectMetadataSchema.nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    failureCode: z.string().nullable(),
    url: z.string(),
  })
  .strict();

export type ImageObjectMetadata = z.infer<typeof ImageObjectMetadataSchema>;
export type IncidentImageRef = z.infer<typeof IncidentImageRefSchema>;

function expectEnum<const Values extends readonly string[]>(
  value: unknown,
  path: string,
  values: Values,
): Values[number] {
  if (typeof value === 'string' && values.some((candidate) => candidate === value)) {
    return value as Values[number];
  }
  throw new ContractValidationError(path, values.join(' | '));
}

function expectNullableInteger(value: unknown, path: string): number | null {
  if (value === null) return null;
  return expectInteger(value, path);
}

export function parseImageObjectMetadata(value: unknown, path: string): ImageObjectMetadata {
  const record = expectRecord(value, path);
  return {
    objectKey: expectString(record.objectKey, `${path}.objectKey`),
    mimeType: expectString(record.mimeType, `${path}.mimeType`),
    sizeBytes: expectInteger(record.sizeBytes, `${path}.sizeBytes`),
    checksumSha256: expectString(record.checksumSha256, `${path}.checksumSha256`),
  };
}

export function parseIncidentImageRef(value: unknown, path: string): IncidentImageRef {
  const record = expectRecord(value, path);
  return {
    id: expectString(record.id, `${path}.id`),
    kind: expectEnum(record.kind, `${path}.kind`, INCIDENT_IMAGE_KINDS),
    status: expectEnum(record.status, `${path}.status`, INCIDENT_IMAGE_STATUSES),
    original: parseImageObjectMetadata(record.original, `${path}.original`),
    processed:
      record.processed === null
        ? null
        : parseImageObjectMetadata(record.processed, `${path}.processed`),
    width: expectNullableInteger(record.width, `${path}.width`),
    height: expectNullableInteger(record.height, `${path}.height`),
    failureCode: expectNullableString(record.failureCode, `${path}.failureCode`),
    url: expectString(record.url, `${path}.url`),
  };
}

export function parseNullableIncidentImageRef(
  value: unknown,
  path: string,
): IncidentImageRef | null {
  if (value === null) return null;
  return parseIncidentImageRef(value, path);
}
