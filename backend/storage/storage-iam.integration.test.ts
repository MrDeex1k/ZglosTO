import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { afterAll, describe, expect, test } from 'vitest';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { S3ObjectStorage } from './s3-object-storage.ts';
import {
  restoreObjectStorageArchive,
  writeObjectStorageArchive,
} from '../operations/object-storage-archive.ts';

// Opt-in only: the runner creates this endpoint in project security-storage-iam.
const endpoint = process.env.IAM_TEST_ENDPOINT;
describe.runIf(Boolean(endpoint))('RustFS scoped IAM against a disposable server', () => {
  if (endpoint && new URL(endpoint).hostname !== '127.0.0.1')
    throw new Error('IAM tests require the isolated loopback server');
  const bucket = 'iam-test-media';
  const other = 'iam-test-foreign';
  const identities = ['backend', 'worker', 'operations'] as const;
  const client = (role: string) =>
    new S3Client({
      endpoint: endpoint ?? 'http://127.0.0.1:1',
      region: 'eu-central-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: `iam-test-${role}`,
        secretAccessKey: `iam-test-${role}-secret-unique`,
      },
    });
  const root = client('root');
  const clients = identities.map(client);
  afterAll(() => {
    root.destroy();
    clients.forEach((c) => c.destroy());
  });
  const denied = async (operation: Promise<unknown>) => {
    await expect(operation).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
  };
  test('runtime identities can upload/read/delete only inside the configured prefix', async () => {
    await root.send(
      new CreateBucketCommand({
        Bucket: other,
        CreateBucketConfiguration: { LocationConstraint: 'eu-central-1' },
      }),
    );
    await root.send(new PutObjectCommand({ Bucket: other, Key: 'private', Body: 'foreign' }));
    await root.send(
      new PutObjectCommand({ Bucket: bucket, Key: 'outside-prefix/private', Body: 'private' }),
    );
    await Promise.all(
      clients.map(async (runtime, index) => {
        const key = `incidents/probe-${index}`;
        await runtime.send(
          new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'scoped payload' }),
        );
        const read = await runtime.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        expect(await read.Body?.transformToString()).toBe('scoped payload');
        await runtime.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        await denied(runtime.send(new GetObjectCommand({ Bucket: other, Key: 'private' })));
        await denied(
          runtime.send(new PutObjectCommand({ Bucket: other, Key: 'write', Body: 'forbidden' })),
        );
        await denied(
          runtime.send(new GetObjectCommand({ Bucket: bucket, Key: 'outside-prefix/private' })),
        );
        await denied(runtime.send(new CreateBucketCommand({ Bucket: `iam-forbidden-${index}` })));
        await denied(
          runtime.send(
            new PutBucketPolicyCommand({
              Bucket: bucket,
              Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Principal: '*',
                    Action: 's3:GetObject',
                    Resource: `arn:aws:s3:::${bucket}/*`,
                  },
                ],
              }),
            }),
          ),
        );
      }),
    );
  });
  test('real archive backup and restore use the separate operations identity', async () => {
    const storage = new S3ObjectStorage({
      endpoint: endpoint!,
      publicEndpoint: endpoint!,
      region: 'eu-central-1',
      bucket,
      objectPrefix: 'incidents',
      accessKeyId: 'iam-test-operations',
      secretAccessKey: 'iam-test-operations-secret-unique',
      forcePathStyle: true,
      autoCreateBucket: false,
      uploadExpirySeconds: 300,
    });
    try {
      await storage.initialize();
      const body = Buffer.from('archive roundtrip fixture');
      await storage.putObject({
        objectKey: 'archive-roundtrip',
        body,
        contentType: 'text/plain',
        checksumSha256: createHash('sha256').update(body).digest('hex'),
      });
      const destination = new PassThrough();
      const chunks: Buffer[] = [];
      destination.on('data', (chunk: Buffer) => chunks.push(chunk));
      expect((await writeObjectStorageArchive(storage, destination)).objectCount).toBe(1);
      await storage.deleteObject('archive-roundtrip');
      expect(
        (await restoreObjectStorageArchive(storage, Readable.from(Buffer.concat(chunks))))
          .objectCount,
      ).toBe(1);
      expect(Buffer.from((await storage.getObject('archive-roundtrip')).body).toString()).toBe(
        body.toString(),
      );
      await storage.deleteObject('archive-roundtrip');
    } finally {
      await storage.close();
    }
  });
  test('archive CLI roundtrip works with operations storage configuration only', async () => {
    const runtime = clients[2]!;
    const key = 'incidents/cli-roundtrip';
    await runtime.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'CLI fixture' }));
    const executable = resolve(import.meta.dirname, '../operations/object-storage-archive-cli.ts');
    const env = {
      SERVICE_NAME: 'storage_operations',
      S3_ENDPOINT: endpoint!,
      S3_REGION: 'eu-central-1',
      S3_BUCKET: bucket,
      S3_OBJECT_PREFIX: 'incidents',
      S3_FORCE_PATH_STYLE: 'true',
      S3_AUTO_CREATE_BUCKET: 'false',
      S3_ACCESS_KEY_ID: 'iam-test-operations',
      S3_SECRET_ACCESS_KEY: 'iam-test-operations-secret-unique',
    };
    const backup = spawnSync(process.execPath, [executable, 'backup'], { env, timeout: 20_000 });
    expect(backup.status, 'archive must not require DB/auth/broker config').toBe(0);
    await runtime.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    const restore = spawnSync(process.execPath, [executable, 'restore'], {
      env,
      input: backup.stdout,
      timeout: 20_000,
    });
    expect(restore.status).toBe(0);
    const restored = await runtime.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    expect(await restored.Body?.transformToString()).toBe('CLI fixture');
    await runtime.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  });
});
