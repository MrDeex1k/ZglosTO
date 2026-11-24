import { Injectable } from '@nestjs/common';
import {
  expectRecord,
  type AdminIncidentStatisticsItem,
  type AuthSessionUser,
  type CurrentCreateIncidentResponse,
  type CurrentDatabaseIncidentDto,
  type CurrentIncidentListItemDto,
  type CurrentResolvedIncidentDto,
  type IncidentPage,
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
import type { VerifiedImageUpload } from '../../../lib/incident-images.ts';
import { toLegacyLlmAnswer } from '../../../lib/llm-classification.ts';
import { claimVerifiedAnonymousIncidents } from '../../../lib/reporter-identity.ts';
import type { DatabaseClient } from '../../../types.ts';
import { DatabaseService } from '../database/database.service.ts';
import type { IncidentClassification } from '../../../lib/llm-classification.ts';
import { IncidentClassifier } from '../llm-gateway/incident-classifier.ts';
import { IncidentMediaService } from '../media/incident-media.service.ts';
import {
  IncidentDomainPort,
  type CreateIncidentCommand,
  type ServiceIncidentMutationResult,
  type UpdateUserPermissionsCommand,
} from './incident-domain.port.ts';
import {
  createWithIncidentReceipt,
  incidentCreationReceiptIdentity,
  readIncidentCreationReceipt,
} from './incident-creation-receipt.ts';
import { incidentPage, type IncidentPageRequest } from './incident-pagination.ts';
import { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';

const INCIDENT_LIST_COLUMNS = `
  SELECT i.id_zgloszenia, i.opis_zgloszenia, i.mail_zglaszajacego,
         i.adres_zgloszenia, i.latitude, i.longitude, ${INCIDENT_IMAGE_SELECTS},
         i.sprawdzenie_incydentu, i.status_incydentu, i.revision,
         i.service_key AS typ_sluzby, i.llm_odpowiedz, i.llm_classification,
         i.llm_model_available, i.llm_source, i.llm_reason,
         TO_CHAR(i.data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_zgloszenia, 'HH24:MI') AS data_godzina_zgloszenia,
         CASE WHEN i.data_rozwiazania IS NULL THEN NULL ELSE TO_CHAR(i.data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_rozwiazania, 'HH24:MI') END AS data_godzina_rozwiazania`;

const INCIDENT_LIST_SELECT = `
  ${INCIDENT_LIST_COLUMNS}
  FROM incydenty i
  ${INCIDENT_IMAGE_JOINS}`;

const INCIDENT_STATUS_UPDATE = `
  SET status_incydentu = $1::status_incydentu_enum,
      revision = revision + 1,
      data_rozwiazania = CASE
        WHEN $1 <> 'resolved' THEN NULL
        WHEN status_incydentu = 'resolved' AND data_rozwiazania IS NOT NULL
          AND godzina_rozwiazania IS NOT NULL THEN data_rozwiazania
        ELSE statement_timestamp()::date
      END,
      godzina_rozwiazania = CASE
        WHEN $1 <> 'resolved' THEN NULL
        WHEN status_incydentu = 'resolved' AND data_rozwiazania IS NOT NULL
          AND godzina_rozwiazania IS NOT NULL THEN godzina_rozwiazania
        ELSE statement_timestamp()::time
      END`;

const PUBLIC_RESOLVED_INCIDENT_SELECT = `
  SELECT i.id_zgloszenia, i.opis_zgloszenia, i.adres_zgloszenia,
              i.latitude, i.longitude, i.service_key AS typ_sluzby, i.status_incydentu,
              resolution_image.image_ref AS zdjecie_incydentu_rozwiazanego,
              TO_CHAR(i.data_zgloszenia, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_zgloszenia, 'HH24:MI') AS data_godzina_zgloszenia,
              TO_CHAR(i.data_rozwiazania, 'DD.MM.YYYY') || ' ' || TO_CHAR(i.godzina_rozwiazania, 'HH24:MI') AS data_godzina_rozwiazania
       FROM incydenty i
       LEFT JOIN incident_image_api_refs resolution_image
         ON resolution_image.incident_id = i.id_zgloszenia AND resolution_image.kind = 'resolution'
       WHERE i.status_incydentu = 'resolved'`;

@Injectable()
export class PostgresIncidentAdapter extends IncidentDomainPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly media: IncidentMediaService,
    private readonly classifier: IncidentClassifier,
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
    const receipt = incidentCreationReceiptIdentity(command);
    if (receipt !== null) {
      const replay = await readIncidentCreationReceipt(this.database, receipt);
      if (replay !== null) return replay;
    }

    let upload: VerifiedImageUpload | null = null;
    if (command.imageUploadId !== null) {
      try {
        upload = await this.media.verifyUpload('report', null, command.imageUploadId);
      } catch (error: unknown) {
        // A concurrent request can commit the receipt and consume the upload
        // after our first lookup but before we validate the upload.
        if (receipt !== null) {
          const replay = await readIncidentCreationReceipt(this.database, receipt);
          if (replay !== null) return replay;
        }
        throw error;
      }
    }

    const classification = await this.classifier.classify(
      command.description,
      command.requestedServiceKey,
    );
    return this.database.transaction((client) =>
      receipt === null
        ? this.insertIncident(client, command, upload, classification)
        : createWithIncidentReceipt(client, receipt, () =>
            this.insertIncident(client, command, upload, classification),
          ),
    );
  }

  private async insertIncident(
    client: DatabaseClient,
    command: CreateIncidentCommand,
    upload: VerifiedImageUpload | null,
    { result: classification, diagnostics }: IncidentClassification,
  ): Promise<CurrentCreateIncidentResponse> {
    const result = await client.query(
      `INSERT INTO incydenty (
         opis_zgloszenia, mail_zglaszajacego, reporter_user_id, adres_zgloszenia,
         latitude, longitude, service_key, llm_odpowiedz, llm_classification,
         llm_model_available, llm_source, llm_reason,
         llm_confidence_raw, llm_p_emergency_raw, llm_model_id, llm_model_revision,
         llm_prompt_version, llm_latency_ms, llm_calibration_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19)
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
        diagnostics?.confidenceRaw ?? null,
        diagnostics?.pEmergencyRaw ?? null,
        diagnostics?.modelId ?? null,
        diagnostics?.modelRevision ?? null,
        diagnostics?.promptVersion ?? null,
        diagnostics?.latencyMs ?? null,
        diagnostics?.calibrationVersion ?? null,
      ],
    );
    const row = result.rows[0] ?? null;
    if (row === null) throw new Error('Database did not return the created incident');
    const incidentId = incidentIdFromRow(row, 'createdIncidentId');

    if (upload !== null) await this.media.attach(client, incidentId, upload);

    return {
      success: true,
      incydent: await this.loadIncident(client, incidentId),
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

  async getResolvedIncident(incidentId: string): Promise<CurrentResolvedIncidentDto | null> {
    await this.ready();
    const { rows } = await this.database.query(
      `${PUBLIC_RESOLVED_INCIDENT_SELECT} AND i.id_zgloszenia = $1`,
      [incidentId],
    );
    return rows.length === 0 ? null : parseResolvedIncidentRow(rows[0], 'publicIncident');
  }

  async listResolvedIncidents(): Promise<readonly CurrentResolvedIncidentDto[]> {
    await this.ready();
    const result = await this.database.query(
      `${PUBLIC_RESOLVED_INCIDENT_SELECT}
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

  pageAdminIncidents(page: IncidentPageRequest): Promise<IncidentPage<CurrentIncidentListItemDto>> {
    return this.listPage(page, null, parseIncidentListRow);
  }

  pageResidentIncidents(
    userId: string,
    page: IncidentPageRequest,
  ): Promise<IncidentPage<CurrentIncidentListItemDto>> {
    return this.listPage(page, { column: 'reporter_user_id', value: userId }, parseIncidentListRow);
  }

  pageServiceIncidents(
    serviceKey: string,
    page: IncidentPageRequest,
  ): Promise<IncidentPage<ServiceIncidentListItemDto>> {
    return this.listPage(
      page,
      { column: 'service_key', value: serviceKey },
      parseServiceIncidentListRow,
    );
  }

  private async listPage<Item>(
    page: IncidentPageRequest,
    scope: { column: 'reporter_user_id' | 'service_key'; value: string } | null,
    parseItem: (row: unknown, path: string) => Item,
  ): Promise<IncidentPage<Item>> {
    await this.ready();
    const parameters: (number | string)[] = [page.limit + 1];
    const predicates: string[] = [];
    if (scope !== null) {
      parameters.push(scope.value);
      predicates.push(`i.${scope.column} = $${parameters.length}`);
    }
    if (page.after !== null) {
      const start = parameters.length + 1;
      parameters.push(...page.after);
      predicates.push(`(i.data_zgloszenia, i.godzina_zgloszenia, i.id_zgloszenia)
        < ($${start}::date, $${start + 1}::time, $${start + 2}::uuid)`);
    }
    const where = predicates.length === 0 ? '' : `WHERE ${predicates.join(' AND ')}`;
    const order =
      'ORDER BY i.data_zgloszenia DESC, i.godzina_zgloszenia DESC, i.id_zgloszenia DESC';
    const result = await this.database.query(
      `WITH page AS (
         SELECT i.*
         FROM incydenty i
         ${where}
         ${order}
         LIMIT $1
       )
       ${INCIDENT_LIST_COLUMNS},
              TO_CHAR(i.data_zgloszenia, 'YYYY-MM-DD') AS cursor_date,
              i.godzina_zgloszenia::text AS cursor_time
       FROM page i
       ${INCIDENT_IMAGE_JOINS}
       ${order}`,
      parameters,
    );
    return incidentPage(page, result.rows, parseItem);
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
      `UPDATE incydenty ${INCIDENT_STATUS_UPDATE}
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
      `UPDATE incydenty ${INCIDENT_STATUS_UPDATE}
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
    const assignmentQuery =
      'SELECT id_zgloszenia FROM incydenty WHERE id_zgloszenia = $1 AND service_key = $2';
    const parameters = [incidentId, serviceKey];
    // Reject unassigned incidents before looking up the upload or contacting storage.
    if ((await this.database.query(assignmentQuery, parameters)).rowCount === 0) return null;
    const upload = await this.media.verifyUpload('resolution', incidentId, imageUploadId);

    const result = await this.database.transaction(async (client) => {
      const assigned = await client.query(`${assignmentQuery} FOR UPDATE`, parameters);
      if (assigned.rowCount === 0) return null;
      const obsoleteKeys = await this.media.attach(client, incidentId, upload);
      await client.query('UPDATE incydenty SET revision = revision + 1 WHERE id_zgloszenia = $1', [
        incidentId,
      ]);
      return { incident: await this.loadIncident(client, incidentId), obsoleteKeys };
    });
    if (result === null) return null;
    await this.media.cleanupReplacedObjects(result.obsoleteKeys);
    return result.incident;
  }

  private updateIncident(
    query: string,
    parameters: readonly (string | boolean)[],
  ): Promise<CurrentDatabaseIncidentDto | null> {
    return this.database.transaction(async (client) => {
      const result = await client.query(query, parameters);
      const row = result.rows[0] ?? null;
      if (row === null) return null;
      return this.loadIncident(client, incidentIdFromRow(row, 'updatedIncidentId'));
    });
  }

  private updateVersionedServiceIncident(
    query: string,
    parameters: readonly (string | boolean | number)[],
    incidentId: string,
    serviceKey: string,
  ): Promise<ServiceIncidentMutationResult> {
    return this.database.transaction(async (client) => {
      const result = await client.query(query, parameters);
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
            incident: await this.loadIncident(
              client,
              incidentIdFromRow(record, 'updatedServiceIncidentId'),
            ),
            revision,
          },
        };
      }
      const current = await client.query(
        'SELECT revision FROM incydenty WHERE id_zgloszenia = $1 AND service_key = $2',
        [incidentId, serviceKey],
      );
      return current.rows.length === 0 ? { kind: 'not-found' } : { kind: 'conflict' };
    });
  }

  private async loadIncident(
    client: DatabaseClient,
    incidentId: string,
  ): Promise<CurrentDatabaseIncidentDto> {
    return parseDatabaseIncidentRow(await loadDatabaseIncident(client, incidentId), 'incident');
  }

  private ready(): Promise<void> {
    return this.serviceCatalog.ensureSynchronized();
  }
}
