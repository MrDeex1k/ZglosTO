import { expect, test, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.ts';
import type { IncidentMediaService } from '../media/incident-media.service.ts';
import type { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';
import { PostgresIncidentAdapter } from './postgres-incident.adapter.ts';
import { classifyIncident, type IncidentClassification } from '../../../lib/llm-classification.ts';

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
          diagnostics: {
            confidenceRaw: classification === 'unknown' ? null : 0.9,
            pEmergencyRaw:
              classification === 'unknown' ? null : classification === 'emergency' ? 0.9 : 0.1,
            modelId: '__PRIVATE_MODEL__',
            modelRevision: `sha256:${'b'.repeat(64)}`,
            promptVersion: 'municipal-emergency-v1',
            latencyMs: 123,
            calibrationVersion: null,
          },
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
            llm_classification: result.result.classification,
            llm_model_available: result.result.modelAvailable,
            llm_source: result.result.source,
            llm_reason: result.result.reason,
            llm_confidence_raw: result.diagnostics?.confidenceRaw,
            llm_p_emergency_raw: result.diagnostics?.pEmergencyRaw,
            llm_model_id: '__PRIVATE_MODEL__',
            llm_model_revision: result.diagnostics?.modelRevision,
            llm_prompt_version: result.diagnostics?.promptVersion,
            llm_latency_ms: 123,
            llm_calibration_version: null,
          },
        ],
        rowCount: 1,
      });
    const adapter = new PostgresIncidentAdapter(
      { query } as unknown as DatabaseService,
      {} as IncidentMediaService,
      { classify: async (): Promise<IncidentClassification> => result },
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
    expect(query.mock.calls[0]![1].slice(12)).toEqual([
      result.diagnostics?.confidenceRaw,
      result.diagnostics?.pEmergencyRaw,
      '__PRIVATE_MODEL__',
      `sha256:${'b'.repeat(64)}`,
      'municipal-emergency-v1',
      123,
      null,
    ]);
    expect(response.success).toBe(true);
    expect(response.incydent.typ_sluzby).toBe('roads');
    expect(response.classification).toEqual(result.result);
    expect(JSON.stringify(response)).not.toContain('__PRIVATE_MODEL__');
    for (const field of [
      'diagnostics',
      'confidenceRaw',
      'pEmergencyRaw',
      'llm_confidence_raw',
      'llm_p_emergency_raw',
      'llm_model_id',
      'llm_model_revision',
      'llm_prompt_version',
      'llm_latency_ms',
      'llm_calibration_version',
    ]) {
      expect(response.classification).not.toHaveProperty(field);
      expect(response.incydent).not.toHaveProperty(field);
    }
    query.mockResolvedValueOnce({
      rows: [
        {
          ...row,
          typ_sluzby: 'roads',
          data_godzina_zgloszenia: '14.11.2026 12:00',
          data_godzina_rozwiazania: null,
          llm_model_id: '__PRIVATE_MODEL__',
          llm_confidence_raw: 0.9,
          llm_p_emergency_raw: 0.9,
          llm_prompt_version: 'municipal-emergency-v1',
          llm_latency_ms: 123,
        },
      ],
      rowCount: 1,
    });
    const listed = await adapter.listAdminIncidents();
    expect(JSON.stringify(listed)).not.toContain('__PRIVATE_MODEL__');
    expect(listed[0]).not.toHaveProperty('llm_confidence_raw');
    expect(listed[0]).not.toHaveProperty('llm_p_emergency_raw');
  },
);
