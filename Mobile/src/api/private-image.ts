import { INCIDENT_IMAGE_MAX_BYTES, type IncidentImageRef } from '@zglosto/contracts';

import type { ApiClient } from './client';
import { ApiError } from './errors';

const ALLOWED_IMAGE_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);

export interface PrivateImagePayload {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

export function privateImagePath(image: IncidentImageRef): string {
  const expected = `/api/images/${image.id}`;
  if (image.url !== expected) {
    throw new ApiError('Private image URL does not match its resource identifier.', {
      kind: 'contract',
    });
  }
  return expected;
}

export async function loadPrivateImage({
  client,
  image,
  signal,
}: {
  client: ApiClient;
  image: IncidentImageRef;
  signal?: AbortSignal;
}): Promise<PrivateImagePayload> {
  const response = await client.raw(privateImagePath(image), {
    method: 'GET',
    ...(signal === undefined ? {} : { signal }),
  });
  const correlationId = response.headers.get('x-correlation-id');
  if (!response.ok) {
    throw new ApiError(`Private image request failed with HTTP ${response.status}.`, {
      correlationId,
      kind: 'http',
      status: response.status,
    });
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new ApiError('Private image response has an unsupported content type.', {
      correlationId,
      kind: 'contract',
      status: response.status,
    });
  }

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > INCIDENT_IMAGE_MAX_BYTES) {
    throw new ApiError('Private image response exceeds the size limit.', {
      correlationId,
      kind: 'contract',
      status: response.status,
    });
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > INCIDENT_IMAGE_MAX_BYTES) {
    throw new ApiError('Private image response has an invalid size.', {
      correlationId,
      kind: 'contract',
      status: response.status,
    });
  }
  return { bytes, mimeType };
}
