import { validateBackendEnvironment } from '../config/env.ts';
import { closeDatabase, database } from '../database.ts';
import { S3ObjectStorage } from '../storage/s3-object-storage.ts';
import { auditObjectStorage } from './object-storage-audit.ts';

async function main(): Promise<void> {
  const storage = new S3ObjectStorage(validateBackendEnvironment().objectStorage);
  await storage.checkReadiness();
  const result = await auditObjectStorage(database, storage);
  console.log(JSON.stringify(result, null, 2));
  if (result.missingObjectKeys.length > 0 || result.orphanedObjects.length > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Object Storage audit failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
