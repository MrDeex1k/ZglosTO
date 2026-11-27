import { expect, test, vi } from 'vitest';
import { parseDatabaseIncidentRow } from '../../../lib/database-records.ts';
import { badRequest } from '../../application-error.ts';
import type { DatabaseClient, DatabaseParameter, DatabaseQueryResult } from '../../../types.ts';
import type { DatabaseService } from '../database/database.service.ts';
import type { IncidentMediaService } from '../media/incident-media.service.ts';
import type { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';
import {
  createWithIncidentReceipt,
  incidentCreationReceiptIdentity,
  readIncidentCreationReceipt,
} from './incident-creation-receipt.ts';
import type { CreateIncidentCommand } from './incident-domain.port.ts';
import { PostgresIncidentAdapter } from './postgres-incident.adapter.ts';
import {
  classifyIncident,
  fallbackClassification,
  type IncidentClassification,
} from '../../../lib/llm-classification.ts';

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
      {
        query,
        transaction: <Result>(operation: (client: DatabaseClient) => Promise<Result>) =>
          operation({ query }),
      } as unknown as DatabaseService,
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

test('links the verified report upload and reads the response inside the creation transaction', async () => {
  const imageUploadId = '00000000-0000-4000-8000-000000000001';
  const steps: string[] = [];
  const query = vi
    .fn<(text: string, parameters?: readonly DatabaseParameter[]) => Promise<DatabaseQueryResult>>()
    .mockImplementationOnce(async () => {
      steps.push('insert');
      return { rows: [{ id_zgloszenia: row.id_zgloszenia }], rowCount: 1 };
    })
    .mockImplementationOnce(async () => {
      steps.push('read');
      return { rows: [row], rowCount: 1 };
    });
  const client = { query };
  const database = {
    query: vi.fn(),
    transaction: async <Result>(operation: (client: DatabaseClient) => Promise<Result>) => {
      steps.push('begin');
      const response = await operation(client);
      steps.push('commit');
      return response;
    },
  };
  const upload = { id: imageUploadId };
  const media = {
    verifyUpload: vi.fn(async () => {
      steps.push('verify');
      return upload;
    }),
    attach: vi.fn(async () => {
      steps.push('attach');
      return [];
    }),
  };
  const result = fallbackClassification('disabled', 'roads');
  const adapter = new PostgresIncidentAdapter(
    database as unknown as DatabaseService,
    media as unknown as IncidentMediaService,
    { classify: async () => result },
    { ensureSynchronized: async () => {} } as unknown as ServiceCatalogSynchronizer,
  );

  await adapter.createIncident({
    address: row.adres_zgloszenia,
    description: row.opis_zgloszenia,
    imageUploadId,
    latitude: null,
    longitude: null,
    reporterEmail: row.mail_zglaszajacego,
    reporterUserId: null,
    requestedServiceKey: row.service_key,
  });

  expect(steps).toEqual(['verify', 'begin', 'insert', 'attach', 'read', 'commit']);
  expect(media.attach).toHaveBeenCalledExactlyOnceWith(client, row.id_zgloszenia, upload);
  expect(database.query).not.toHaveBeenCalled();
});

test('replays the committed response when reservation loses a concurrent insert', async () => {
  const command: CreateIncidentCommand = {
    address: row.adres_zgloszenia,
    description: row.opis_zgloszenia,
    idempotencyKey: '0de77abb-751d-4e6f-9c4a-79b24ca84d30',
    imageUploadId: null,
    latitude: null,
    longitude: null,
    reporterEmail: row.mail_zglaszajacego,
    reporterUserId: null,
    requestedServiceKey: row.service_key,
  };
  const identity = incidentCreationReceiptIdentity(command)!;
  const classification = {
    classification: 'unknown',
    serviceKey: row.service_key,
    modelAvailable: false,
    source: 'fallback',
    reason: 'disabled',
  } as const;
  const response = {
    success: true,
    incydent: parseDatabaseIncidentRow(row, 'fixture'),
    classification,
  } as const;
  const query = vi
    .fn<(sql: string, values?: readonly DatabaseParameter[]) => Promise<DatabaseQueryResult>>()
    .mockResolvedValue({
      rows: [{ inserted: false, fingerprint: identity[2], response }],
      rowCount: 1,
    });
  const create = vi.fn(async () => response);

  await expect(createWithIncidentReceipt({ query }, identity, create)).resolves.toEqual(response);
  expect(create).not.toHaveBeenCalled();
  expect(query).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('ON CONFLICT (scope, key) DO SELECT'),
    identity,
  );
  const changedRequest = incidentCreationReceiptIdentity({ ...command, description: 'Changed' })!;
  await expect(readIncidentCreationReceipt({ query }, changedRequest)).rejects.toMatchObject({
    statusCode: 409,
    errorCode: 'CONFLICT',
  });
  const authenticated = incidentCreationReceiptIdentity({
    ...command,
    reporterUserId: 'resident-1',
  })!;
  expect(authenticated[0]).not.toBe(identity[0]);
});

test('rechecks the receipt when another request consumed the upload after the first lookup', async () => {
  const command = {
    address: row.adres_zgloszenia,
    description: row.opis_zgloszenia,
    idempotencyKey: '0de77abb-751d-4e6f-9c4a-79b24ca84d30',
    imageUploadId: '00000000-0000-4000-8000-000000000001',
    latitude: null,
    longitude: null,
    reporterEmail: row.mail_zglaszajacego,
    reporterUserId: null,
    requestedServiceKey: row.service_key,
  } satisfies CreateIncidentCommand;
  const fingerprint = incidentCreationReceiptIdentity(command)![2];
  const classification = fallbackClassification('disabled', row.service_key);
  const response = {
    success: true,
    incydent: parseDatabaseIncidentRow(row, 'fixture'),
    classification: classification.result,
  };
  const query = vi
    .fn<(sql: string, values?: readonly DatabaseParameter[]) => Promise<DatabaseQueryResult>>()
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ fingerprint, response }], rowCount: 1 });
  const transaction = vi.fn();
  const verifyUpload = vi.fn().mockRejectedValue(badRequest('Image upload was consumed'));
  const classify = vi.fn();
  const adapter = new PostgresIncidentAdapter(
    { query, transaction } as unknown as DatabaseService,
    { verifyUpload } as unknown as IncidentMediaService,
    { classify },
    { ensureSynchronized: async () => {} } as unknown as ServiceCatalogSynchronizer,
  );

  await expect(adapter.createIncident(command)).resolves.toEqual(response);
  expect(verifyUpload).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledTimes(2);
  expect(classify).not.toHaveBeenCalled();
  expect(transaction).not.toHaveBeenCalled();
});
