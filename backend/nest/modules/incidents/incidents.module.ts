import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { JobsModule } from '../jobs/jobs.module.ts';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module.ts';
import { MediaModule } from '../media/media.module.ts';
import { WhiteLabelModule } from '../white-label/white-label.module.ts';
import { IncidentDomainPort } from './incident-domain.port.ts';
import { IncidentPolicyService } from './incident-policy.service.ts';
import { PostgresIncidentAdapter } from './postgres-incident.adapter.ts';
import { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';
import { PublicResolvedIncidentCache } from './public-resolved-incident-cache.ts';
import {
  RUNTIME_CONFIGURATION,
  type RuntimeConfiguration,
} from '../../platform/runtime-configuration.ts';
import { TransientStoreService } from '../../platform/transient-store.service.ts';
import { WhiteLabelConfigService } from '../white-label/white-label-config.service.ts';

@Module({
  imports: [DatabaseModule, JobsModule, LlmGatewayModule, MediaModule, WhiteLabelModule],
  providers: [
    IncidentPolicyService,
    ServiceCatalogSynchronizer,
    { provide: IncidentDomainPort, useClass: PostgresIncidentAdapter },
    {
      provide: PublicResolvedIncidentCache,
      useFactory: (
        transientStore: TransientStoreService,
        configuration: RuntimeConfiguration,
        whiteLabel: WhiteLabelConfigService,
      ) =>
        new PublicResolvedIncidentCache(
          transientStore.store,
          configuration.homepageCache,
          whiteLabel.etag,
        ),
      inject: [TransientStoreService, RUNTIME_CONFIGURATION, WhiteLabelConfigService],
    },
  ],
  exports: [IncidentDomainPort, IncidentPolicyService, PublicResolvedIncidentCache],
})
export class IncidentsModule {}
