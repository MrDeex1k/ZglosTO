import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.ts';
import { AdminModule } from './modules/admin/admin.module.ts';
import { AuthBridgeModule } from './modules/auth-bridge/auth-bridge.module.ts';
import { DatabaseModule } from './modules/database/database.module.ts';
import { IncidentsModule } from './modules/incidents/incidents.module.ts';
import { JobsModule } from './modules/jobs/jobs.module.ts';
import { LlmGatewayModule } from './modules/llm-gateway/llm-gateway.module.ts';
import { MediaModule } from './modules/media/media.module.ts';
import { ResidentsModule } from './modules/residents/residents.module.ts';
import { ServicesModule } from './modules/services/services.module.ts';
import { StorageModule } from './modules/storage/storage.module.ts';
import { WhiteLabelModule } from './modules/white-label/white-label.module.ts';
import { PlatformModule } from './platform/platform.module.ts';
import { TransientStoreModule } from './platform/transient-store.module.ts';

@Module({
  imports: [
    HealthModule,
    PlatformModule,
    TransientStoreModule,
    AdminModule,
    AuthBridgeModule,
    DatabaseModule,
    IncidentsModule,
    JobsModule,
    LlmGatewayModule,
    MediaModule,
    ResidentsModule,
    ServicesModule,
    StorageModule,
    WhiteLabelModule,
  ],
})
export class AppModule {}
