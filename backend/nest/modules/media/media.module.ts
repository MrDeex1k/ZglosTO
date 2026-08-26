import { Module } from '@nestjs/common';
import { AuthBridgeModule } from '../auth-bridge/auth-bridge.module.ts';
import { DatabaseModule } from '../database/database.module.ts';
import { JobsModule } from '../jobs/jobs.module.ts';
import { StorageModule } from '../storage/storage.module.ts';
import { IncidentMediaService } from './incident-media.service.ts';
import { ImageUploadService } from './image-upload.service.ts';
import { MediaController } from './media.controller.ts';

@Module({
  imports: [AuthBridgeModule, DatabaseModule, JobsModule, StorageModule],
  controllers: [MediaController],
  providers: [ImageUploadService, IncidentMediaService],
  exports: [ImageUploadService, IncidentMediaService],
})
export class MediaModule {}
