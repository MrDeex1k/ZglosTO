import { expectRecord, expectString } from '@zglosto/contracts';
import type { ObjectStorage, StoredObjectSummary } from '../storage/object-storage.ts';
import type { DatabaseClient } from '../types.ts';

export interface ObjectStorageAuditResult {
  missingObjectKeys: string[];
  orphanedObjects: StoredObjectSummary[];
  referencedObjectCount: number;
  storedObjectCount: number;
}

export async function auditObjectStorage(
  database: DatabaseClient,
  storage: ObjectStorage,
): Promise<ObjectStorageAuditResult> {
  const result = await database.query(`
    SELECT original_object_key AS object_key
    FROM incident_images
    WHERE original_deleted_at IS NULL
    UNION
    SELECT processed_object_key AS object_key
    FROM incident_images
    WHERE processed_object_key IS NOT NULL
    UNION
    SELECT object_key
    FROM image_uploads
    WHERE status = 'pending' AND expires_at > CURRENT_TIMESTAMP
  `);
  const referencedKeys = new Set(
    result.rows.map((row, index) =>
      expectString(
        expectRecord(row, `referencedObjects[${index}]`).object_key,
        `referencedObjects[${index}].object_key`,
      ),
    ),
  );
  const storedObjects = new Map<string, StoredObjectSummary>();
  for await (const object of storage.listObjects()) {
    if (storedObjects.has(object.objectKey)) {
      throw new Error(`Object Storage returned a duplicate key: ${object.objectKey}`);
    }
    storedObjects.set(object.objectKey, object);
  }

  const missingObjectKeys = [...referencedKeys]
    .filter((objectKey) => !storedObjects.has(objectKey))
    .sort();
  const orphanedObjects = [...storedObjects.values()]
    .filter((object) => !referencedKeys.has(object.objectKey))
    .sort((left, right) => left.objectKey.localeCompare(right.objectKey));

  return {
    missingObjectKeys,
    orphanedObjects,
    referencedObjectCount: referencedKeys.size,
    storedObjectCount: storedObjects.size,
  };
}
