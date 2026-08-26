import { describe, expect, test } from 'vitest';
import {
  MEDIA_CONTRACT_VERSION,
  MEDIA_PROCESS_IMAGE_EVENT,
  MEDIA_PROCESS_IMAGE_FAILED_EVENT,
  MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT,
  MEDIA_PROCESSING_TOPOLOGY_V1,
  parseMediaProcessImageRequestedV1,
  parseMediaProcessImageResultV1,
} from './media.js';

const requested = {
  contractVersion: MEDIA_CONTRACT_VERSION,
  eventType: MEDIA_PROCESS_IMAGE_EVENT,
  eventId: '019d-event',
  jobId: '019d-job',
  imageId: '019d-image',
  imageRevision: 1,
  incidentId: '019d-incident',
  imageKind: 'report',
  original: {
    objectKey: 'incident/report/image/original.png',
    mimeType: 'image/png',
    sizeBytes: 68,
    checksumSha256: 'a'.repeat(64),
  },
  requestedAt: '2026-07-18T12:00:00.000Z',
  attempt: 1,
  maxAttempts: MEDIA_PROCESSING_TOPOLOGY_V1.maxAttempts,
};

describe('media processing contracts v1', () => {
  test('accepts a job containing metadata but no binary payload', () => {
    expect(parseMediaProcessImageRequestedV1(requested)).toEqual(requested);
    expect(JSON.stringify(requested)).not.toContain('base64');
  });

  test('rejects attempts beyond the declared retry limit', () => {
    expect(() =>
      parseMediaProcessImageRequestedV1({
        ...requested,
        attempt: MEDIA_PROCESSING_TOPOLOGY_V1.maxAttempts + 1,
      }),
    ).toThrow('integer <= 4');
  });

  test('accepts a successful WebP result', () => {
    const result = {
      contractVersion: 1,
      eventType: MEDIA_PROCESS_IMAGE_SUCCEEDED_EVENT,
      eventId: '019d-result',
      jobId: requested.jobId,
      imageId: requested.imageId,
      imageRevision: requested.imageRevision,
      processed: {
        objectKey: 'incident/report/image/processed.webp',
        mimeType: 'image/webp',
        sizeBytes: 54,
        checksumSha256: 'b'.repeat(64),
      },
      width: 1,
      height: 1,
      completedAt: '2026-07-18T12:01:00.000Z',
    };
    expect(parseMediaProcessImageResultV1(result)).toEqual(result);
  });

  test('accepts a closed failure code and rejects an unknown one', () => {
    const failed = {
      contractVersion: 1,
      eventType: MEDIA_PROCESS_IMAGE_FAILED_EVENT,
      eventId: '019d-result',
      jobId: requested.jobId,
      imageId: requested.imageId,
      imageRevision: requested.imageRevision,
      failureCode: 'storage_read_failed',
      retryable: true,
      failedAt: '2026-07-18T12:01:00.000Z',
    };
    expect(parseMediaProcessImageResultV1(failed)).toEqual(failed);
    expect(() =>
      parseMediaProcessImageResultV1({ ...failed, failureCode: 'network_error' }),
    ).toThrow('storage_read_failed');
  });
});
