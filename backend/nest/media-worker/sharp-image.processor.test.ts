import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjectBody } from '../../storage/object-storage.ts';
import { MediaProcessingError } from './media-processing.error.ts';
import { SharpImageProcessor } from './sharp-image.processor.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function jpegSource(): Promise<ObjectBody> {
  const body = await sharp({
    create: {
      background: { alpha: 1, b: 20, g: 120, r: 220 },
      channels: 4,
      height: 1,
      width: 2,
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const checksumSha256 = createHash('sha256').update(body).digest('hex');
  return {
    body,
    checksumSha256,
    contentType: 'image/jpeg',
    objectKey: 'incident/report/image/original.jpg',
    sizeBytes: body.byteLength,
  };
}

describe('SharpImageProcessor', () => {
  it('auto-orients, strips metadata and emits deterministic WebP metadata', async () => {
    const source = await jpegSource();
    const result = await new SharpImageProcessor().process(
      source,
      {
        checksumSha256: source.checksumSha256 ?? '',
        mimeType: 'image/jpeg',
        objectKey: source.objectKey,
        sizeBytes: source.sizeBytes,
      },
      'incident/report/image/revision-1.webp',
    );

    expect(result).toMatchObject({
      height: 2,
      metadata: {
        mimeType: 'image/webp',
        objectKey: 'incident/report/image/revision-1.webp',
        sizeBytes: result.body.byteLength,
      },
      width: 1,
    });
    expect(result.metadata.checksumSha256).toBe(
      createHash('sha256').update(result.body).digest('hex'),
    );
    const outputMetadata = await sharp(result.body).metadata();
    expect(outputMetadata).toMatchObject({ format: 'webp', height: 2, width: 1 });
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
    expect(outputMetadata.xmp).toBeUndefined();
  });

  it('rejects contract checksum, MIME and size mismatches before decoding', async () => {
    const source = await jpegSource();
    const processor = new SharpImageProcessor();
    const expected = {
      checksumSha256: source.checksumSha256 ?? '',
      mimeType: 'image/jpeg',
      objectKey: source.objectKey,
      sizeBytes: source.sizeBytes,
    };

    await expect(
      processor.process(source, { ...expected, checksumSha256: '0'.repeat(64) }, 'result.webp'),
    ).rejects.toMatchObject({ failureCode: 'invalid_content', retryable: false });
    await expect(
      processor.process(source, { ...expected, mimeType: 'image/png' }, 'result.webp'),
    ).rejects.toMatchObject({ failureCode: 'invalid_content', retryable: false });
    await expect(
      processor.process(source, { ...expected, sizeBytes: source.sizeBytes + 1 }, 'result.webp'),
    ).rejects.toMatchObject({ failureCode: 'size_limit_exceeded', retryable: false });
  });

  it('enforces the configured decompression pixel limit', async () => {
    vi.stubEnv('MEDIA_MAX_INPUT_PIXELS', '50');
    const body = await sharp({
      create: {
        background: 'white',
        channels: 3,
        height: 10,
        width: 10,
      },
    })
      .png()
      .toBuffer();
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const source: ObjectBody = {
      body,
      checksumSha256,
      contentType: 'image/png',
      objectKey: 'large.png',
      sizeBytes: body.byteLength,
    };

    await expect(
      new SharpImageProcessor().process(
        source,
        {
          checksumSha256,
          mimeType: 'image/png',
          objectKey: source.objectKey,
          sizeBytes: body.byteLength,
        },
        'result.webp',
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof MediaProcessingError && error.failureCode === 'pixel_limit_exceeded',
    );
  });

  it('limits the longer output side to 2000 pixels', async () => {
    const body = await sharp({
      create: {
        background: 'white',
        channels: 3,
        height: 100,
        width: 2500,
      },
    })
      .jpeg()
      .toBuffer();
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const source: ObjectBody = {
      body,
      checksumSha256,
      contentType: 'image/jpeg',
      objectKey: 'wide.jpg',
      sizeBytes: body.byteLength,
    };

    const result = await new SharpImageProcessor().process(
      source,
      {
        checksumSha256,
        mimeType: 'image/jpeg',
        objectKey: source.objectKey,
        sizeBytes: source.sizeBytes,
      },
      'wide.webp',
    );

    expect(result).toMatchObject({ width: 2000, height: 80 });
  });
});
