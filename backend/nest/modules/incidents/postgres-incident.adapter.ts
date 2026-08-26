import { Injectable } from '@nestjs/common';
import {
  expectRecord,
  type AdminIncidentStatisticsItem,
  type AuthSessionUser,
  type CurrentCreateIncidentResponse,
  type CurrentDatabaseIncidentDto,
  type CurrentIncidentListItemDto,
  type CurrentResolvedIncidentDto,
  type IncidentStatusCode,
  type ServiceIncidentStatisticsItem,
  type ServiceIncidentListItemDto,
  type UpdatedUserPermissions,
} from '@zglosto/contracts';
import {
  parseAdminStatisticRow,
  parseDatabaseIncidentRow,
  parseDatabasePositiveInteger,
  parseIncidentListRow,
  parseResolvedIncidentRow,
  parseServiceStatisticRow,
  parseServiceIncidentListRow,
  parseUpdatedUserPermissionsRow,
  parseUserIdRow,
} from '../../../lib/database-records.ts';
import {
  INCIDENT_IMAGE_JOINS,
  INCIDENT_IMAGE_SELECTS,
  incidentIdFromRow,
  loadDatabaseIncident,
} from '../../../lib/incident-queries.ts';
import { toLegacyLlmAnswer } from '../../../lib/llm-classification.ts';
import { claimVerifiedAnonymousIncidents } from '../../../lib/reporter-identity.ts';
import { DatabaseService } from '../database/database.service.ts';
import { IncidentClassifier } from '../llm-gateway/incident-classifier.ts';
import { IncidentMediaService } from '../media/incident-media.service.ts';
import { WhiteLabelConfigService } from '../white-label/white-label-config.service.ts';
import {
  IncidentDomainPort,
  type CreateIncidentCommand,
  type ServiceIncidentMutationResult,
  type UpdateUserPermissionsCommand,
} from './incident-domain.port.ts';
import { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';

const INCIDENT_LIST_SELECT = `
  SELECT i.id_zgloszenia, i.opis_zgloszenia, i.mail_zglaszajacego,
         i.adres_zgloszenia, i.latitude, i.longitude, ${INCIDENT_IMAGE_SELECTS},
         i.sprawdzenie_incydentu, i.status_incydentu, i.revision,
         i.service_key AS typ_sluzby, i.llm_odpowiedz, i.llm_classification,
         i.llm_model_available, i.llm_source, i.llm_reason,
         TO_CHAR(i.data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_zgloszenia, 'HH24:MI') AS data_godzina_zgloszenia,
         CASE WHEN i.data_rozwiazania IS NULL THEN NULL ELSE TO_CHAR(i.data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_rozwiazania, 'HH24:MI') END AS data_godzina_rozwiazania
  FROM incydenty i
  ${INCIDENT_IMAGE_JOINS}`;

@Injectable()
export class PostgresIncidentAdapter extends IncidentDomainPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly media: IncidentMediaService,
    private readonly classifier: IncidentClassifier,
    private readonly whiteLabel: WhiteLabelConfigService,
    private readonly serviceCatalog: ServiceCatalogSynchronizer,
  ) {
    super();
  }

  async claimAnonymousIncidents(user: AuthSessionUser): Promise<void> {
    await this.ready();
    await claimVerifiedAnonymousIncidents(this.database, user.id);
  }

  async createIncident(command: CreateIncidentCommand): Promise<CurrentCreateIncidentResponse> {
    await this.ready();
    const classification = await this.classifier.classify(
      command.description,
      command.requestedServiceKey,
      this.whiteLabel.serviceCatalog.fallbackServiceKey,
    );
    const result = await this.database.query(
      `INSERT INTO incydenty (
         opis_zgloszenia, mail_zglaszajacego, reporter_user_id, adres_zgloszenia,
         latitude, longitude, service_key, llm_odpowiedz, llm_classification,
         llm_model_available, llm_source, llm_reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id_zgloszenia`,
      [
        command.description,
        command.reporterEmail,
        command.reporterUserId,
        command.address,
        command.latitude,
        command.longitude,
        classification.serviceKey,
        toLegacyLlmAnswer(classification.classification),
        classification.classification,
        classification.modelAvailable,
        classification.source,
        classification.reason,
      ],
    );
    const row = result.rows[0] ?? null;
    if (row === null) throw new Error('Database did not return the created incident');
    const incidentId = incidentIdFromRow(row, 'createdIncidentId');

    if (command.imageUploadId !== null) {
      try {
        await this.media.store(incidentId, 'report', command.imageUploadId);
      } catch (error: unknown) {
        await this.database.query('DELETE FROM incydenty WHERE id_zgloszenia = $1', [incidentId]);
        throw error;
      }
    }

    return {
      success: true,
      incydent: await this.loadIncident(incidentId),
      classification,
    };
  }

  async listAdminIncidents(): Promise<readonly CurrentIncidentListItemDto[]> {
    await this.ready();
    const result = await this.database.query(
      `${INCIDENT_LIST_SELECT}
       ORDER BY i.data_zgloszenia DESC, i.godzina_zgloszenia DESC`,
    );
    return result.rows.map((row, index) => parseIncidentListRow(row, `adminIncidents[${index}]`));
  }

  async listAdminStatistics(): Promise<readonly AdminIncidentStatisticsItem[]> {
    await this.ready();
    const result = await this.database.query(
      `SELECT service_key AS typ_sluzby, status_incydentu, count(*)::int AS liczba
       FROM incydenty
       GROUP BY service_key, status_incydentu
       ORDER BY service_key`,
    );
    return result.rows.map((row, index) =>
      parseAdminStatisticRow(row, `adminStatistics[${index}]`),
    );
  }

  async listResidentIncidents(userId: string): Promise<readonly CurrentIncidentListItemDto[]> {
    await this.ready();
    const result = await this.database.query(
      `${INCIDENT_LIST_SELECT}
       WHERE i.reporter_user_id = $1
       ORDER BY i.data_zgloszenia DESC, i.godzina_zgloszenia DESC`,
      [userId],
    );
    return result.rows.map((row, index) =>
      parseIncidentListRow(row, `residentIncidents[${index}]`),
    );
  }

  async listResolvedIncidents(): Promise<readonly CurrentResolvedIncidentDto[]> {
    await this.ready();
    const result = await this.database.query(
      `SELECT i.id_zgloszenia, i.opis_zgloszenia, i.adres_zgloszenia,
              i.latitude, i.longitude, i.service_key AS typ_sluzby, i.status_incydentu,
              resolution_image.image_ref AS zdjecie_incydentu_rozwiazanego,
              TO_CHAR(i.data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_zgloszenia, 'HH24:MI') AS data_godzina_zgloszenia,
              TO_CHAR(i.data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_rozwiazania, 'HH24:MI') AS data_godzina_rozwiazania
       FROM incydenty i
       LEFT JOIN incident_image_api_refs resolution_image
         ON resolution_image.incident_id = i.id_zgloszenia AND resolution_image.kind = 'resolution'
       WHERE i.status_incydentu = 'resolved'
       ORDER BY i.data_rozwiazania DESC NULLS LAST,
                i.godzina_rozwiazania DESC NULLS LAST,
                i.id_zgloszenia DESC
       LIMIT 15`,
    );
    return result.rows.map((row, index) =>
      parseResolvedIncidentRow(row, `resolvedIncidents[${index}]`),
    );
  }

  async listServiceIncidents(serviceKey: string): Promise<readonly ServiceIncidentListItemDto[]> {
    await this.ready();
    const result = await this.database.query(
      `${INCIDENT_LIST_SELECT}
       WHERE i.service_key = $1
       ORDER BY i.status_incydentu, i.data_zgloszenia`,
      [serviceKey],
    );
    return result.rows.map((row, index) =>
      parseServiceIncidentListRow(row, `serviceIncidents[${index}]`),
    );
  }

  async listServiceStatistics(
    serviceKey: string,
  ): Promise<readonly ServiceIncidentStatisticsItem[]> {
    await this.ready();
    const result = await this.database.query(
      `SELECT status_incydentu, count(*)::int AS liczba
       FROM incydenty
       WHERE service_key = $1
       GROUP BY status_incydentu`,
      [serviceKey],
    );
    return result.rows.map((row, index) => parseServiceStatisticRow(row, `serviceStats[${index}]`));
  }

  async updateAdminIncidentService(
    incidentId: string,
    serviceKey: string,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    await this.ready();
    return this.updateIncident(
      'UPDATE incydenty SET service_key = $1, revision = revision + 1 WHERE id_zgloszenia = $2 RETURNING id_zgloszenia',
      [serviceKey, incidentId],
    );
  }

  async updateAdminIncidentStatus(
    incidentId: string,
    status: IncidentStatusCode,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    await this.ready();
    return this.updateIncident(
      `UPDATE incydenty
       SET status_incydentu = $1::status_incydentu_enum,
           revision = revision + 1,
           data_rozwiazania = CASE WHEN $1 = 'resolved' THEN CURRENT_DATE ELSE NULL END,
           godzina_rozwiazania = CASE WHEN $1 = 'resolved' THEN CURRENT_TIME ELSE NULL END
       WHERE id_zgloszenia = $2
       RETURNING id_zgloszenia`,
      [status, incidentId],
    );
  }

  async updateAdminIncidentVerification(
    incidentId: string,
    verified: boolean,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    await this.ready();
    return this.updateIncident(
      'UPDATE incydenty SET sprawdzenie_incydentu = $1, revision = revision + 1 WHERE id_zgloszenia = $2 RETURNING id_zgloszenia',
      [verified, incidentId],
    );
  }

  async updateServiceIncidentService(
    incidentId: string,
    currentServiceKey: string,
    targetServiceKey: string,
    expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult> {
    await this.ready();
    return this.updateVersionedServiceIncident(
      `UPDATE incydenty SET service_key = $1, revision = revision + 1
       WHERE id_zgloszenia = $2 AND service_key = $3 AND revision = $4
       RETURNING id_zgloszenia, revision`,
      [targetServiceKey, incidentId, currentServiceKey, expectedRevision],
      incidentId,
      currentServiceKey,
    );
  }

  async updateServiceIncidentStatus(
    incidentId: string,
    serviceKey: string,
    status: IncidentStatusCode,
    expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult> {
    await this.ready();
    return this.updateVersionedServiceIncident(
      `UPDATE incydenty
       SET status_incydentu = $1::status_incydentu_enum,
           revision = revision + 1,
           data_rozwiazania = CASE WHEN $1 = 'resolved' THEN CURRENT_DATE ELSE data_rozwiazania END,
           godzina_rozwiazania = CASE WHEN $1 = 'resolved' THEN CURRENT_TIME ELSE godzina_rozwiazania END
       WHERE id_zgloszenia = $2 AND service_key = $3 AND revision = $4
       RETURNING id_zgloszenia, revision`,
      [status, incidentId, serviceKey, expectedRevision],
      incidentId,
      serviceKey,
    );
  }

  async updateServiceIncidentVerification(
    incidentId: string,
    serviceKey: string,
    verified: boolean,
    expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult> {
    await this.ready();
    return this.updateVersionedServiceIncident(
      `UPDATE incydenty SET sprawdzenie_incydentu = $1, revision = revision + 1
       WHERE id_zgloszenia = $2 AND service_key = $3 AND revision = $4
       RETURNING id_zgloszenia, revision`,
      [verified, incidentId, serviceKey, expectedRevision],
      incidentId,
      serviceKey,
    );
  }

  async updateUserPermissions(
    command: UpdateUserPermissionsCommand,
  ): Promise<UpdatedUserPermissions | null> {
    await this.ready();
    const userResult = await this.database.query('SELECT id FROM "user" WHERE email = $1', [
      command.email,
    ]);
    const userRow = userResult.rows[0] ?? null;
    if (userRow === null) return null;
    const userId = parseUserIdRow(userRow, 'betterAuthUser');
    const result = await this.database.query(
      `UPDATE uzytkownicy
       SET uprawnienia = $1, service_key = $2
       WHERE id_uzytkownika = $3
       RETURNING id_uzytkownika, uprawnienia, service_key AS "serviceKey"`,
      [command.role, command.serviceKey, userId],
    );
    const row = result.rows[0] ?? null;
    return row === null ? null : parseUpdatedUserPermissionsRow(row, 'updatedUserPermissions');
  }

  async uploadResolutionImage(
    incidentId: string,
    serviceKey: string,
    imageUploadId: string,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    await this.ready();
    const result = await this.database.query(
      'SELECT id_zgloszenia FROM incydenty WHERE id_zgloszenia = $1 AND service_key = $2',
      [incidentId, serviceKey],
    );
    const row = result.rows[0] ?? null;
    if (row === null) return null;
    const resolvedIncidentId = incidentIdFromRow(row, 'resolvedImageIncidentId');
    await this.media.store(resolvedIncidentId, 'resolution', imageUploadId);
    return this.loadIncident(resolvedIncidentId);
  }

  private async updateIncident(
    query: string,
    parameters: readonly (string | boolean)[],
  ): Promise<CurrentDatabaseIncidentDto | null> {
    const result = await this.database.query(query, parameters);
    const row = result.rows[0] ?? null;
    if (row === null) return null;
    return this.loadIncident(incidentIdFromRow(row, 'updatedIncidentId'));
  }

  private async updateVersionedServiceIncident(
    query: string,
    parameters: readonly (string | boolean | number)[],
    incidentId: string,
    serviceKey: string,
  ): Promise<ServiceIncidentMutationResult> {
    const result = await this.database.query(query, parameters);
    const row = result.rows[0] ?? null;
    if (row !== null) {
      const record = expectRecord(row, 'updatedServiceIncident');
      const revision = parseDatabasePositiveInteger(
        record.revision,
        'updatedServiceIncident.revision',
      );
      return {
        kind: 'updated',
        value: {
          incident: await this.loadIncident(incidentIdFromRow(record, 'updatedServiceIncidentId')),
          revision,
        },
      };
    }
    const current = await this.database.query(
      'SELECT revision FROM incydenty WHERE id_zgloszenia = $1 AND service_key = $2',
      [incidentId, serviceKey],
    );
    return current.rows.length === 0 ? { kind: 'not-found' } : { kind: 'conflict' };
  }

  private async loadIncident(incidentId: string): Promise<CurrentDatabaseIncidentDto> {
    return parseDatabaseIncidentRow(
      await loadDatabaseIncident(this.database, incidentId),
      'incident',
    );
  }

  private ready(): Promise<void> {
    return this.serviceCatalog.ensureSynchronized();
  }
}
