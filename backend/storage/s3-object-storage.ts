import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorageEnvironment } from '../config/env.ts';
import type {
  ObjectBody,
  ObjectMetadata,
  ObjectStorage,
  PresignedUpload,
  PresignedUploadInput,
  PutObjectInput,
  StoredObject,
  StoredObjectSummary,
} from './object-storage.ts';

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}

function normalizeObjectKey(objectKey: string): string {
  const normalized = objectKey.trim().replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => segment === '..' || segment === '')) {
    throw new Error(
      'Object key must be a non-empty relative path without empty or parent segments',
    );
  }
  return normalized;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly #autoCreateBucket: boolean;
  readonly #bucket: string;
  readonly #client: S3Client;
  readonly #presigningClient: S3Client;
  readonly #objectPrefix: string;

  constructor(configuration: ObjectStorageEnvironment) {
    this.#autoCreateBucket = configuration.autoCreateBucket;
    this.#bucket = configuration.bucket;
    this.#objectPrefix = configuration.objectPrefix;
    this.#client = new S3Client({
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
      endpoint: configuration.endpoint,
      forcePathStyle: configuration.forcePathStyle,
      region: configuration.region,
    });
    this.#presigningClient = new S3Client({
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
      endpoint: configuration.publicEndpoint,
      forcePathStyle: configuration.forcePathStyle,
      region: configuration.region,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.checkReadiness();
      return;
    } catch (error) {
      if (!this.#autoCreateBucket || !isNotFound(error)) {
        throw error;
      }
    }

    await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }));
    await this.checkReadiness();
  }

  async checkReadiness(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  close(): Promise<void> {
    this.#client.destroy();
    this.#presigningClient.destroy();
    return Promise.resolve();
  }

  async createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const checksumHeader = 'x-amz-meta-checksum-sha256';
    const uploadUrl = await getSignedUrl(
      this.#presigningClient,
      new PutObjectCommand({
        Bucket: this.#bucket,
        ContentLength: input.sizeBytes,
        ContentType: input.contentType,
        Key: this.#providerKey(objectKey),
        Metadata: { 'checksum-sha256': input.checksumSha256 },
      }),
      {
        expiresIn: input.expiresInSeconds,
        signableHeaders: new Set(['content-length', 'content-type']),
        unhoistableHeaders: new Set([checksumHeader]),
      },
    );
    return {
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000).toISOString(),
      headers: {
        'content-type': input.contentType,
        [checksumHeader]: input.checksumSha256,
      },
      method: 'PUT',
      uploadUrl,
    };
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const response = await this.#client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.#bucket,
        ContentType: input.contentType,
        Key: this.#providerKey(objectKey),
        Metadata: { 'checksum-sha256': input.checksumSha256 },
      }),
    );

    return {
      checksumSha256: input.checksumSha256,
      etag: response.ETag ?? null,
      objectKey,
      sizeBytes: input.body.byteLength,
      versionId: response.VersionId ?? null,
    };
  }

  async getObject(objectKey: string): Promise<ObjectBody> {
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.#providerKey(normalizedKey),
      }),
    );
    if (!response.Body) {
      throw new Error(`Object body is missing for key: ${normalizedKey}`);
    }
    const body = await response.Body.transformToByteArray();

    return {
      body,
      checksumSha256: response.Metadata?.['checksum-sha256'] ?? null,
      contentType: response.ContentType ?? null,
      objectKey: normalizedKey,
      sizeBytes: response.ContentLength ?? body.byteLength,
    };
  }

  async headObject(objectKey: string): Promise<ObjectMetadata> {
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await this.#client.send(
      new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: this.#providerKey(normalizedKey),
      }),
    );
    return {
      checksumSha256: response.Metadata?.['checksum-sha256'] ?? null,
      contentType: response.ContentType ?? null,
      objectKey: normalizedKey,
      sizeBytes: response.ContentLength ?? 0,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: this.#providerKey(normalizeObjectKey(objectKey)),
      }),
    );
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.#client.send(
        new HeadObjectCommand({
          Bucket: this.#bucket,
          Key: this.#providerKey(normalizeObjectKey(objectKey)),
        }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async *listObjects(): AsyncIterable<StoredObjectSummary> {
    const prefix = this.#providerPrefix();
    let continuationToken: string | null = null;

    do {
      // S3 pagination is inherently sequential because each response supplies the next token.
      // oxlint-disable-next-line no-await-in-loop
      const response: ListObjectsV2CommandOutput = await this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#bucket,
          ...(continuationToken === null ? {} : { ContinuationToken: continuationToken }),
          ...(prefix ? { Prefix: prefix } : {}),
        }),
      );

      for (const object of response.Contents ?? []) {
        const providerKey = object.Key ?? null;
        const sizeBytes = object.Size ?? null;
        if (providerKey === null || sizeBytes === null) continue;
        const objectKey = prefix ? providerKey.slice(prefix.length) : providerKey;
        if (!objectKey || (prefix && !providerKey.startsWith(prefix))) continue;
        yield { objectKey: normalizeObjectKey(objectKey), sizeBytes };
      }

      continuationToken = response.IsTruncated ? (response.NextContinuationToken ?? null) : null;
      if (response.IsTruncated && continuationToken === null) {
        throw new Error('S3 object listing was truncated without a continuation token');
      }
    } while (continuationToken !== null);
  }

  #providerKey(objectKey: string): string {
    return `${this.#providerPrefix()}${objectKey}`;
  }

  #providerPrefix(): string {
    return this.#objectPrefix ? `${this.#objectPrefix}/` : '';
  }
}
