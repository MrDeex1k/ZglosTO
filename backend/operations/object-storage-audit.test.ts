import { describe, expect, test } from 'vitest';
import type {
  ObjectBody,
  ObjectStorage,
  PutObjectInput,
  StoredObject,
  StoredObjectSummary,
} from '../storage/object-storage.ts';
import type { DatabaseClient, DatabaseQueryResult } from '../types.ts';
import { auditObjectStorage } from './object-storage-audit.ts';

function databaseWithKeys(keys: readonly string[]): DatabaseClient {
  return {
    query: async (): Promise<DatabaseQueryResult> => ({
      rowCount: keys.length,
      rows: keys.map((objectKey) => ({ object_key: objectKey })),
    }),
  };
}

function storageWithObjects(objects: readonly StoredObjectSummary[]): ObjectStorage {
  return {
    checkReadiness: async () => {},
    close: async () => {},
    createPresignedUpload: async () => {
      throw new Error('not used');
    },
    deleteObject: async () => {},
    getObject: async (_objectKey: string): Promise<ObjectBody> => {
      throw new Error('not used');
    },
    headObject: async () => {
      throw new Error('not used');
    },
    initialize: async () => {},
    listObjects: async function* () {
      yield* objects;
    },
    objectExists: async () => false,
    putObject: async (_input: PutObjectInput): Promise<StoredObject> => {
      throw new Error('not used');
    },
  };
}

describe('Object Storage audit', () => {
  test('reports missing database references and orphaned stored objects', async () => {
    const result = await auditObjectStorage(
      databaseWithKeys(['present.jpg', 'missing.jpg']),
      storageWithObjects([
        { objectKey: 'present.jpg', sizeBytes: 10 },
        { objectKey: 'orphan.jpg', sizeBytes: 20 },
      ]),
    );

    expect(result).toEqual({
      missingObjectKeys: ['missing.jpg'],
      orphanedObjects: [{ objectKey: 'orphan.jpg', sizeBytes: 20 }],
      referencedObjectCount: 2,
      storedObjectCount: 2,
    });
  });

  test('accepts a consistent database and bucket', async () => {
    const result = await auditObjectStorage(
      databaseWithKeys(['one.jpg']),
      storageWithObjects([{ objectKey: 'one.jpg', sizeBytes: 10 }]),
    );
    expect(result.missingObjectKeys).toEqual([]);
    expect(result.orphanedObjects).toEqual([]);
  });
});
