import { Inject, Injectable } from '@nestjs/common';
import type { PublicCityConfigResponse } from '@zglosto/contracts';
import {
  createWhiteLabelConfigReadiness,
  loadProcessWhiteLabelConfig,
  type LoadedWhiteLabelConfig,
  type WhiteLabelConfigReadiness,
} from '@zglosto/white-label-config';
import {
  createConfigEtag,
  createPublicConfigResponse,
  PUBLIC_CONFIG_CACHE_CONTROL,
} from '../../../lib/public-config.ts';
import { createServiceCatalog, type ServiceCatalog } from '../../../lib/service-catalog.ts';

export const WHITE_LABEL_CONFIG = Symbol('WHITE_LABEL_CONFIG');

export function loadActiveWhiteLabelConfig(): LoadedWhiteLabelConfig {
  return loadProcessWhiteLabelConfig();
}

@Injectable()
export class WhiteLabelConfigService {
  readonly cacheControl = PUBLIC_CONFIG_CACHE_CONTROL;
  readonly etag: string;
  readonly publicResponse: PublicCityConfigResponse;
  readonly readiness: WhiteLabelConfigReadiness;
  readonly serviceCatalog: ServiceCatalog;

  constructor(@Inject(WHITE_LABEL_CONFIG) loadedConfig: LoadedWhiteLabelConfig) {
    this.publicResponse = createPublicConfigResponse(loadedConfig);
    this.etag = createConfigEtag(this.publicResponse);
    this.readiness = createWhiteLabelConfigReadiness(loadedConfig);
    this.serviceCatalog = createServiceCatalog(loadedConfig.config);
  }
}
