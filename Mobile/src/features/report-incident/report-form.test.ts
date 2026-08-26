import { describe, expect, test } from 'vitest';

import { validateReportIncidentForm } from './report-form';

describe('report incident form', () => {
  test('normalizes valid input into the backend contract', () => {
    expect(
      validateReportIncidentForm({
        address: '  ul. Testowa 12  ',
        description: '  Uszkodzona nawierzchnia  ',
        email: '  RESIDENT@EXAMPLE.COM ',
        serviceKey: ' roads ',
      }),
    ).toEqual({
      request: {
        adres_zgloszenia: 'ul. Testowa 12',
        latitude: null,
        longitude: null,
        mail_zglaszajacego: 'resident@example.com',
        opis_zgloszenia: 'Uszkodzona nawierzchnia',
        typ_sluzby: 'roads',
        zdjecie_incydentu_zglaszanego_upload_id: null,
      },
      success: true,
    });
  });

  test('returns field-level errors for incomplete input', () => {
    expect(
      validateReportIncidentForm({ address: ' ', description: '', email: '', serviceKey: '' }),
    ).toEqual({
      errors: {
        address: 'required',
        description: 'required',
        email: 'required',
        serviceKey: 'required',
      },
      success: false,
    });
  });

  test('rejects an invalid email address', () => {
    const result = validateReportIncidentForm({
      address: 'ul. Testowa 12',
      description: 'Uszkodzona nawierzchnia',
      email: 'invalid',
      serviceKey: 'roads',
    });

    expect(result).toEqual({ errors: { email: 'email' }, success: false });
  });

  test('adds a completed image upload to the incident request', () => {
    const result = validateReportIncidentForm(
      {
        address: 'ul. Testowa 12',
        description: 'Uszkodzona nawierzchnia',
        email: 'resident@example.com',
        serviceKey: 'roads',
      },
      'd75d89fc-c748-4cfc-a3e6-7c671aa36c3b',
    );

    expect(result.success && result.request.zdjecie_incydentu_zglaszanego_upload_id).toBe(
      'd75d89fc-c748-4cfc-a3e6-7c671aa36c3b',
    );
  });
});
