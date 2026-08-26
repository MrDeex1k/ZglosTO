import { expect, test, vi } from 'vitest';

import { createApiClient } from '@/api/client';
import type { SelectedIncidentImage } from '@/features/report-incident/selected-image';

import { submitServiceResolutionImage } from './submit-resolution-image';

const image: SelectedIncidentImage = {
  fileName: 'resolution.png',
  height: 100,
  mimeType: 'image/png',
  sizeBytes: 3,
  uri: 'file:///resolution.png',
  width: 100,
};

test('service resolution upload completes presigned PUT before attaching the upload ID', async () => {
  const checksumImage = vi.fn(async () => ({
    checksumSha256: 'a'.repeat(64),
    mimeType: 'image/png' as const,
    sizeBytes: 3,
  }));
  const initiate = vi.fn(async () => ({
    expiresAt: '2099-01-01T00:00:00.000Z',
    headers: { 'Content-Type': 'image/png' },
    method: 'PUT' as const,
    uploadId: '00000000-0000-4000-8000-000000000041',
    uploadUrl: 'https://uploads.example/private',
  }));
  const uploadImage = vi.fn(async () => undefined);
  const attach = vi.fn(async () => ({
    incydent: {} as never,
    success: true as const,
  }));
  const client = createApiClient({ fetcher: vi.fn(), origin: 'https://city.example' });

  await submitServiceResolutionImage({
    client,
    dependencies: { attach, checksumImage, initiate, uploadImage },
    image,
    incidentId: '00000000-0000-4000-8000-000000000042',
  });

  expect(checksumImage).toHaveBeenCalledWith(image);
  expect(uploadImage).toHaveBeenCalledWith(
    expect.objectContaining({
      image,
      upload: expect.objectContaining({ uploadId: expect.any(String) }),
    }),
  );
  expect(attach).toHaveBeenCalledWith(
    expect.objectContaining({ uploadId: '00000000-0000-4000-8000-000000000041' }),
  );
  expect(uploadImage.mock.invocationCallOrder[0]!).toBeLessThan(
    attach.mock.invocationCallOrder[0]!,
  );
});

test('does not attach an image when the presigned upload fails', async () => {
  const uploadError = new Error('upload failed');
  const attach = vi.fn();
  const client = createApiClient({ fetcher: vi.fn(), origin: 'https://city.example' });

  await expect(
    submitServiceResolutionImage({
      client,
      dependencies: {
        attach,
        checksumImage: vi.fn(async () => ({
          checksumSha256: 'a'.repeat(64),
          mimeType: 'image/png' as const,
          sizeBytes: 3,
        })),
        initiate: vi.fn(async () => ({
          expiresAt: '2099-01-01T00:00:00.000Z',
          headers: { 'Content-Type': 'image/png' },
          method: 'PUT' as const,
          uploadId: '00000000-0000-4000-8000-000000000041',
          uploadUrl: 'https://uploads.example/private',
        })),
        uploadImage: vi.fn(async () => {
          throw uploadError;
        }),
      },
      image,
      incidentId: '00000000-0000-4000-8000-000000000042',
    }),
  ).rejects.toBe(uploadError);
  expect(attach).not.toHaveBeenCalled();
});

test('stops before creating an upload when cancellation follows checksum calculation', async () => {
  const controller = new AbortController();
  const initiate = vi.fn();
  const client = createApiClient({ fetcher: vi.fn(), origin: 'https://city.example' });

  await expect(
    submitServiceResolutionImage({
      client,
      dependencies: {
        checksumImage: vi.fn(async () => {
          controller.abort();
          return {
            checksumSha256: 'a'.repeat(64),
            mimeType: 'image/png' as const,
            sizeBytes: 3,
          };
        }),
        initiate,
        uploadImage: vi.fn(),
      },
      image,
      incidentId: '00000000-0000-4000-8000-000000000042',
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(initiate).not.toHaveBeenCalled();
});
