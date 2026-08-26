import { createHash, randomUUID } from 'node:crypto';
import { validateBackendEnvironment } from '../config/env.ts';
import { S3ObjectStorage } from './s3-object-storage.ts';

async function verifyStorage(): Promise<void> {
  const environment = validateBackendEnvironment();
  const storage = new S3ObjectStorage(environment.objectStorage);
  const objectKey = `.integration/${randomUUID()}.txt`;
  const body = new TextEncoder().encode('ZglosTO object storage integration probe');
  const checksumSha256 = createHash('sha256').update(body).digest('hex');

  await storage.initialize();
  await storage.putObject({
    body,
    checksumSha256,
    contentType: 'text/plain; charset=utf-8',
    objectKey,
  });

  try {
    if (!(await storage.objectExists(objectKey))) {
      throw new Error('Stored object was not found');
    }
    const stored = await storage.getObject(objectKey);
    if (new TextDecoder().decode(stored.body) !== new TextDecoder().decode(body)) {
      throw new Error('Stored object body does not match the uploaded body');
    }
    if (stored.checksumSha256 !== checksumSha256) {
      throw new Error('Stored object checksum metadata does not match');
    }
  } finally {
    await storage.deleteObject(objectKey);
  }

  if (await storage.objectExists(objectKey)) {
    throw new Error('Stored object still exists after deletion');
  }
  console.log('Object Storage put/get/head/delete verification passed');
}

verifyStorage().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Object Storage verification failed');
  process.exitCode = 1;
});
