import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { AuthBridgeModule } from '../auth-bridge/auth-bridge.module.ts';
import { IncidentsModule } from '../incidents/incidents.module.ts';
import { IncidentDomainPort } from '../incidents/incident-domain.port.ts';
import { IncidentPolicyService } from '../incidents/incident-policy.service.ts';
import { PublicResolvedIncidentCache } from '../incidents/public-resolved-incident-cache.ts';
import { LocalIncidentRateLimitMiddleware } from './local-incident-rate-limit.middleware.ts';
import { DistributedIncidentRateLimitInterceptor } from './distributed-incident-rate-limit.interceptor.ts';
import { DistributedIncidentRateLimiter } from './distributed-incident-rate-limiter.ts';
import { ResidentsController } from './residents.controller.ts';
import { ResidentsUseCases } from './residents.use-cases.ts';
import {
  RUNTIME_CONFIGURATION,
  type RuntimeConfiguration,
} from '../../platform/runtime-configuration.ts';
import { TransientStoreService } from '../../platform/transient-store.service.ts';
import { MediaModule } from '../media/media.module.ts';

@Module({
  imports: [AuthBridgeModule, IncidentsModule, MediaModule],
  controllers: [ResidentsController],
  providers: [
    LocalIncidentRateLimitMiddleware,
    DistributedIncidentRateLimitInterceptor,
    {
      provide: DistributedIncidentRateLimiter,
      useFactory: (transientStore: TransientStoreService, configuration: RuntimeConfiguration) =>
        new DistributedIncidentRateLimiter(
          transientStore.store,
          transientStore.hasher,
          configuration.incidentRateLimit,
        ),
      inject: [TransientStoreService, RUNTIME_CONFIGURATION],
    },
    {
      provide: ResidentsUseCases,
      useFactory: (
        incidents: IncidentDomainPort,
        policy: IncidentPolicyService,
        publicResolvedIncidentCache: PublicResolvedIncidentCache,
      ) => new ResidentsUseCases(incidents, policy, publicResolvedIncidentCache),
      inject: [IncidentDomainPort, IncidentPolicyService, PublicResolvedIncidentCache],
    },
  ],
})
export class ResidentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LocalIncidentRateLimitMiddleware).forRoutes({
      method: RequestMethod.POST,
      path: 'mieszkaniec/incydenty',
    });
    consumer.apply(LocalIncidentRateLimitMiddleware).forRoutes({
      method: RequestMethod.POST,
      path: 'mieszkaniec/obrazy/uploads',
    });
  }
}
