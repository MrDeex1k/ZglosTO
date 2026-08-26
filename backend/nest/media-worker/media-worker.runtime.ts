import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from '../modules/database/database.service.ts';
import { RabbitMqService } from '../modules/jobs/rabbitmq.service.ts';
import { ObjectStorageService } from '../modules/storage/object-storage.service.ts';
import { GracefulShutdownRegistry } from '../platform/graceful-shutdown.registry.ts';
import { StructuredLogger } from '../platform/structured-logger.ts';
import {
  parseMediaWorkerEnvironment,
  type MediaWorkerEnvironment,
} from './media-worker.environment.ts';
import type { MediaWorkerHealthRecord } from './media-worker.health.ts';
import { MediaOriginalCleanupService } from './media-original-cleanup.service.ts';

@Injectable()
export class MediaWorkerRuntime implements OnApplicationBootstrap {
  private readonly environment: MediaWorkerEnvironment;
  private timer: NodeJS.Timeout | null = null;
  private activeProbe: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly rabbitMq: RabbitMqService,
    private readonly logger: StructuredLogger,
    private readonly cleanup: MediaOriginalCleanupService,
    private readonly storage: ObjectStorageService,
    shutdown: GracefulShutdownRegistry,
  ) {
    this.environment = parseMediaWorkerEnvironment(process.env);
    shutdown.register({ name: 'media-worker-runtime', close: () => this.close() });
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.probeDependencies();
    } catch {
      // Readiness remains false and the scheduled probe owns recovery.
    }
    this.scheduleProbe();
    this.logger.log(
      {
        event: 'media_worker.started',
        healthIntervalMs: this.environment.healthIntervalMs,
        transport: 'amqps',
      },
      MediaWorkerRuntime.name,
    );
  }

  async close(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.activeProbe;
    this.removeHealthFile();
  }

  async probeDependencies(): Promise<void> {
    try {
      await Promise.all([this.database.check(), this.rabbitMq.check(), this.storage.check()]);
      await this.cleanup.cleanupBatch();
      this.writeHealthFile();
    } catch (error: unknown) {
      this.removeHealthFile();
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : 'unknown',
          event: 'media_worker.readiness.failed',
        },
        MediaWorkerRuntime.name,
      );
      throw error;
    }
  }

  private scheduleProbe(): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.activeProbe = this.probeDependencies()
        .catch(() => Promise.resolve())
        .finally(() => {
          this.activeProbe = null;
          this.scheduleProbe();
        });
    }, this.environment.healthIntervalMs);
  }

  private writeHealthFile(): void {
    const record: MediaWorkerHealthRecord = {
      checkedAt: new Date().toISOString(),
      pid: process.pid,
      service: 'media_worker',
      status: 'ready',
    };
    const temporaryFile = `${this.environment.healthFile}.${process.pid}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    renameSync(temporaryFile, this.environment.healthFile);
  }

  private removeHealthFile(): void {
    rmSync(this.environment.healthFile, { force: true });
    rmSync(`${this.environment.healthFile}.${process.pid}.tmp`, { force: true });
  }
}
