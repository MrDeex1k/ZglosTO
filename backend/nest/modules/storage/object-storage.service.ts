import { Injectable } from '@nestjs/common';
import { addCounter, recordHistogram } from '@zglosto/observability';
import { validateObjectStorageEnvironment } from '../../../config/env.ts';
import type {
  ObjectBody,
  ObjectMetadata,
  ObjectStorage,
  PresignedUpload,
  PresignedUploadInput,
  PutObjectInput,
  StoredObject,
  StoredObjectSummary,
} from '../../../storage/object-storage.ts';
import { S3ObjectStorage } from '../../../storage/s3-object-storage.ts';
import { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';
import { ObjectStorageReadinessProbe } from './storage-readiness.probe.ts';

@Injectable()
export class ObjectStorageService extends ObjectStorageReadinessProbe implements ObjectStorage {
  private storageInstance: S3ObjectStorage | null = null;
  private initialization: Promise<S3ObjectStorage> | null = null;
  private closed = false;

  constructor(shutdown: GracefulShutdownRegistry) {
    super();
    shutdown.register({ name: 'object-storage-client', close: () => this.close() });
  }

  check(): Promise<void> {
    return this.checkReadiness();
  }

  async initialize(): Promise<void> {
    await this.storage();
  }

  async checkReadiness(): Promise<void> {
    const storage = await this.storage();
    await storage.checkReadiness();
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    return this.measured('put', () => this.storage().then((storage) => storage.putObject(input)));
  }

  async createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload> {
    return this.measured('presign', () =>
      this.storage().then((storage) => storage.createPresignedUpload(input)),
    );
  }

  async getObject(objectKey: string): Promise<ObjectBody> {
    return this.measured('get', () =>
      this.storage().then((storage) => storage.getObject(objectKey)),
    );
  }

  async headObject(objectKey: string): Promise<ObjectMetadata> {
    return this.measured('head', () =>
      this.storage().then((storage) => storage.headObject(objectKey)),
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.measured('delete', () =>
      this.storage().then((storage) => storage.deleteObject(objectKey)),
    );
  }

  async objectExists(objectKey: string): Promise<boolean> {
    return this.measured('head', () =>
      this.storage().then((storage) => storage.objectExists(objectKey)),
    );
  }

  async *listObjects(): AsyncIterable<StoredObjectSummary> {
    const storage = await this.storage();
    yield* storage.listObjects();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const storage =
      this.storageInstance ??
      (this.initialization === null ? null : await this.initialization.catch(() => null));
    this.storageInstance = null;
    this.initialization = null;
    if (storage !== null) await storage.close();
  }

  private storage(): Promise<S3ObjectStorage> {
    if (this.closed) return Promise.reject(new Error('Object Storage client is closed'));
    if (this.storageInstance !== null) return Promise.resolve(this.storageInstance);
    if (this.initialization === null) {
      const storage = new S3ObjectStorage(validateObjectStorageEnvironment());
      this.initialization = storage.initialize().then(
        () => {
          this.storageInstance = storage;
          return storage;
        },
        (error: unknown) => {
          storage.close().catch(() => Promise.resolve());
          this.initialization = null;
          throw error;
        },
      );
    }
    return this.initialization;
  }

  private async measured<Result>(
    operation: 'delete' | 'get' | 'head' | 'presign' | 'put',
    execute: () => Promise<Result>,
  ): Promise<Result> {
    const startedAt = performance.now();
    try {
      const result = await execute();
      addCounter('zglosto_object_storage_operations', 1, { operation, result: 'success' });
      return result;
    } catch (error: unknown) {
      addCounter('zglosto_object_storage_operations', 1, { operation, result: 'error' });
      throw error;
    } finally {
      recordHistogram(
        'zglosto_object_storage_operation_duration_seconds',
        (performance.now() - startedAt) / 1_000,
        { operation },
      );
    }
  }
}
