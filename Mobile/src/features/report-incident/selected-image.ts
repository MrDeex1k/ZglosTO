import {
  INCIDENT_IMAGE_MAX_BYTES,
  INCIDENT_UPLOAD_MIME_TYPES,
  type InitiateImageUploadRequest,
} from '@zglosto/contracts';

type IncidentImageMimeType = (typeof INCIDENT_UPLOAD_MIME_TYPES)[number];

export interface IncidentImageAsset {
  fileName?: null | string;
  fileSize?: number;
  height: number;
  mimeType?: null | string;
  uri: string;
  width: number;
}

export interface SelectedIncidentImage {
  fileName: string;
  height: number;
  mimeType: IncidentImageMimeType;
  sizeBytes: number;
  uri: string;
  width: number;
}

export type IncidentImageErrorCode = 'empty' | 'tooLarge' | 'unavailable' | 'unsupportedType';

export class IncidentImageError extends Error {
  readonly code: IncidentImageErrorCode;

  constructor(code: IncidentImageErrorCode) {
    super(code);
    this.name = 'IncidentImageError';
    this.code = code;
  }
}

const MIME_BY_EXTENSION: Record<string, IncidentImageMimeType> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function resolveMimeType(asset: IncidentImageAsset): IncidentImageMimeType {
  const declared = asset.mimeType?.toLowerCase();
  if (INCIDENT_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === declared)) {
    return declared as IncidentImageMimeType;
  }

  const candidateName = asset.fileName ?? asset.uri;
  const extension = candidateName.split(/[?#]/u)[0]?.split('.').pop()?.toLowerCase();
  const inferred = extension === undefined ? undefined : MIME_BY_EXTENSION[extension];
  if (inferred === undefined) throw new IncidentImageError('unsupportedType');
  return inferred;
}

export function selectIncidentImage(
  asset: IncidentImageAsset,
  actualSizeBytes: number,
): SelectedIncidentImage {
  if (asset.uri === '' || !Number.isSafeInteger(actualSizeBytes) || actualSizeBytes <= 0) {
    throw new IncidentImageError('empty');
  }
  if (actualSizeBytes > INCIDENT_IMAGE_MAX_BYTES) throw new IncidentImageError('tooLarge');

  return {
    fileName: asset.fileName?.trim() || `zdjecie.${resolveMimeType(asset).split('/')[1]}`,
    height: asset.height,
    mimeType: resolveMimeType(asset),
    sizeBytes: actualSizeBytes,
    uri: asset.uri,
    width: asset.width,
  };
}

export function bytesToLowercaseHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createImageUploadRequest(
  image: SelectedIncidentImage,
  checksumSha256: string,
): InitiateImageUploadRequest {
  return {
    checksumSha256,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
  };
}
