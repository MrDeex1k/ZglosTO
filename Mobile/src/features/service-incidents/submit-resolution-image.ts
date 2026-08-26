import type { InitiateImageUploadRequest, InitiateImageUploadResponse } from '@zglosto/contracts';

import type { ApiClient } from '@/api/client';
import {
  attachServiceResolutionImage,
  initiateServiceResolutionUpload,
  type IncidentMutationResult,
} from '@/api/service-incidents';
import type { SelectedIncidentImage } from '@/features/report-incident/selected-image';

interface ResolutionImageDependencies {
  attach?: typeof attachServiceResolutionImage;
  checksumImage: (image: SelectedIncidentImage) => Promise<InitiateImageUploadRequest>;
  initiate?: typeof initiateServiceResolutionUpload;
  uploadImage: (options: {
    image: SelectedIncidentImage;
    onProgress?: (sent: number, total: number) => void;
    signal?: AbortSignal;
    upload: InitiateImageUploadResponse;
  }) => Promise<void>;
}

export async function submitServiceResolutionImage({
  client,
  dependencies,
  image,
  incidentId,
  onProgress,
  signal,
}: {
  client: ApiClient;
  dependencies: ResolutionImageDependencies;
  image: SelectedIncidentImage;
  incidentId: string;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<IncidentMutationResult> {
  const request = await dependencies.checksumImage(image);
  if (signal?.aborted) throw new DOMException('Request was cancelled.', 'AbortError');
  const upload = await (dependencies.initiate ?? initiateServiceResolutionUpload)({
    client,
    incidentId,
    request,
    ...(signal === undefined ? {} : { signal }),
  });
  await dependencies.uploadImage({
    image,
    ...(onProgress === undefined ? {} : { onProgress }),
    ...(signal === undefined ? {} : { signal }),
    upload,
  });
  return (dependencies.attach ?? attachServiceResolutionImage)({
    client,
    incidentId,
    uploadId: upload.uploadId,
    ...(signal === undefined ? {} : { signal }),
  });
}
