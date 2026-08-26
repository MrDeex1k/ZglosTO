import type { CityService, WhiteLabelConfig } from '@zglosto/contracts';
import type { DatabaseClient } from '../types.ts';

export interface ServiceCatalog {
  fallbackServiceKey: string;
  services: readonly CityService[];
  requireEnabledServiceKey(value: string): string;
}

export class ServiceCatalogError extends Error {
  constructor(value: string) {
    super(`Unknown or disabled serviceKey: ${value}`);
    this.name = 'ServiceCatalogError';
  }
}

export function createServiceCatalog(
  config: Pick<WhiteLabelConfig, 'routing' | 'services'>,
): ServiceCatalog {
  const services = [...config.services].sort((left, right) => left.sortOrder - right.sortOrder);

  return {
    fallbackServiceKey: config.routing.fallbackServiceKey,
    services,
    requireEnabledServiceKey(value: string): string {
      const service = services.find((candidate) => candidate.key === value) ?? null;
      if (service === null || !service.enabled) throw new ServiceCatalogError(value);
      return service.key;
    },
  };
}

export async function synchronizeServiceCatalog(
  database: DatabaseClient,
  catalog: Pick<ServiceCatalog, 'services'>,
): Promise<void> {
  const serializedServices = JSON.stringify(
    catalog.services.map((service) => ({
      service_key: service.key,
      enabled: service.enabled,
      sort_order: service.sortOrder,
    })),
  );

  await database.query(
    `
      WITH configured_services AS (
        SELECT item.service_key, item.enabled, item.sort_order
        FROM jsonb_to_recordset($1::jsonb) AS item(
          service_key varchar(64),
          enabled boolean,
          sort_order integer
        )
      ), synchronized_services AS (
        INSERT INTO service_types (service_key, enabled, sort_order)
        SELECT service_key, enabled, sort_order
        FROM configured_services
        ON CONFLICT (service_key) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            sort_order = EXCLUDED.sort_order,
            updated_at = CURRENT_TIMESTAMP
        RETURNING service_key
      )
      UPDATE service_types AS stored_service
      SET enabled = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1
        FROM configured_services
        WHERE configured_services.service_key = stored_service.service_key
      )
        AND stored_service.enabled = TRUE;
    `,
    [serializedServices],
  );
}
