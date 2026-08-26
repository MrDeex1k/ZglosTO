import type { IncidentImageRef } from '@zglosto/contracts';
import { queryOptions } from '@tanstack/react-query';

import type { ApiClient } from '@/api/client';
import { loadPrivateImage } from '@/api/private-image';
import { storePrivateImage } from '@/storage/private-image-cache';

import { queryKeys } from './query-keys';

export function privateImageQueryOptions({
  client,
  image,
  origin,
  userId,
}: {
  client: ApiClient;
  image: IncidentImageRef;
  origin: string;
  userId: string;
}) {
  const checksumSha256 = image.processed?.checksumSha256 ?? image.original.checksumSha256;
  return queryOptions({
    gcTime: 30 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const payload = await loadPrivateImage({ client, image, signal });
      return storePrivateImage({
        bytes: payload.bytes,
        checksumSha256,
        imageId: image.id,
        mimeType: payload.mimeType,
        userId,
      });
    },
    queryKey: queryKeys.privateImage(origin, userId, image.id, checksumSha256),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
