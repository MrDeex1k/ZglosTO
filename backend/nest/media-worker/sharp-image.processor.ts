import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ImageObjectMetadata } from '@zglosto/contracts';
import sharp, { type Metadata, type Sharp } from 'sharp';
import type { ObjectBody } from '../../storage/object-storage.ts';
import {
  parseMediaWorkerEnvironment,
  type MediaWorkerEnvironment,
} from './media-worker.environment.ts';
import { MediaProcessingError } from './media-processing.error.ts';

const SUPPORTED_FORMATS = new Set(['gif', 'jpeg', 'png', 'webp']);
const MIME_BY_FORMAT: Readonly<Record<string, string>> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface ProcessedImage {
  body: Uint8Array;
  height: number;
  metadata: ImageObjectMetadata;
  width: number;
}

@Injectable()
export class SharpImageProcessor {
  private readonly environment: MediaWorkerEnvironment;

  constructor() {
    this.environment = parseMediaWorkerEnvironment(process.env);
    sharp.cache({ files: 0, items: 50, memory: 32 });
    sharp.concurrency(this.environment.sharpConcurrency);
  }

  async process(
    source: ObjectBody,
    expected: ImageObjectMetadata,
    outputKey: string,
  ): Promise<ProcessedImage> {
    this.validateStoredObject(source, expected);
    const input = Buffer.from(source.body);
    const image = sharp(input, {
      autoOrient: true,
      failOn: 'warning',
      limitInputChannels: 4,
      limitInputPixels: this.environment.maxInputPixels,
      pages: 1,
      sequentialRead: true,
    });
    const metadata = await this.readMetadata(image);
    this.validateMetadata(metadata, expected.mimeType);

    let encoded: Awaited<ReturnType<typeof image.toBuffer>>;
    try {
      encoded = await image
        .resize({
          fit: 'inside',
          height: this.environment.maxOutputDimension,
          width: this.environment.maxOutputDimension,
          withoutEnlargement: true,
        })
        .toColourspace('srgb')
        .webp({
          effort: this.environment.webpEffort,
          quality: this.environment.webpQuality,
          smartSubsample: true,
        })
        .toBuffer({ resolveWithObject: true });
    } catch (error: unknown) {
      throw new MediaProcessingError('processing_failed', true, 'Could not encode WebP', {
        cause: error,
      });
    }

    if (encoded.info.width <= 0 || encoded.info.height <= 0 || encoded.data.byteLength === 0) {
      throw new MediaProcessingError('processing_failed', true, 'Sharp returned an empty image');
    }
    const checksumSha256 = createHash('sha256').update(encoded.data).digest('hex');
    return {
      body: encoded.data,
      height: encoded.info.height,
      metadata: {
        checksumSha256,
        mimeType: 'image/webp',
        objectKey: outputKey,
        sizeBytes: encoded.data.byteLength,
      },
      width: encoded.info.width,
    };
  }

  private validateStoredObject(source: ObjectBody, expected: ImageObjectMetadata): void {
    if (
      source.sizeBytes !== source.body.byteLength ||
      source.body.byteLength !== expected.sizeBytes ||
      source.body.byteLength > this.environment.maxInputBytes
    ) {
      throw new MediaProcessingError(
        'size_limit_exceeded',
        false,
        'Stored image size does not match its contract or exceeds the limit',
      );
    }
    const checksum = createHash('sha256').update(source.body).digest('hex');
    if (
      checksum !== expected.checksumSha256 ||
      (source.checksumSha256 !== null && source.checksumSha256 !== checksum)
    ) {
      throw new MediaProcessingError('invalid_content', false, 'Stored image checksum mismatch');
    }
    if (source.contentType !== expected.mimeType) {
      throw new MediaProcessingError('invalid_content', false, 'Stored image MIME mismatch');
    }
  }

  private async readMetadata(image: Sharp): Promise<Metadata> {
    try {
      return await image.metadata();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('pixel limit')) {
        throw new MediaProcessingError('pixel_limit_exceeded', false, 'Image exceeds pixel limit', {
          cause: error,
        });
      }
      throw new MediaProcessingError('invalid_content', false, 'Image cannot be decoded', {
        cause: error,
      });
    }
  }

  private validateMetadata(metadata: Metadata, expectedMimeType: string): void {
    const format = metadata.format ?? null;
    if (format === null || !SUPPORTED_FORMATS.has(format)) {
      throw new MediaProcessingError('unsupported_format', false, 'Unsupported image format');
    }
    if (MIME_BY_FORMAT[format] !== expectedMimeType || metadata.mediaType !== expectedMimeType) {
      throw new MediaProcessingError('invalid_content', false, 'Decoded image MIME mismatch');
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw new MediaProcessingError(
        'unsupported_format',
        false,
        'Animated images are not supported',
      );
    }
    const width = metadata.autoOrient.width;
    const height = metadata.autoOrient.height;
    if (width > this.environment.maxInputWidth || height > this.environment.maxInputHeight) {
      throw new MediaProcessingError('size_limit_exceeded', false, 'Image dimensions exceed limit');
    }
    if (width * height > this.environment.maxInputPixels) {
      throw new MediaProcessingError('pixel_limit_exceeded', false, 'Image exceeds pixel limit');
    }
  }
}
