import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageUploadService } from './image-upload.service.ts';

beforeEach(() => {
  vi.stubEnv('S3_ACCESS_KEY_ID', 'access-key');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret-key');
  vi.stubEnv('S3_ENDPOINT', 'http://rustfs:9000');
  vi.stubEnv('S3_PUBLIC_ENDPOINT', 'http://localhost:9000');
  vi.stubEnv('S3_REGION', 'eu-central-1');
  vi.stubEnv('S3_BUCKET', 'zglosto-test');
  vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');
  vi.stubEnv('S3_OBJECT_PREFIX', 'incidents');
  vi.stubEnv('S3_AUTO_CREATE_BUCKET', 'false');
  vi.stubEnv('S3_UPLOAD_EXPIRY_SECONDS', '300');
});

afterEach(() => vi.unstubAllEnvs());

describe('ImageUploadService', () => {
  it('registers a report upload and returns a short-lived signed contract', async () => {
    const database = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [] })),
    };
    const storage = {
      createPresignedUpload: vi.fn(async () => ({
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        headers: {
          'content-type': 'image/jpeg',
          'x-amz-meta-checksum-sha256': 'a'.repeat(64),
        },
        method: 'PUT' as const,
        uploadUrl: 'http://localhost:9000/zglosto-test/signed',
      })),
    };
    const result = await new ImageUploadService(database as never, storage as never).initiateReport(
      {
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    );

    expect(result.uploadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result).toMatchObject({
      method: 'PUT',
      uploadUrl: expect.stringContaining('localhost'),
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO image_uploads'),
      expect.arrayContaining(['report', null, 'image/jpeg', 1024, 'a'.repeat(64)]),
    );
    expect(storage.createPresignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg', sizeBytes: 1024 }),
    );
  });

  it('does not issue a resolution upload for an incident outside the service', async () => {
    const database = {
      query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
    };
    const service = new ImageUploadService(database as never, {} as never);

    await expect(
      service.initiateResolution('00000000-0000-4000-8000-000000000001', 'roads', {
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
