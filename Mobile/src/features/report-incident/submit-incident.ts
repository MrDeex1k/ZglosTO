import type {
  CurrentCreateIncidentRequest,
  CurrentCreateIncidentResponse,
  InitiateImageUploadRequest,
  InitiateImageUploadResponse,
} from '@zglosto/contracts';

import type { ApiClient } from '@/api/client';
import { createIncident } from '@/api/create-incident';
import { initiateImageUpload } from '@/api/image-upload';

import type { SelectedIncidentImage } from './selected-image';

interface SubmitIncidentDependencies {
  checksumImage: (image: SelectedIncidentImage) => Promise<InitiateImageUploadRequest>;
  create?: typeof createIncident;
  initiateUpload?: typeof initiateImageUpload;
  uploadImage: (options: {
    image: SelectedIncidentImage;
    onProgress?: (sent: number, total: number) => void;
    signal?: AbortSignal;
    upload: InitiateImageUploadResponse;
  }) => Promise<void>;
}

export async function submitIncidentWithOptionalImage({
  client,
  dependencies,
  image,
  onCreatingIncident,
  onProgress,
  request,
  signal,
}: {
  client: ApiClient;
  dependencies: SubmitIncidentDependencies;
  image: SelectedIncidentImage | null;
  onCreatingIncident?: () => void;
  onProgress?: (sent: number, total: number) => void;
  request: CurrentCreateIncidentRequest;
  signal?: AbortSignal;
}): Promise<CurrentCreateIncidentResponse> {
  let uploadId: null | string = null;

  if (image !== null) {
    const uploadRequest = await dependencies.checksumImage(image);
    if (signal?.aborted) throw new DOMException('Request was cancelled.', 'AbortError');
    const upload = await (dependencies.initiateUpload ?? initiateImageUpload)({
      client,
      request: uploadRequest,
      ...(signal === undefined ? {} : { signal }),
    });
    await dependencies.uploadImage({
      image,
      ...(onProgress === undefined ? {} : { onProgress }),
      ...(signal === undefined ? {} : { signal }),
      upload,
    });
    uploadId = upload.uploadId;
  }

  onCreatingIncident?.();
  return (dependencies.create ?? createIncident)({
    client,
    request: {
      ...request,
      zdjecie_incydentu_zglaszanego_upload_id: uploadId,
    },
    ...(signal === undefined ? {} : { signal }),
  });
}
