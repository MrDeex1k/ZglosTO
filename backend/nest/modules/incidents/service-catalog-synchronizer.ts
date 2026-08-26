import { Injectable } from '@nestjs/common';
import { synchronizeServiceCatalog } from '../../../lib/service-catalog.ts';
import { DatabaseService } from '../database/database.service.ts';
import { WhiteLabelConfigService } from '../white-label/white-label-config.service.ts';

@Injectable()
export class ServiceCatalogSynchronizer {
  private synchronization: Promise<void> | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly whiteLabel: WhiteLabelConfigService,
  ) {}

  ensureSynchronized(): Promise<void> {
    if (this.synchronization === null) {
      this.synchronization = synchronizeServiceCatalog(
        this.database,
        this.whiteLabel.serviceCatalog,
      ).catch((error: unknown) => {
        this.synchronization = null;
        throw error;
      });
    }
    return this.synchronization;
  }
}
