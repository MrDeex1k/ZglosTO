import { Module } from '@nestjs/common';
import { AuthBridgeModule } from '../auth-bridge/auth-bridge.module.ts';
import { IncidentsModule } from '../incidents/incidents.module.ts';
import { WhiteLabelModule } from '../white-label/white-label.module.ts';
import { IncidentDomainPort } from '../incidents/incident-domain.port.ts';
import { IncidentPolicyService } from '../incidents/incident-policy.service.ts';
import { PublicResolvedIncidentCache } from '../incidents/public-resolved-incident-cache.ts';
import { AdminController } from './admin.controller.ts';
import { AdminUseCases } from './admin.use-cases.ts';

@Module({
  imports: [AuthBridgeModule, IncidentsModule, WhiteLabelModule],
  controllers: [AdminController],
  providers: [
    {
      provide: AdminUseCases,
      useFactory: (
        incidents: IncidentDomainPort,
        policy: IncidentPolicyService,
        publicResolvedIncidentCache: PublicResolvedIncidentCache,
      ) => new AdminUseCases(incidents, policy, publicResolvedIncidentCache),
      inject: [IncidentDomainPort, IncidentPolicyService, PublicResolvedIncidentCache],
    },
  ],
})
export class AdminModule {}
