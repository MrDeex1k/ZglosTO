import type { CityService } from '@zglosto/contracts';
import { describe, expect, test } from 'vitest';
import type { DatabaseClient, DatabaseParameter } from '../types.ts';

import {
  createServiceCatalog,
  ServiceCatalogError,
  synchronizeServiceCatalog,
} from './service-catalog.ts';

const services = [
  {
    key: 'roads',
    label: { 'pl-PL': 'Zarząd Dróg', en: 'Road Authority' },
    shortLabel: { 'pl-PL': 'ZD', en: 'Roads' },
    enabled: true,
    sortOrder: 10,
    iconKey: 'road',
    description: null,
    color: '#EA580C',
  },
  {
    key: 'manual_review',
    label: { 'pl-PL': 'Inne', en: 'Other' },
    shortLabel: { 'pl-PL': 'Inne', en: 'Other' },
    enabled: true,
    sortOrder: 999,
    iconKey: 'circle_help',
    description: null,
    color: '#6B7280',
  },
] as const satisfies readonly CityService[];

describe('service catalog boundary', () => {
  const catalog = createServiceCatalog({
    services: [...services],
    routing: { fallbackServiceKey: 'manual_review' },
  });

  test('keeps stable keys in the application', () => {
    expect(catalog.requireEnabledServiceKey('roads')).toBe('roads');
    expect(catalog.fallbackServiceKey).toBe('manual_review');
  });

  test('rejects legacy labels at the application boundary', () => {
    expect(() => catalog.requireEnabledServiceKey('Zarząd Dróg')).toThrow(ServiceCatalogError);
  });

  test('rejects values absent from the deployment catalog', () => {
    expect(() => catalog.requireEnabledServiceKey('missing')).toThrow(ServiceCatalogError);
  });

  test('rejects a configured but inactive service for new assignments', () => {
    const [roadsService, fallbackService] = services;
    const catalogWithInactiveRoads = createServiceCatalog({
      services: [{ ...roadsService, enabled: false }, fallbackService],
      routing: { fallbackServiceKey: 'manual_review' },
    });

    expect(() => catalogWithInactiveRoads.requireEnabledServiceKey('roads')).toThrow(
      ServiceCatalogError,
    );
    expect(catalogWithInactiveRoads.services.some((service) => service.key === 'roads')).toBe(true);
  });

  test('materializes stable config fields without legacy labels', async () => {
    let capturedParameters: readonly DatabaseParameter[] = [];
    let capturedQuery = '';
    const database: DatabaseClient = {
      query: async (text: string, parameters: readonly DatabaseParameter[] = []) => {
        capturedQuery = text;
        capturedParameters = parameters;
        return { rows: [], rowCount: 0 };
      },
    };

    await synchronizeServiceCatalog(database, catalog);

    const serialized = capturedParameters[0] ?? null;
    expect(typeof serialized).toBe('string');
    if (typeof serialized !== 'string') throw new Error('Expected serialized service catalog');
    expect(JSON.parse(serialized)).toEqual([
      { service_key: 'roads', enabled: true, sort_order: 10 },
      { service_key: 'manual_review', enabled: true, sort_order: 999 },
    ]);
    expect(capturedQuery).toContain('SET enabled = FALSE');
    expect(capturedQuery).toContain('NOT EXISTS');
  });
});
