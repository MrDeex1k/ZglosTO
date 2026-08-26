import { validateBackendEnvironment } from '../config/env.ts';
import { S3ObjectStorage } from '../storage/s3-object-storage.ts';
import {
  restoreObjectStorageArchive,
  writeObjectStorageArchive,
} from './object-storage-archive.ts';

async function main(): Promise<void> {
  const operation = process.argv[2] ?? '';
  const storage = new S3ObjectStorage(validateBackendEnvironment().objectStorage);
  await storage.initialize();

  if (operation === 'backup') {
    const summary = await writeObjectStorageArchive(storage, process.stdout);
    console.error(`Object Storage backup completed: ${summary.objectCount} objects`);
    return;
  }
  if (operation === 'restore') {
    const summary = await restoreObjectStorageArchive(storage, process.stdin);
    console.error(`Object Storage restore completed: ${summary.objectCount} objects`);
    return;
  }
  throw new Error('Usage: object-storage-archive <backup|restore>');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Object Storage archive failed');
  process.exitCode = 1;
});
