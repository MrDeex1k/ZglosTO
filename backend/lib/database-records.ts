import {
  expectInteger,
  expectRecord,
  expectString,
  expectUserRole,
  isIncidentStatus,
  parseCurrentDatabaseIncident,
  parseCurrentIncidentListItem,
  parseCurrentResolvedIncident,
  type AdminIncidentStatisticsItem,
  type CurrentDatabaseIncidentDto,
  type CurrentIncidentListItemDto,
  type CurrentResolvedIncidentDto,
  type ServiceIncidentStatisticsItem,
  type ServiceIncidentListItemDto,
  type UpdatedUserPermissions,
} from '@zglosto/contracts';

function databaseTemporalToString(value: unknown, path: string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  throw new Error(`Invalid database record at ${path}: expected string or Date`);
}

function nullableDatabaseTemporalToString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return databaseTemporalToString(value, path);
}

export function parseDatabasePositiveInteger(value: unknown, path: string): number {
  const parsed =
    typeof value === 'string' && /^[1-9][0-9]*$/u.test(value)
      ? Number(value)
      : expectInteger(value, path);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid database record at ${path}: expected positive safe integer`);
  }
  return parsed;
}

export function parseIncidentListRow(value: unknown, path: string): CurrentIncidentListItemDto {
  return parseCurrentIncidentListItem(expectRecord(value, path), path);
}

export function parseServiceIncidentListRow(
  value: unknown,
  path: string,
): ServiceIncidentListItemDto {
  const row = expectRecord(value, path);
  const revision = parseDatabasePositiveInteger(row.revision, `${path}.revision`);
  return { ...parseCurrentIncidentListItem(row, path), revision };
}

export function parseResolvedIncidentRow(value: unknown, path: string): CurrentResolvedIncidentDto {
  return parseCurrentResolvedIncident(expectRecord(value, path), path);
}

export function parseDatabaseIncidentRow(value: unknown, path: string): CurrentDatabaseIncidentDto {
  const row = expectRecord(value, path);
  return parseCurrentDatabaseIncident(
    {
      ...row,
      typ_sluzby: expectString(row.service_key, `${path}.service_key`),
      data_zgloszenia: databaseTemporalToString(row.data_zgloszenia, `${path}.data_zgloszenia`),
      data_rozwiazania: nullableDatabaseTemporalToString(
        row.data_rozwiazania,
        `${path}.data_rozwiazania`,
      ),
      zdjecie_incydentu_zglaszanego: Object.hasOwn(row, 'zdjecie_incydentu_zglaszanego')
        ? row.zdjecie_incydentu_zglaszanego
        : null,
      zdjecie_incydentu_rozwiazanego: Object.hasOwn(row, 'zdjecie_incydentu_rozwiazanego')
        ? row.zdjecie_incydentu_rozwiazanego
        : null,
    },
    path,
  );
}

export function parseServiceStatisticRow(
  value: unknown,
  path: string,
): ServiceIncidentStatisticsItem {
  const row = expectRecord(value, path);
  const status = row.status_incydentu;
  if (!isIncidentStatus(status)) {
    throw new Error(`Invalid database record at ${path}.status_incydentu`);
  }
  return {
    status_incydentu: status,
    liczba: expectInteger(row.liczba, `${path}.liczba`),
  };
}

export function parseAdminStatisticRow(value: unknown, path: string): AdminIncidentStatisticsItem {
  return {
    ...parseServiceStatisticRow(value, path),
    typ_sluzby: expectString(expectRecord(value, path).typ_sluzby, `${path}.typ_sluzby`),
  };
}

export function parseUserIdRow(value: unknown, path: string): string {
  return expectString(expectRecord(value, path).id, `${path}.id`);
}

export function parseUpdatedUserPermissionsRow(
  value: unknown,
  path: string,
): UpdatedUserPermissions {
  const row = expectRecord(value, path);
  const rawServiceKey = row.serviceKey;
  if (rawServiceKey !== null && typeof rawServiceKey !== 'string') {
    throw new Error(`Invalid database record at ${path}.serviceKey`);
  }
  return {
    id_uzytkownika: expectString(row.id_uzytkownika, `${path}.id_uzytkownika`),
    uprawnienia: expectUserRole(row.uprawnienia, `${path}.uprawnienia`),
    serviceKey: rawServiceKey,
  };
}
