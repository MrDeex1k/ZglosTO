import { Module } from '@nestjs/common';
import { AuthBridgeModule } from '../auth-bridge/auth-bridge.module.ts';
import { IncidentsModule } from '../incidents/incidents.module.ts';
import { IncidentDomainPort } from '../incidents/incident-domain.port.ts';
import { IncidentPolicyService } from '../incidents/incident-policy.service.ts';
import { PublicResolvedIncidentCache } from '../incidents/public-resolved-incident-cache.ts';
import { ServicesController } from './services.controller.ts';
import { ServicesUseCases } from './services.use-cases.ts';
import { MediaModule } from '../media/media.module.ts';

@Module({
  imports: [AuthBridgeModule, IncidentsModule, MediaModule],
  controllers: [ServicesController],
  providers: [
    {
      provide: ServicesUseCases,
      useFactory: (
        incidents: IncidentDomainPort,
        policy: IncidentPolicyService,
        publicResolvedIncidentCache: PublicResolvedIncidentCache,
      ) => new ServicesUseCases(incidents, policy, publicResolvedIncidentCache),
      inject: [IncidentDomainPort, IncidentPolicyService, PublicResolvedIncidentCache],
    },
  ],
})
export class ServicesModule {}
