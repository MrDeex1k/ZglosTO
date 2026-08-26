import type { CurrentIncidentListItemDto } from '@zglosto/contracts';
import { describe, expect, test } from 'vitest';

import { filterServiceIncidents, serviceIncidentCounts } from './service-queue';

function incident(
  id: string,
  status: CurrentIncidentListItemDto['status_incydentu'],
): CurrentIncidentListItemDto {
  return {
    adres_zgloszenia: 'ul. Testowa 1',
    data_godzina_rozwiazania: null,
    data_godzina_zgloszenia: '21.08.2026 10:00',
    id_zgloszenia: id,
    latitude: null,
    llm_classification: 'unknown',
    llm_model_available: false,
    llm_odpowiedz: null,
    llm_reason: 'disabled',
    llm_source: 'fallback',
    longitude: null,
    mail_zglaszajacego: 'resident@example.test',
    opis_zgloszenia: 'Opis',
    sprawdzenie_incydentu: false,
    status_incydentu: status,
    typ_sluzby: 'roads',
    zdjecie_incydentu_rozwiazanego: null,
    zdjecie_incydentu_zglaszanego: null,
  };
}

const incidents = [
  incident('00000000-0000-4000-8000-000000000001', 'reported'),
  incident('00000000-0000-4000-8000-000000000002', 'in_progress'),
  incident('00000000-0000-4000-8000-000000000003', 'resolved'),
];

describe('service queue model', () => {
  test('keeps the selected filter deterministic across refreshed data', () => {
    expect(filterServiceIncidents(incidents, 'in_progress')).toEqual([incidents[1]]);
    expect(filterServiceIncidents([...incidents].reverse(), 'in_progress')).toEqual([incidents[1]]);
    expect(filterServiceIncidents(incidents, 'all')).toEqual(incidents);
  });

  test('uses scoped statistics when available and fills missing statuses with zero', () => {
    expect(
      serviceIncidentCounts(incidents, [
        { liczba: 7, status_incydentu: 'reported' },
        { liczba: 2, status_incydentu: 'resolved' },
      ]),
    ).toEqual({ all: 9, in_progress: 0, reported: 7, resolved: 2 });
  });

  test('falls back to the loaded queue when statistics cannot be refreshed', () => {
    expect(serviceIncidentCounts(incidents)).toEqual({
      all: 3,
      in_progress: 1,
      reported: 1,
      resolved: 1,
    });
  });
});
