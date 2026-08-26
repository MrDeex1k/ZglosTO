import { Module } from '@nestjs/common';
import { DatabaseModule } from '../modules/database/database.module.ts';
import { StorageModule } from '../modules/storage/storage.module.ts';
import { WhiteLabelModule } from '../modules/white-label/white-label.module.ts';
import { PlatformModule } from '../platform/platform.module.ts';
import { TransientStoreModule } from '../platform/transient-store.module.ts';
import { HealthController } from './health.controller.ts';
import { HealthService } from './health.service.ts';

@Module({
  imports: [DatabaseModule, PlatformModule, StorageModule, TransientStoreModule, WhiteLabelModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
