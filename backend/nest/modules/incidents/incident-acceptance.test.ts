import type { CurrentLlmClassificationResult } from '@zglosto/contracts';
import { expect, test, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.ts';
import type { IncidentMediaService } from '../media/incident-media.service.ts';
import type { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';
import { PostgresIncidentAdapter } from './postgres-incident.adapter.ts';
import { classifyIncident } from '../../../lib/llm-classification.ts';

const row = {
  id_zgloszenia: 'incident-1',
  data_zgloszenia: '2026-09-07',
  godzina_zgloszenia: '12:00:00',
  opis_zgloszenia: 'Report',
  mail_zglaszajacego: 'resident@example.com',
  reporter_user_id: null,
  adres_zgloszenia: 'Rynek 1',
  latitude: null,
  longitude: null,
  zdjecie_incydentu_zglaszanego: null,
  zdjecie_incydentu_rozwiazanego: null,
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  service_key: 'roads',
  llm_odpowiedz: null,
  llm_classification: 'unknown',
  llm_model_available: false,
  llm_source: 'fallback',
  llm_reason: 'disabled',
  data_rozwiazania: null,
  godzina_rozwiazania: null,
};

test.each(['municipal', 'emergency', 'unknown'] as const)(
  'accepts %s reports for the selected service',
  async (classification) => {
    const result = await classifyIncident('Report', 'roads', {
      gatewayUrl: 'https://gateway.example',
      timeoutMs: 100,
      fetchImpl: async () =>
        Response.json({
          classification,
          serviceKey: 'model-must-not-route',
          confidence: null,
          source: classification === 'unknown' ? 'fallback' : 'model',
          modelAvailable: classification !== 'unknown',
          reason: classification === 'unknown' ? 'disabled' : null,
        }),
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id_zgloszenia: row.id_zgloszenia }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            ...row,
            llm_classification: result.classification,
            llm_model_available: result.modelAvailable,
            llm_source: result.source,
            llm_reason: result.reason,
          },
        ],
        rowCount: 1,
      });
    const adapter = new PostgresIncidentAdapter(
      { query } as unknown as DatabaseService,
      {} as IncidentMediaService,
      { classify: async (): Promise<CurrentLlmClassificationResult> => result },
      { ensureSynchronized: async () => {} } as unknown as ServiceCatalogSynchronizer,
    );
    const response = await adapter.createIncident({
      address: 'Rynek 1',
      description: 'Report',
      imageUploadId: null,
      latitude: null,
      longitude: null,
      reporterEmail: 'resident@example.com',
      reporterUserId: null,
      requestedServiceKey: 'roads',
    });
    expect(query.mock.calls[0]![0]).toContain('INSERT INTO incydenty');
    expect(query.mock.calls[0]![1][6]).toBe('roads');
    expect(response.success).toBe(true);
    expect(response.incydent.typ_sluzby).toBe('roads');
    expect(response.classification).toEqual(result);
  },
);
