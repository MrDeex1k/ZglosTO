import {
  InitiateImageUploadResponseSchema,
  type InitiateImageUploadRequest,
  type InitiateImageUploadResponse,
} from '@zglosto/contracts';

import type { ApiClient } from './client';

export const INITIATE_IMAGE_UPLOAD_PATH = '/api/mieszkaniec/obrazy/uploads';

export function initiateImageUpload({
  client,
  request,
  signal,
}: {
  client: ApiClient;
  request: InitiateImageUploadRequest;
  signal?: AbortSignal;
}): Promise<InitiateImageUploadResponse> {
  return client.requestJson(INITIATE_IMAGE_UPLOAD_PATH, {
    body: request,
    method: 'POST',
    parser: (value) => InitiateImageUploadResponseSchema.parse(value),
    ...(signal === undefined ? {} : { signal }),
  });
}
