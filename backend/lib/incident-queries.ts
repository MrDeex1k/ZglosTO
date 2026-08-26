import { expectRecord, expectString } from '@zglosto/contracts';
import type { DatabaseClient } from '../types.ts';

export const INCIDENT_IMAGE_SELECTS = `
  report_image.image_ref AS zdjecie_incydentu_zglaszanego,
  resolution_image.image_ref AS zdjecie_incydentu_rozwiazanego
`;

export const INCIDENT_IMAGE_JOINS = `
  LEFT JOIN incident_image_api_refs report_image
    ON report_image.incident_id = i.id_zgloszenia AND report_image.kind = 'report'
  LEFT JOIN incident_image_api_refs resolution_image
    ON resolution_image.incident_id = i.id_zgloszenia AND resolution_image.kind = 'resolution'
`;

export async function loadDatabaseIncident(
  database: DatabaseClient,
  incidentId: string,
): Promise<Record<string, unknown>> {
  const result = await database.query(
    `SELECT i.*, i.service_key AS typ_sluzby,
            ${INCIDENT_IMAGE_SELECTS}
     FROM incydenty i
     ${INCIDENT_IMAGE_JOINS}
     WHERE i.id_zgloszenia = $1`,
    [incidentId],
  );
  const row = result.rows[0] ?? null;
  if (row === null) throw new Error('Incident not found after database mutation');
  return expectRecord(row, 'databaseIncident');
}

export function incidentIdFromRow(value: unknown, path: string): string {
  return expectString(expectRecord(value, path).id_zgloszenia, `${path}.id_zgloszenia`);
}
