import { createHash } from 'node:crypto';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import type { Readable, Writable } from 'node:stream';
import {
  expectInteger,
  expectNullableString,
  expectRecord,
  expectString,
} from '@zglosto/contracts';
import type { ObjectStorage } from '../storage/object-storage.ts';

const ARCHIVE_FORMAT = 'zglosto-object-storage';
const ARCHIVE_VERSION = 1;

interface ArchiveSummary {
  objectCount: number;
  totalSizeBytes: number;
}

function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

async function writeLine(output: Writable, value: Record<string, unknown>): Promise<void> {
  if (!output.write(`${JSON.stringify(value)}\n`)) {
    await once(output, 'drain');
  }
}

export async function writeObjectStorageArchive(
  storage: ObjectStorage,
  destination: Writable,
): Promise<ArchiveSummary> {
  const gzip = createGzip({ level: 9 });
  gzip.pipe(destination);
  await writeLine(gzip, {
    type: 'header',
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: new Date().toISOString(),
  });

  let objectCount = 0;
  let totalSizeBytes = 0;
  for await (const summary of storage.listObjects()) {
    const object = await storage.getObject(summary.objectKey);
    const checksumSha256 = sha256(object.body);
    if (
      object.sizeBytes !== object.body.byteLength ||
      summary.sizeBytes !== object.body.byteLength
    ) {
      throw new Error(`Object size changed during backup: ${object.objectKey}`);
    }
    if (object.checksumSha256 !== null && object.checksumSha256 !== checksumSha256) {
      throw new Error(`Object checksum mismatch during backup: ${object.objectKey}`);
    }
    await writeLine(gzip, {
      type: 'object',
      objectKey: object.objectKey,
      contentType: object.contentType,
      checksumSha256,
      sizeBytes: object.body.byteLength,
      bodyBase64: Buffer.from(object.body).toString('base64'),
    });
    objectCount += 1;
    totalSizeBytes += object.body.byteLength;
  }

  await writeLine(gzip, { type: 'end', objectCount, totalSizeBytes });
  gzip.end();
  await finished(gzip);
  return { objectCount, totalSizeBytes };
}

export async function restoreObjectStorageArchive(
  storage: ObjectStorage,
  source: Readable,
): Promise<ArchiveSummary> {
  const lines = createInterface({
    input: source.pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  const restoredKeys = new Set<string>();
  let headerSeen = false;
  let endSeen = false;
  let objectCount = 0;
  let totalSizeBytes = 0;

  for await (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const value: unknown = JSON.parse(rawLine);
    const record = expectRecord(value, 'objectStorageArchive.record');
    const type = expectString(record.type, 'objectStorageArchive.record.type');

    if (type === 'header') {
      if (headerSeen || objectCount > 0 || endSeen)
        throw new Error('Invalid archive header position');
      if (expectString(record.format, 'objectStorageArchive.header.format') !== ARCHIVE_FORMAT) {
        throw new Error('Unsupported Object Storage archive format');
      }
      if (
        expectInteger(record.version, 'objectStorageArchive.header.version') !== ARCHIVE_VERSION
      ) {
        throw new Error('Unsupported Object Storage archive version');
      }
      expectString(record.createdAt, 'objectStorageArchive.header.createdAt');
      headerSeen = true;
      continue;
    }

    if (!headerSeen || endSeen) throw new Error('Invalid Object Storage archive record order');
    if (type === 'object') {
      const objectKey = expectString(record.objectKey, 'objectStorageArchive.object.objectKey');
      if (restoredKeys.has(objectKey))
        throw new Error(`Duplicate object key in archive: ${objectKey}`);
      const contentType = expectNullableString(
        record.contentType,
        'objectStorageArchive.object.contentType',
      );
      const expectedChecksum = expectString(
        record.checksumSha256,
        'objectStorageArchive.object.checksumSha256',
      );
      const expectedSize = expectInteger(record.sizeBytes, 'objectStorageArchive.object.sizeBytes');
      const body = Buffer.from(
        expectString(record.bodyBase64, 'objectStorageArchive.object.bodyBase64'),
        'base64',
      );
      if (body.byteLength !== expectedSize) throw new Error(`Archive size mismatch: ${objectKey}`);
      if (sha256(body) !== expectedChecksum)
        throw new Error(`Archive checksum mismatch: ${objectKey}`);

      await storage.putObject({
        body,
        checksumSha256: expectedChecksum,
        contentType: contentType ?? 'application/octet-stream',
        objectKey,
      });
      restoredKeys.add(objectKey);
      objectCount += 1;
      totalSizeBytes += body.byteLength;
      continue;
    }

    if (type === 'end') {
      const expectedCount = expectInteger(
        record.objectCount,
        'objectStorageArchive.end.objectCount',
      );
      const expectedSize = expectInteger(
        record.totalSizeBytes,
        'objectStorageArchive.end.totalSizeBytes',
      );
      if (expectedCount !== objectCount || expectedSize !== totalSizeBytes) {
        throw new Error('Object Storage archive summary mismatch');
      }
      endSeen = true;
      continue;
    }

    throw new Error(`Unsupported Object Storage archive record: ${type}`);
  }

  if (!headerSeen || !endSeen) throw new Error('Incomplete Object Storage archive');
  return { objectCount, totalSizeBytes };
}
