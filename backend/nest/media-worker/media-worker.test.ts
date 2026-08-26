import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CorrelationContext } from '../platform/correlation-context.ts';
import { parsePlatformEnvironment } from '../platform/environment.ts';
import { GracefulShutdownRegistry } from '../platform/graceful-shutdown.registry.ts';
import {
  StructuredLogger,
  type StructuredLogLevel,
  type StructuredLogRecord,
  type StructuredLogSink,
} from '../platform/structured-logger.ts';
import { parseMediaWorkerEnvironment } from './media-worker.environment.ts';
import { isMediaWorkerHealthy, MediaWorkerHealthRecordSchema } from './media-worker.health.ts';
import { MediaWorkerModule } from './media-worker.module.ts';
import { MediaWorkerRuntime } from './media-worker.runtime.ts';

class MemoryLogSink implements StructuredLogSink {
  readonly records: StructuredLogRecord[] = [];

  write(_level: StructuredLogLevel, record: StructuredLogRecord): void {
    this.records.push(record);
  }
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createRuntime(
  healthFile: string,
  failRabbitMq = false,
): {
  databaseCheck: ReturnType<typeof vi.fn>;
  loggerSink: MemoryLogSink;
  rabbitMqCheck: ReturnType<typeof vi.fn>;
  runtime: MediaWorkerRuntime;
  shutdown: GracefulShutdownRegistry;
} {
  vi.stubEnv('MEDIA_WORKER_HEALTH_FILE', healthFile);
  vi.stubEnv('MEDIA_WORKER_HEALTH_INTERVAL_MS', '60000');
  vi.stubEnv('MEDIA_WORKER_HEALTH_STALE_MS', '120000');
  vi.stubEnv('SERVICE_NAME', 'media_worker');
  const databaseCheck = vi.fn(async () => Promise.resolve());
  const rabbitMqCheck = failRabbitMq
    ? vi.fn(async () => Promise.reject(new Error('broker unavailable')))
    : vi.fn(async () => Promise.resolve());
  const loggerSink = new MemoryLogSink();
  const logger = new StructuredLogger(
    new CorrelationContext(),
    loggerSink,
    parsePlatformEnvironment(process.env),
  );
  const shutdown = new GracefulShutdownRegistry(logger);
  const runtime = new MediaWorkerRuntime(
    { check: databaseCheck } as never,
    { check: rabbitMqCheck } as never,
    logger,
    { cleanupBatch: vi.fn(async () => Promise.resolve()) } as never,
    { check: vi.fn(async () => Promise.resolve()) } as never,
    shutdown,
  );
  return { databaseCheck, loggerSink, rabbitMqCheck, runtime, shutdown };
}

describe('media_worker standalone runtime', () => {
  it('has a standalone NestJS composition root without HTTP controllers', async () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MediaWorkerModule)).toBeUndefined();
    const moduleReference = await Test.createTestingModule({
      imports: [MediaWorkerModule],
    }).compile();
    expect(moduleReference.get(MediaWorkerRuntime)).toBeInstanceOf(MediaWorkerRuntime);
    await moduleReference.close();
  });

  it('validates its file-based readiness contract', () => {
    expect(parseMediaWorkerEnvironment({})).toEqual({
      healthFile: '/tmp/zglosto-media-worker.json',
      healthIntervalMs: 5_000,
      healthStaleMs: 20_000,
      maxInputBytes: 5 * 1024 * 1024,
      maxInputHeight: 8_192,
      maxInputPixels: 32_000_000,
      maxInputWidth: 8_192,
      maxOutputDimension: 2_000,
      prefetch: 1,
      sharpConcurrency: 1,
      webpEffort: 4,
      webpQuality: 85,
    });
    expect(() =>
      parseMediaWorkerEnvironment({
        MEDIA_WORKER_HEALTH_INTERVAL_MS: '5000',
        MEDIA_WORKER_HEALTH_STALE_MS: '9000',
      }),
    ).toThrow('must be at least twice');
  });

  it('becomes ready only after PostgreSQL and RabbitMQ probes pass', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'zglosto-media-worker-test-'));
    temporaryDirectories.push(directory);
    const healthFile = join(directory, 'ready.json');
    const { databaseCheck, loggerSink, rabbitMqCheck, runtime, shutdown } =
      createRuntime(healthFile);

    await runtime.onApplicationBootstrap();

    expect(databaseCheck).toHaveBeenCalledOnce();
    expect(rabbitMqCheck).toHaveBeenCalledOnce();
    const record = MediaWorkerHealthRecordSchema.parse(
      JSON.parse(readFileSync(healthFile, 'utf8')) as unknown,
    );
    expect(record).toMatchObject({ pid: process.pid, service: 'media_worker', status: 'ready' });
    expect(
      isMediaWorkerHealthy(healthFile, 120_000, Date.now(), (pid) => pid === process.pid),
    ).toBe(true);
    expect(loggerSink.records.at(-1)).toMatchObject({
      event: 'media_worker.started',
      service: 'media_worker',
    });

    await shutdown.drain();
    expect(isMediaWorkerHealthy(healthFile, 120_000)).toBe(false);
  });

  it('stays unready when a required dependency fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'zglosto-media-worker-test-'));
    temporaryDirectories.push(directory);
    const healthFile = join(directory, 'ready.json');
    const { loggerSink, runtime, shutdown } = createRuntime(healthFile, true);

    await expect(runtime.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(isMediaWorkerHealthy(healthFile, 120_000)).toBe(false);
    expect(loggerSink.records).toContainEqual(
      expect.objectContaining({
        event: 'media_worker.readiness.failed',
        service: 'media_worker',
      }),
    );
    await shutdown.drain();
  });

  it('rejects stale readiness and missing worker processes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zglosto-media-worker-test-'));
    temporaryDirectories.push(directory);
    const healthFile = join(directory, 'ready.json');
    const { runtime } = createRuntime(healthFile);

    return runtime.probeDependencies().then(() => {
      const checkedAt = Date.parse(
        MediaWorkerHealthRecordSchema.parse(JSON.parse(readFileSync(healthFile, 'utf8')) as unknown)
          .checkedAt,
      );
      expect(isMediaWorkerHealthy(healthFile, 1_000, checkedAt + 2_000, () => true)).toBe(false);
      expect(isMediaWorkerHealthy(healthFile, 1_000, checkedAt, () => false)).toBe(false);
      return runtime.close();
    });
  });
});
