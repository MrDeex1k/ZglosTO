import type { IncidentImageRef } from '@zglosto/contracts';
import { QueryClient } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';

const { load, store } = vi.hoisted(() => ({ load: vi.fn(), store: vi.fn() }));
vi.mock('@/api/private-image', () => ({ loadPrivateImage: load }));
vi.mock('@/storage/private-image-cache', () => ({ storePrivateImage: store }));
import { createApiClient } from '@/api/client';
import { privateImageQueryOptions } from './private-image';

const image: IncidentImageRef = {
  id: '00000000-0000-4000-8000-000000000036',
  kind: 'report',
  status: 'ready',
  failureCode: null,
  height: 120,
  width: 160,
  url: '/api/images/00000000-0000-4000-8000-000000000036',
  original: {
    checksumSha256: 'a'.repeat(64),
    mimeType: 'image/png',
    objectKey: 'private/original.png',
    sizeBytes: 3,
  },
  processed: null,
};

test('a late image response cannot recreate private files after query removal', async () => {
  const response = Promise.withResolvers<{ bytes: Uint8Array; mimeType: string }>();
  load.mockReturnValueOnce(response.promise);
  const client = new QueryClient();
  const options = privateImageQueryOptions({
    client: createApiClient({ origin: 'https://city.example' }),
    origin: 'https://city.example',
    userId: 'user-1',
    image,
  });
  const request = client.fetchQuery(options);
  const assertion = expect(request).rejects.toThrow();
  client.removeQueries({ queryKey: options.queryKey });
  await assertion;
  response.resolve({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
  await response.promise;
  await Promise.resolve();
  expect(store).not.toHaveBeenCalled();
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
  client.clear();
});
