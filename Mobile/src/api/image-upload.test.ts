import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import { INITIATE_IMAGE_UPLOAD_PATH, initiateImageUpload } from './image-upload';

const request = {
  checksumSha256: 'a'.repeat(64),
  mimeType: 'image/jpeg' as const,
  sizeBytes: 1024,
};

describe('image upload initiation', () => {
  test('posts the checksum contract and parses the presigned upload', async () => {
    const response = {
      expiresAt: '2030-01-01T00:00:00.000Z',
      headers: { 'content-type': 'image/jpeg', 'x-amz-meta-checksum-sha256': 'a'.repeat(64) },
      method: 'PUT' as const,
      uploadId: 'd75d89fc-c748-4cfc-a3e6-7c671aa36c3b',
      uploadUrl: 'https://uploads.example.test/report.jpg?signature=test',
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(response), {
          headers: { 'content-type': 'application/json' },
          status: 201,
        }),
    );
    const client = createApiClient({ fetcher, origin: 'https://api.example.test' });

    await expect(initiateImageUpload({ client, request })).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(INITIATE_IMAGE_UPLOAD_PATH, 'https://api.example.test'),
      expect.objectContaining({ body: JSON.stringify(request), method: 'POST' }),
    );
  });

  test('rejects a malformed presigned contract', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json({ uploadId: 'invalid' }),
      origin: 'https://api.example.test',
    });

    await expect(initiateImageUpload({ client, request })).rejects.toMatchObject({
      kind: 'contract',
    });
  });
});
