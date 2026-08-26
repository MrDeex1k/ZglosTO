import {
  ContractValidationError,
  expectBoolean,
  expectInteger,
  expectRecord,
  expectString,
} from './common.js';
import {
  INCIDENT_IMAGE_KINDS,
  parseImageObjectMetadata,
  type ImageObjectMetadata,
  type IncidentImageKind,
} from './images.js';

export const MEDIA_CONTRACT_VERSION = 1 as const;
export const MEDIA_PROCESS_IMAGE_EVENT = 'media.image.process.requested' as const;
export const MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT = 'media.image.process.succeeded' as const;
export const MEDIA_PROCESS_IMAGE_FAILED_EVENT = 'media.image.process.failed' as const;

export const MEDIA_PROCESSING_TOPOLOGY_V1 = {
  exchange: 'zglosto.media.v1',
  deadLetterExchange: 'zglosto.media.dlx.v1',
  processingQueue: 'zglosto.media.process.v1',
  retryQueue: 'zglosto.media.process.retry.v1',
  retryQueues: [
    { delayMs: 5_000, queue: 'zglosto.media.process.retry.5s.v1' },
    { delayMs: 30_000, queue: 'zglosto.media.process.retry.30s.v1' },
    { delayMs: 300_000, queue: 'zglosto.media.process.retry.5m.v1' },
  ] as const,
  deadLetterQueue: 'zglosto.media.process.dlq.v1',
  deadLetterRoutingKey: 'media.image.process.dead.v1',
  routingKey: 'media.image.process.v1',
  retryDelaysMs: [5_000, 30_000, 300_000] as const,
  maxAttempts: 4,
} as const;

export const LLM_CLASSIFICATION_TOPOLOGY_V1 = {
  exchange: 'zglosto.llm.v1',
  deadLetterExchange: 'zglosto.llm.dlx.v1',
  processingQueue: 'zglosto.llm.classify.v1',
  retryQueues: [
    { delayMs: 5_000, queue: 'zglosto.llm.classify.retry.5s.v1' },
    { delayMs: 30_000, queue: 'zglosto.llm.classify.retry.30s.v1' },
    { delayMs: 300_000, queue: 'zglosto.llm.classify.retry.5m.v1' },
  ] as const,
  deadLetterQueue: 'zglosto.llm.classify.dlq.v1',
  deadLetterRoutingKey: 'llm.classify.dead.v1',
  routingKey: 'llm.classify.v1',
  maxAttempts: 4,
} as const;

export const MEDIA_PROCESSING_FAILURE_CODES = [
  'invalid_content',
  'size_limit_exceeded',
  'pixel_limit_exceeded',
  'unsupported_format',
  'storage_read_failed',
  'storage_write_failed',
  'processing_failed',
] as const;

export type MediaProcessingFailureCode = (typeof MEDIA_PROCESSING_FAILURE_CODES)[number];

export interface MediaProcessImageRequestedV1 {
  contractVersion: typeof MEDIA_CONTRACT_VERSION;
  eventType: typeof MEDIA_PROCESS_IMAGE_EVENT;
  eventId: string;
  jobId: string;
  imageId: string;
  imageRevision: number;
  incidentId: string;
  imageKind: IncidentImageKind;
  original: ImageObjectMetadata;
  requestedAt: string;
  attempt: number;
  maxAttempts: number;
}

export interface MediaProcessImageSucceededV1 {
  contractVersion: typeof MEDIA_CONTRACT_VERSION;
  eventType: typeof MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT;
  eventId: string;
  jobId: string;
  imageId: string;
  imageRevision: number;
  processed: ImageObjectMetadata & { mimeType: 'image/webp' };
  width: number;
  height: number;
  completedAt: string;
}

export interface MediaProcessImageFailedV1 {
  contractVersion: typeof MEDIA_CONTRACT_VERSION;
  eventType: typeof MEDIA_PROCESS_IMAGE_FAILED_EVENT;
  eventId: string;
  jobId: string;
  imageId: string;
  imageRevision: number;
  failureCode: MediaProcessingFailureCode;
  retryable: boolean;
  failedAt: string;
}

export type MediaProcessImageResultV1 = MediaProcessImageSucceededV1 | MediaProcessImageFailedV1;

function expectLiteral<const Value extends string | number>(
  value: unknown,
  path: string,
  expected: Value,
): Value {
  if (value === expected) return expected;
  throw new ContractValidationError(path, String(expected));
}

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

function expectPositiveInteger(value: unknown, path: string): number {
  const parsed = expectInteger(value, path);
  if (parsed > 0) return parsed;
  throw new ContractValidationError(path, 'positive integer');
}

function expectIsoDateTime(value: unknown, path: string): string {
  const parsed = expectString(value, path);
  const timestamp = Date.parse(parsed);
  if (!Number.isNaN(timestamp) && new Date(timestamp).toISOString() === parsed) return parsed;
  throw new ContractValidationError(path, 'ISO 8601 UTC date-time');
}

export function parseMediaProcessImageRequestedV1(
  value: unknown,
  path = 'mediaProcessImageRequested',
): MediaProcessImageRequestedV1 {
  const record = expectRecord(value, path);
  const attempt = expectPositiveInteger(record.attempt, `${path}.attempt`);
  const maxAttempts = expectPositiveInteger(record.maxAttempts, `${path}.maxAttempts`);
  if (attempt > maxAttempts) {
    throw new ContractValidationError(`${path}.attempt`, `integer <= ${maxAttempts}`);
  }
  return {
    contractVersion: expectLiteral(
      record.contractVersion,
      `${path}.contractVersion`,
      MEDIA_CONTRACT_VERSION,
    ),
    eventType: expectLiteral(record.eventType, `${path}.eventType`, MEDIA_PROCESS_IMAGE_EVENT),
    eventId: expectString(record.eventId, `${path}.eventId`),
    jobId: expectString(record.jobId, `${path}.jobId`),
    imageId: expectString(record.imageId, `${path}.imageId`),
    imageRevision: expectPositiveInteger(record.imageRevision, `${path}.imageRevision`),
    incidentId: expectString(record.incidentId, `${path}.incidentId`),
    imageKind: expectEnum(record.imageKind, `${path}.imageKind`, INCIDENT_IMAGE_KINDS),
    original: parseImageObjectMetadata(record.original, `${path}.original`),
    requestedAt: expectIsoDateTime(record.requestedAt, `${path}.requestedAt`),
    attempt,
    maxAttempts,
  };
}

export function parseMediaProcessImageResultV1(
  value: unknown,
  path = 'mediaProcessImageResult',
): MediaProcessImageResultV1 {
  const record = expectRecord(value, path);
  const common = {
    contractVersion: expectLiteral(
      record.contractVersion,
      `${path}.contractVersion`,
      MEDIA_CONTRACT_VERSION,
    ),
    eventId: expectString(record.eventId, `${path}.eventId`),
    jobId: expectString(record.jobId, `${path}.jobId`),
    imageId: expectString(record.imageId, `${path}.imageId`),
    imageRevision: expectPositiveInteger(record.imageRevision, `${path}.imageRevision`),
  };

  if (record.eventType === MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT) {
    const processed = parseImageObjectMetadata(record.processed, `${path}.processed`);
    if (processed.mimeType !== 'image/webp') {
      throw new ContractValidationError(`${path}.processed.mimeType`, 'image/webp');
    }
    return {
      ...common,
      eventType: MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT,
      processed: { ...processed, mimeType: 'image/webp' },
      width: expectPositiveInteger(record.width, `${path}.width`),
      height: expectPositiveInteger(record.height, `${path}.height`),
      completedAt: expectIsoDateTime(record.completedAt, `${path}.completedAt`),
    };
  }

  if (record.eventType === MEDIA_PROCESS_IMAGE_FAILED_EVENT) {
    return {
      ...common,
      eventType: MEDIA_PROCESS_IMAGE_FAILED_EVENT,
      failureCode: expectEnum(
        record.failureCode,
        `${path}.failureCode`,
        MEDIA_PROCESSING_FAILURE_CODES,
      ),
      retryable: expectBoolean(record.retryable, `${path}.retryable`),
      failedAt: expectIsoDateTime(record.failedAt, `${path}.failedAt`),
    };
  }

  throw new ContractValidationError(
    `${path}.eventType`,
    `${MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT} | ${MEDIA_PROCESS_IMAGE_FAILED_EVENT}`,
  );
}
