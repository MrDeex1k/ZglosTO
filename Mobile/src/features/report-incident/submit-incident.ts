import type {
  CurrentCreateIncidentRequest,
  CurrentCreateIncidentResponse,
  InitiateImageUploadRequest,
  InitiateImageUploadResponse,
} from '@zglosto/contracts';

import type { ApiClient } from '@/api/client';
import { createIncident } from '@/api/create-incident';
import { ApiError } from '@/api/errors';
import { initiateImageUpload } from '@/api/image-upload';

import type { SelectedIncidentImage } from './selected-image';

export interface IncidentSubmissionAttempt {
  idempotencyKey: string;
  preparedRequest?: CurrentCreateIncidentRequest;
}

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
  attempt,
  client,
  dependencies,
  image,
  onCreatingIncident,
  onProgress,
  request,
  signal,
}: {
  attempt: IncidentSubmissionAttempt;
  client: ApiClient;
  dependencies: SubmitIncidentDependencies;
  image: SelectedIncidentImage | null;
  onCreatingIncident?: () => void;
  onProgress?: (sent: number, total: number) => void;
  request: CurrentCreateIncidentRequest;
  signal?: AbortSignal;
}): Promise<CurrentCreateIncidentResponse> {
  if (attempt.preparedRequest === undefined) {
    const uploadId =
      image === null ? null : await prepareImage(client, dependencies, image, signal, onProgress);
    attempt.preparedRequest = { ...request, zdjecie_incydentu_zglaszanego_upload_id: uploadId };
  }

  onCreatingIncident?.();
  try {
    return await (dependencies.create ?? createIncident)({
      client,
      idempotencyKey: attempt.idempotencyKey,
      request: attempt.preparedRequest,
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    // An expired or invalid upload may be renewed after an explicit rejection.
    // Keep the key so a committed attempt can never create a second report.
    if (image !== null && error instanceof ApiError && error.status === 400) {
      delete attempt.preparedRequest;
    }
    throw error;
  }
}

async function prepareImage(
  client: ApiClient,
  dependencies: SubmitIncidentDependencies,
  image: SelectedIncidentImage,
  signal: AbortSignal | undefined,
  onProgress: ((sent: number, total: number) => void) | undefined,
): Promise<string> {
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
  return upload.uploadId;
}
