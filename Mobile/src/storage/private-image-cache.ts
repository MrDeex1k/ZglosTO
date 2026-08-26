import { Directory, File, Paths } from 'expo-file-system';

const PRIVATE_IMAGE_CACHE_DIRECTORY = 'zglosto-private-images';

function safeSegment(value: string): string {
  if (!/^[\w-]+$/.test(value)) throw new Error('Unsafe private image cache identifier.');
  return value;
}

function privateImageCacheFileName(
  imageId: string,
  checksumSha256: string,
  mimeType: string,
): string {
  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/avif'
        ? 'avif'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
  return `${safeSegment(imageId)}-${safeSegment(checksumSha256)}.${extension}`;
}

function rootDirectory(): Directory {
  return new Directory(Paths.cache, PRIVATE_IMAGE_CACHE_DIRECTORY);
}

function userDirectory(userId: string): Directory {
  return new Directory(rootDirectory(), safeSegment(userId));
}

export function storePrivateImage({
  bytes,
  checksumSha256,
  imageId,
  mimeType,
  userId,
}: {
  bytes: Uint8Array;
  checksumSha256: string;
  imageId: string;
  mimeType: string;
  userId: string;
}): string {
  const directory = userDirectory(userId);
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, privateImageCacheFileName(imageId, checksumSha256, mimeType));
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

export function clearPrivateImageCache(): void {
  const directory = rootDirectory();
  if (directory.exists) directory.delete();
}
