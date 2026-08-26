import type { IncidentImageRef } from '@zglosto/contracts';
import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import { loadPrivateImage, privateImagePath } from './private-image';

const image: IncidentImageRef = {
  failureCode: null,
  height: 120,
  id: '00000000-0000-4000-8000-000000000036',
  kind: 'report',
  original: {
    checksumSha256: 'a'.repeat(64),
    mimeType: 'image/png',
    objectKey: 'private/original.png',
    sizeBytes: 3,
  },
  processed: null,
  status: 'ready',
  url: '/api/images/00000000-0000-4000-8000-000000000036',
  width: 160,
};

describe('private image API', () => {
  test('downloads validated bytes from the image resource path', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(Uint8Array.from([1, 2, 3]), {
          headers: { 'content-length': '3', 'content-type': 'image/png' },
        }),
    );
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await expect(loadPrivateImage({ client, image })).resolves.toEqual({
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: 'image/png',
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL(`https://city.example${image.url}`),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('rejects a URL that does not match the image identifier', () => {
    expect(() => privateImagePath({ ...image, url: '/api/images/another-image' })).toThrow(
      'does not match',
    );
  });

  test('rejects non-image payloads before writing a private file', async () => {
    const client = createApiClient({
      fetcher: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      origin: 'https://city.example',
    });

    await expect(loadPrivateImage({ client, image })).rejects.toMatchObject({ kind: 'contract' });
  });
});
