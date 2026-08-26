import { Module } from '@nestjs/common';
import { DatabaseModule } from '../modules/database/database.module.ts';
import { JobsModule } from '../modules/jobs/jobs.module.ts';
import { StorageModule } from '../modules/storage/storage.module.ts';
import { PlatformModule } from '../platform/platform.module.ts';
import { MediaConsumerService } from './media-consumer.service.ts';
import { MediaJobRepository } from './media-job.repository.ts';
import { MediaMessageHandler } from './media-message.handler.ts';
import { MediaWorkerRuntime } from './media-worker.runtime.ts';
import { MediaOriginalCleanupService } from './media-original-cleanup.service.ts';
import { SharpImageProcessor } from './sharp-image.processor.ts';

@Module({
  imports: [PlatformModule, DatabaseModule, JobsModule, StorageModule],
  providers: [
    MediaConsumerService,
    MediaJobRepository,
    MediaMessageHandler,
    MediaOriginalCleanupService,
    MediaWorkerRuntime,
    SharpImageProcessor,
  ],
})
export class MediaWorkerModule {}
