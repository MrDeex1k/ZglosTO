import { describe, expect, test } from 'vitest';

import {
  ContractValidationError,
  CurrentCreateIncidentRequestSchema,
  LLM_CLASSIFICATION_CONTENT_TYPE,
  LLM_CLASSIFICATION_HTTP_METHOD,
  LLM_CLASSIFICATION_LEGACY_HTTP_METHOD,
  LLM_CLASSIFICATION_PATH,
  formatIncidentRevisionEtag,
  parseCurrentIncidentList,
  parseIncidentRevisionEtag,
  parseServiceIncidentList,
  parseCurrentLlmClassificationResult,
  parseSetUserRoleRequest,
  parseVerifiedAuthSession,
  UpdateUserPermissionsRequestSchema,
} from './index.js';

const currentIncident = {
  id_zgloszenia: 'incident-1',
  opis_zgloszenia: 'Dziura w jezdni',
  mail_zglaszajacego: 'resident@example.com',
  adres_zgloszenia: 'ul. Testowa 1',
  latitude: null,
  longitude: null,
  zdjecie_incydentu_zglaszanego: null,
  zdjecie_incydentu_rozwiazanego: null,
  sprawdzenie_incydentu: false,
  status_incydentu: 'reported',
  typ_sluzby: 'roads',
  llm_odpowiedz: null,
  llm_classification: 'municipal',
  llm_model_available: true,
  llm_source: 'model',
  llm_reason: null,
  data_godzina_zgloszenia: '2026-07-17T12:00:00.000Z',
  data_godzina_rozwiazania: null,
};

const reportImage = {
  id: '019c-image',
  kind: 'report',
  status: 'pending',
  original: {
    objectKey: 'incident-1/report/original.png',
    mimeType: 'image/png',
    sizeBytes: 68,
    checksumSha256: 'a'.repeat(64),
  },
  processed: null,
  width: null,
  height: null,
  failureCode: null,
  url: '/api/images/019c-image',
};

describe('authorization contracts', () => {
  test('normalizes omitted nullable session fields at the HTTP boundary', () => {
    expect(
      parseVerifiedAuthSession({
        success: true,
        user: {
          id: 'user-1',
          email: 'resident@example.com',
          emailVerified: true,
        },
        session: { id: 'session-1' },
      }),
    ).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'resident@example.com',
        name: null,
        emailVerified: true,
        image: null,
        uprawnienia: null,
        serviceKey: null,
      },
      session: { id: 'session-1' },
    });
  });

  test('rejects a session with an unsupported role', () => {
    expect(() =>
      parseVerifiedAuthSession({
        success: true,
        user: {
          id: 'user-1',
          email: 'resident@example.com',
          emailVerified: true,
          uprawnienia: 'operator',
        },
        session: {},
      }),
    ).toThrow(ContractValidationError);
  });

  test('requires a service assignment for the service role', () => {
    expect(() =>
      parseSetUserRoleRequest({
        email: 'service@example.com',
        role: 'sluzby',
        serviceKey: null,
      }),
    ).toThrow('string for sluzby role');

    expect(
      parseSetUserRoleRequest({
        email: 'service@example.com',
        role: 'sluzby',
        serviceKey: 'roads',
      }),
    ).toEqual({
      email: 'service@example.com',
      role: 'sluzby',
      serviceKey: 'roads',
    });

    expect(() =>
      parseVerifiedAuthSession({
        success: true,
        user: {
          id: 'service-1',
          email: 'service@example.com',
          emailVerified: true,
          uprawnienia: 'sluzby',
          serviceKey: null,
        },
        session: {},
      }),
    ).toThrow('string for sluzby role');
  });

  test('rejects a service assignment leaked to a non-service role', () => {
    expect(() =>
      parseVerifiedAuthSession({
        success: true,
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          emailVerified: true,
          uprawnienia: 'admin',
          serviceKey: 'roads',
        },
        session: {},
      }),
    ).toThrow('null outside sluzby role');
  });
});

describe('incident contracts', () => {
  test('validates and normalizes the NestJS create incident request', () => {
    expect(
      CurrentCreateIncidentRequestSchema.parse({
        opis_zgloszenia: '  Opis  ',
        mail_zglaszajacego: 'resident@example.com',
        adres_zgloszenia: '  Adres  ',
      }),
    ).toEqual({
      opis_zgloszenia: 'Opis',
      mail_zglaszajacego: 'resident@example.com',
      adres_zgloszenia: 'Adres',
      latitude: null,
      longitude: null,
      typ_sluzby: null,
      zdjecie_incydentu_zglaszanego_upload_id: null,
    });
    expect(() =>
      CurrentCreateIncidentRequestSchema.parse({
        opis_zgloszenia: 'Opis',
        mail_zglaszajacego: 'resident@example.com',
        adres_zgloszenia: 'Adres',
        latitude: 52,
      }),
    ).toThrow('latitude and longitude must both be present');
  });

  test('accepts the current incident list DTO', () => {
    expect(parseCurrentIncidentList([currentIncident])).toEqual([currentIncident]);
  });

  test('requires a positive revision for service incident lists', () => {
    expect(parseServiceIncidentList([{ ...currentIncident, revision: 7 }])).toEqual([
      { ...currentIncident, revision: 7 },
    ]);
    expect(() => parseServiceIncidentList([currentIncident])).toThrow(
      'serviceIncidents[0].revision',
    );
    expect(() => parseServiceIncidentList([{ ...currentIncident, revision: 0 }])).toThrow(
      'positive integer',
    );
  });

  test('formats and parses strict incident revision entity tags', () => {
    expect(formatIncidentRevisionEtag(12)).toBe('"incident-12"');
    expect(parseIncidentRevisionEtag('"incident-12"')).toBe(12);
    expect(parseIncidentRevisionEtag('incident-12')).toBeNull();
    expect(parseIncidentRevisionEtag('W/"incident-12"')).toBeNull();
    expect(parseIncidentRevisionEtag('"incident-0"')).toBeNull();
  });

  test('accepts provider-neutral image metadata instead of binary database data', () => {
    const incidentWithImage = {
      ...currentIncident,
      zdjecie_incydentu_zglaszanego: reportImage,
    };
    expect(parseCurrentIncidentList([incidentWithImage])).toEqual([incidentWithImage]);
  });

  test('rejects legacy incident statuses', () => {
    expect(() =>
      parseCurrentIncidentList([{ ...currentIncident, status_incydentu: 'w_trakcie' }]),
    ).toThrow('reported | in_progress | resolved');
  });

  test('rejects a missing required field instead of propagating it', () => {
    const { adres_zgloszenia: _removed, ...withoutAddress } = currentIncident;
    expect(() => parseCurrentIncidentList([withoutAddress])).toThrow(
      'incidents[0].adres_zgloszenia',
    );
  });

  test('accepts a complete WGS84 coordinate pair', () => {
    const locatedIncident = { ...currentIncident, latitude: 54.352, longitude: 18.6466 };
    expect(parseCurrentIncidentList([locatedIncident])).toEqual([locatedIncident]);
  });

  test('rejects partial or out-of-range coordinates', () => {
    expect(() => parseCurrentIncidentList([{ ...currentIncident, latitude: 54.352 }])).toThrow(
      'both coordinates or both null',
    );
    expect(() =>
      parseCurrentIncidentList([{ ...currentIncident, latitude: 91, longitude: 18.6466 }]),
    ).toThrow('number between -90 and 90');
    expect(() =>
      parseCurrentIncidentList([{ ...currentIncident, latitude: 54.352, longitude: 181 }]),
    ).toThrow('number between -180 and 180');
  });
});

describe('admin request contracts', () => {
  test('binds serviceKey exclusively to the service role', () => {
    expect(
      UpdateUserPermissionsRequestSchema.parse({
        email: 'SERVICE@example.com',
        uprawnienia: 'sluzby',
        serviceKey: 'roads',
      }),
    ).toEqual({
      email: 'service@example.com',
      uprawnienia: 'sluzby',
      serviceKey: 'roads',
    });
    expect(() =>
      UpdateUserPermissionsRequestSchema.parse({
        email: 'admin@example.com',
        uprawnienia: 'admin',
        serviceKey: 'roads',
      }),
    ).toThrow('serviceKey must be null outside sluzby role');
  });
});

describe('LLM contracts', () => {
  test('publishes the internal HTTP classification contract', () => {
    expect({
      contentType: LLM_CLASSIFICATION_CONTENT_TYPE,
      legacyMethod: LLM_CLASSIFICATION_LEGACY_HTTP_METHOD,
      method: LLM_CLASSIFICATION_HTTP_METHOD,
      path: LLM_CLASSIFICATION_PATH,
    }).toEqual({
      contentType: 'application/json',
      legacyMethod: 'POST',
      method: 'QUERY',
      path: '/classify-incident',
    });
  });

  test('accepts the structured fallback result', () => {
    expect(
      parseCurrentLlmClassificationResult({
        classification: 'unknown',
        serviceKey: 'manual_review',
        modelAvailable: false,
        source: 'fallback',
        reason: 'unavailable',
      }),
    ).toEqual({
      classification: 'unknown',
      serviceKey: 'manual_review',
      modelAvailable: false,
      source: 'fallback',
      reason: 'unavailable',
    });
  });

  test('rejects fallback reasons outside the closed catalogue', () => {
    expect(() =>
      parseCurrentLlmClassificationResult({
        classification: 'unknown',
        serviceKey: 'manual_review',
        modelAvailable: false,
        source: 'fallback',
        reason: 'network_error',
      }),
    ).toThrow(ContractValidationError);
  });
});
