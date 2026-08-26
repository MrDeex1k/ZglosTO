import {
  InitiateImageUploadRequestSchema,
  type InitiateImageUploadResponse,
} from '@zglosto/contracts';
import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import { Directory, File, Paths, UploadType, type UploadProgress } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

import { ApiError, isAbortError } from '@/api/errors';

import {
  bytesToLowercaseHex,
  createImageUploadRequest,
  IncidentImageError,
  selectIncidentImage,
  type SelectedIncidentImage,
} from './selected-image';

const SELECTED_MEDIA_DIRECTORY = 'zglosto-selected-media';

function selectedMediaDirectory(): Directory {
  return new Directory(Paths.cache, SELECTED_MEDIA_DIRECTORY);
}

export async function loadSelectedIncidentImage(
  asset: ImagePickerAsset,
): Promise<SelectedIncidentImage> {
  const source = new File(asset.uri);
  if (!source.exists) throw new IncidentImageError('unavailable');
  const selected = selectIncidentImage(asset, source.size);
  const directory = selectedMediaDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const extension = selected.mimeType.split('/')[1] ?? 'jpg';
  const controlledFile = new File(directory, `${randomUUID()}.${extension}`);

  try {
    await source.copy(controlledFile);
    if (!controlledFile.exists || controlledFile.size !== selected.sizeBytes) {
      throw new IncidentImageError('unavailable');
    }
    return { ...selected, uri: controlledFile.uri };
  } catch (error) {
    if (controlledFile.exists) controlledFile.delete();
    if (error instanceof IncidentImageError) throw error;
    throw new IncidentImageError('unavailable');
  }
}

export function removeSelectedIncidentImage(image: SelectedIncidentImage): void {
  const directory = selectedMediaDirectory();
  if (!image.uri.startsWith(`${directory.uri}/`)) return;
  const file = new File(image.uri);
  if (file.exists) file.delete();
}

export function clearSelectedIncidentMedia(): void {
  const directory = selectedMediaDirectory();
  if (directory.exists) directory.delete();
}

export async function checksumIncidentImage(
  image: SelectedIncidentImage,
): Promise<ReturnType<typeof createImageUploadRequest>> {
  const file = new File(image.uri);
  if (!file.exists || file.size !== image.sizeBytes) throw new IncidentImageError('unavailable');
  const bytes = await file.bytes();
  const checksumSha256 = bytesToLowercaseHex(await digest(CryptoDigestAlgorithm.SHA256, bytes));
  return InitiateImageUploadRequestSchema.parse(createImageUploadRequest(image, checksumSha256));
}

function validateUploadTarget(upload: InitiateImageUploadResponse): void {
  const url = new URL(upload.uploadUrl);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new ApiError('Invalid presigned upload URL.', { kind: 'contract' });
  }
  if (Date.parse(upload.expiresAt) <= Date.now()) {
    throw new ApiError('Presigned upload URL has expired.', { kind: 'contract' });
  }
}

export async function uploadPresignedIncidentImage({
  image,
  onProgress,
  signal,
  upload,
}: {
  image: SelectedIncidentImage;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  upload: InitiateImageUploadResponse;
}): Promise<void> {
  validateUploadTarget(upload);
  const file = new File(image.uri);
  if (!file.exists || file.size !== image.sizeBytes) throw new IncidentImageError('unavailable');

  try {
    const response = await file
      .createUploadTask(upload.uploadUrl, {
        headers: upload.headers,
        httpMethod: 'PUT',
        mimeType: image.mimeType,
        ...(onProgress === undefined ? {} : { onProgress }),
        sessionType: 'foreground',
        ...(signal === undefined ? {} : { signal }),
        uploadType: UploadType.BINARY_CONTENT,
      })
      .uploadAsync();

    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(`Image upload failed with HTTP ${response.status}.`, {
        kind: 'http',
        status: response.status,
      });
    }
  } catch (error) {
    if (error instanceof ApiError || error instanceof IncidentImageError) throw error;
    if (isAbortError(error) || signal?.aborted) {
      throw new ApiError('Image upload was cancelled.', { cause: error, kind: 'aborted' });
    }
    throw new ApiError('Image upload is unavailable.', { cause: error, kind: 'network' });
  }
}
