import { Injectable } from '@nestjs/common';
import {
  BackendLivenessResponseSchema,
  BackendReadinessResponseSchema,
  type BackendLivenessResponse,
  type BackendReadinessResponse,
} from '@zglosto/contracts';
import { DatabaseReadinessProbe } from '../modules/database/database-readiness.probe.ts';
import { ObjectStorageReadinessProbe } from '../modules/storage/storage-readiness.probe.ts';
import { WhiteLabelConfigService } from '../modules/white-label/white-label-config.service.ts';
import { StructuredLogger } from '../platform/structured-logger.ts';
import { TransientStoreService } from '../platform/transient-store.service.ts';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseReadinessProbe,
    private readonly objectStorage: ObjectStorageReadinessProbe,
    private readonly config: WhiteLabelConfigService,
    private readonly redis: TransientStoreService,
    private readonly logger: StructuredLogger,
  ) {}

  liveness(): BackendLivenessResponse {
    return BackendLivenessResponseSchema.parse({ status: 'ok', service: 'backend' });
  }

  async readiness(): Promise<BackendReadinessResponse> {
    const [databaseReadiness, objectStorageReadiness, redisReadiness] = await Promise.allSettled([
      this.database.check(),
      this.objectStorage.check(),
      this.redis.readiness(),
    ]);
    const database = databaseReadiness.status === 'fulfilled' ? 'up' : 'down';
    const objectStorage = objectStorageReadiness.status === 'fulfilled' ? 'up' : 'down';
    const redis = redisReadiness.status === 'fulfilled' ? redisReadiness.value : 'down';

    if (database === 'up' && objectStorage === 'up') {
      return BackendReadinessResponseSchema.parse({
        status: redis === 'down' ? 'degraded' : 'ok',
        service: 'backend',
        database,
        objectStorage,
        redis,
        config: this.config.readiness,
      });
    }

    this.logger.error(
      {
        event: 'health.readiness.failed',
        database,
        objectStorage,
        redis,
      },
      HealthService.name,
    );
    return BackendReadinessResponseSchema.parse({
      status: 'error',
      service: 'backend',
      database,
      objectStorage,
      redis,
    });
  }
}
