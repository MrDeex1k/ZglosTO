import {
  ContractValidationError,
  expectArray,
  expectBoolean,
  expectInteger,
  expectNullableNumber,
  expectNullableString,
  expectRecord,
  expectString,
} from './common.js';
import {
  type CurrentLlmClassificationResult,
  LLM_CLASSIFICATIONS,
  LLM_CLASSIFICATION_SOURCES,
  LLM_FALLBACK_REASONS,
  type LlmClassification,
  type LlmClassificationSource,
  type LlmFallbackReason,
  CurrentLlmClassificationResultSchema,
  parseCurrentLlmClassificationResult,
} from './llm.js';
import {
  IncidentImageRefSchema,
  parseNullableIncidentImageRef,
  type IncidentImageRef,
} from './images.js';
import { z } from 'zod';

export const INCIDENT_STATUSES = ['reported', 'in_progress', 'resolved'] as const;
export type IncidentStatusCode = (typeof INCIDENT_STATUSES)[number];

export function isIncidentStatus(value: unknown): value is IncidentStatusCode {
  return typeof value === 'string' && INCIDENT_STATUSES.some((status) => status === value);
}

export interface IncidentCoordinates {
  latitude: number | null;
  longitude: number | null;
}

export function parseIncidentCoordinates(
  latitudeValue: unknown,
  longitudeValue: unknown,
  path: string,
): IncidentCoordinates {
  const latitude = expectNullableNumber(latitudeValue, `${path}.latitude`);
  const longitude = expectNullableNumber(longitudeValue, `${path}.longitude`);

  if ((latitude === null) !== (longitude === null)) {
    throw new ContractValidationError(path, 'both coordinates or both null');
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    throw new ContractValidationError(`${path}.latitude`, 'number between -90 and 90');
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    throw new ContractValidationError(`${path}.longitude`, 'number between -180 and 180');
  }

  return { latitude, longitude };
}

function expectIncidentStatus(value: unknown, path: string): IncidentStatusCode {
  if (!isIncidentStatus(value)) {
    throw new ContractValidationError(path, INCIDENT_STATUSES.join(' | '));
  }
  return value;
}

function expectLlmClassification(value: unknown, path: string): LlmClassification {
  if (typeof value === 'string' && LLM_CLASSIFICATIONS.some((item) => item === value)) {
    return value as LlmClassification;
  }
  throw new ContractValidationError(path, LLM_CLASSIFICATIONS.join(' | '));
}

function expectLlmSource(value: unknown, path: string): LlmClassificationSource {
  if (typeof value === 'string' && LLM_CLASSIFICATION_SOURCES.some((item) => item === value)) {
    return value as LlmClassificationSource;
  }
  throw new ContractValidationError(path, LLM_CLASSIFICATION_SOURCES.join(' | '));
}

function expectLlmReason(value: unknown, path: string): LlmFallbackReason | null {
  if (value === null) return null;
  if (typeof value === 'string' && LLM_FALLBACK_REASONS.some((item) => item === value)) {
    return value as LlmFallbackReason;
  }
  throw new ContractValidationError(path, `${LLM_FALLBACK_REASONS.join(' | ')} | null`);
}

export interface CurrentResolvedIncidentDto {
  id_zgloszenia: string;
  opis_zgloszenia: string;
  adres_zgloszenia: string;
  latitude: number | null;
  longitude: number | null;
  typ_sluzby: string;
  status_incydentu: IncidentStatusCode;
  zdjecie_incydentu_rozwiazanego: IncidentImageRef | null;
  data_godzina_zgloszenia: string;
  data_godzina_rozwiazania: string;
}

export interface CurrentIncidentListItemDto {
  id_zgloszenia: string;
  opis_zgloszenia: string;
  mail_zglaszajacego: string;
  adres_zgloszenia: string;
  latitude: number | null;
  longitude: number | null;
  zdjecie_incydentu_zglaszanego: IncidentImageRef | null;
  zdjecie_incydentu_rozwiazanego: IncidentImageRef | null;
  sprawdzenie_incydentu: boolean;
  status_incydentu: IncidentStatusCode;
  typ_sluzby: string;
  llm_odpowiedz: string | null;
  llm_classification: LlmClassification;
  llm_model_available: boolean;
  llm_source: LlmClassificationSource;
  llm_reason: LlmFallbackReason | null;
  data_godzina_zgloszenia: string;
  data_godzina_rozwiazania: string | null;
}

export interface ServiceIncidentListItemDto extends CurrentIncidentListItemDto {
  revision: number;
}

const NullableLatitudeSchema = z.number().min(-90).max(90).nullable().default(null);
const NullableLongitudeSchema = z.number().min(-180).max(180).nullable().default(null);
const NullableNonEmptyStringSchema = z.string().trim().min(1).nullable().default(null);
const NullableUploadIdSchema = z.uuid().nullable().default(null);

export const CurrentCreateIncidentRequestSchema = z
  .object({
    opis_zgloszenia: z.string().trim().min(1),
    mail_zglaszajacego: z.string().trim().pipe(z.email()),
    adres_zgloszenia: z.string().trim().min(1),
    latitude: NullableLatitudeSchema,
    longitude: NullableLongitudeSchema,
    typ_sluzby: NullableNonEmptyStringSchema,
    zdjecie_incydentu_zglaszanego_upload_id: NullableUploadIdSchema,
  })
  .strict()
  .refine((request) => (request.latitude === null) === (request.longitude === null), {
    message: 'latitude and longitude must both be present or both be null',
    path: ['latitude'],
  });

export type CurrentCreateIncidentRequest = z.infer<typeof CurrentCreateIncidentRequestSchema>;

export interface CurrentDatabaseIncidentDto {
  id_zgloszenia: string;
  data_zgloszenia: string;
  godzina_zgloszenia: string;
  opis_zgloszenia: string;
  mail_zglaszajacego: string;
  reporter_user_id: string | null;
  adres_zgloszenia: string;
  latitude: number | null;
  longitude: number | null;
  zdjecie_incydentu_zglaszanego: IncidentImageRef | null;
  zdjecie_incydentu_rozwiazanego: IncidentImageRef | null;
  sprawdzenie_incydentu: boolean;
  status_incydentu: IncidentStatusCode;
  typ_sluzby: string;
  llm_odpowiedz: string | null;
  llm_classification: LlmClassification;
  llm_model_available: boolean;
  llm_source: LlmClassificationSource;
  llm_reason: LlmFallbackReason | null;
  data_rozwiazania: string | null;
  godzina_rozwiazania: string | null;
}

export interface CurrentCreateIncidentResponse {
  success: true;
  incydent: CurrentDatabaseIncidentDto;
  classification: CurrentLlmClassificationResult;
}

const IncidentStatusSchema = z.enum(INCIDENT_STATUSES);
const NullableCoordinatesSchema = {
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
};

export const CurrentDatabaseIncidentSchema = z
  .object({
    id_zgloszenia: z.string(),
    data_zgloszenia: z.string(),
    godzina_zgloszenia: z.string(),
    opis_zgloszenia: z.string(),
    mail_zglaszajacego: z.string(),
    reporter_user_id: z.string().nullable(),
    adres_zgloszenia: z.string(),
    ...NullableCoordinatesSchema,
    zdjecie_incydentu_zglaszanego: IncidentImageRefSchema.nullable(),
    zdjecie_incydentu_rozwiazanego: IncidentImageRefSchema.nullable(),
    sprawdzenie_incydentu: z.boolean(),
    status_incydentu: IncidentStatusSchema,
    typ_sluzby: z.string(),
    llm_odpowiedz: z.string().nullable(),
    llm_classification: z.enum(LLM_CLASSIFICATIONS),
    llm_model_available: z.boolean(),
    llm_source: z.enum(LLM_CLASSIFICATION_SOURCES),
    llm_reason: z.enum(LLM_FALLBACK_REASONS).nullable(),
    data_rozwiazania: z.string().nullable(),
    godzina_rozwiazania: z.string().nullable(),
  })
  .strict();

export const CurrentIncidentListItemSchema = z
  .object({
    id_zgloszenia: z.string(),
    opis_zgloszenia: z.string(),
    mail_zglaszajacego: z.string(),
    adres_zgloszenia: z.string(),
    ...NullableCoordinatesSchema,
    zdjecie_incydentu_zglaszanego: IncidentImageRefSchema.nullable(),
    zdjecie_incydentu_rozwiazanego: IncidentImageRefSchema.nullable(),
    sprawdzenie_incydentu: z.boolean(),
    status_incydentu: IncidentStatusSchema,
    typ_sluzby: z.string(),
    llm_odpowiedz: z.string().nullable(),
    llm_classification: z.enum(LLM_CLASSIFICATIONS),
    llm_model_available: z.boolean(),
    llm_source: z.enum(LLM_CLASSIFICATION_SOURCES),
    llm_reason: z.enum(LLM_FALLBACK_REASONS).nullable(),
    data_godzina_zgloszenia: z.string(),
    data_godzina_rozwiazania: z.string().nullable(),
  })
  .strict();

export const ServiceIncidentListItemSchema = CurrentIncidentListItemSchema.extend({
  revision: z.number().int().positive(),
}).strict();

export const CurrentResolvedIncidentSchema = z
  .object({
    id_zgloszenia: z.string(),
    opis_zgloszenia: z.string(),
    adres_zgloszenia: z.string(),
    ...NullableCoordinatesSchema,
    typ_sluzby: z.string(),
    status_incydentu: IncidentStatusSchema,
    zdjecie_incydentu_rozwiazanego: IncidentImageRefSchema.nullable(),
    data_godzina_zgloszenia: z.string(),
    data_godzina_rozwiazania: z.string(),
  })
  .strict();

export const CurrentCreateIncidentResponseSchema = z
  .object({
    success: z.literal(true),
    incydent: CurrentDatabaseIncidentSchema,
    classification: CurrentLlmClassificationResultSchema,
  })
  .strict();

export const IncidentMutationResponseSchema = z
  .object({ success: z.literal(true), incydent: CurrentDatabaseIncidentSchema })
  .strict();

export const ServiceIncidentMutationResponseSchema = IncidentMutationResponseSchema.extend({
  revision: z.number().int().positive(),
}).strict();

const INCIDENT_REVISION_ETAG_PATTERN = /^"incident-([1-9][0-9]*)"$/;

export function formatIncidentRevisionEtag(revision: number): string {
  const parsed = z.number().int().positive().parse(revision);
  return `"incident-${parsed}"`;
}

export function parseIncidentRevisionEtag(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = INCIDENT_REVISION_ETAG_PATTERN.exec(value.trim());
  if (match === null) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

export interface CreateIncidentRequest {
  description: string;
  reporterEmail: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  requestedServiceKey: string | null;
  imageUploadId: string | null;
}

export interface ResidentIncidentIdentity {
  reporterEmail: string;
  reporterUserId: string | null;
}

export const IncidentIdParamsSchema = z.object({ id: z.string().trim().min(1) }).strict();

export const UpdateIncidentStatusRequestSchema = z
  .object({ status_incydentu: z.enum(INCIDENT_STATUSES) })
  .strict();

export const UpdateIncidentVerificationRequestSchema = z
  .object({ sprawdzenie_incydentu: z.boolean() })
  .strict();

export const UpdateIncidentServiceRequestSchema = z
  .object({ typ_sluzby: z.string().trim().min(1) })
  .strict();

export const UploadResolvedImageRequestSchema = z.object({ uploadId: z.uuid() }).strict();

export type IncidentIdParams = z.infer<typeof IncidentIdParamsSchema>;
export type UpdateIncidentStatusRequest = z.infer<typeof UpdateIncidentStatusRequestSchema>;
export type UpdateIncidentVerificationRequest = z.infer<
  typeof UpdateIncidentVerificationRequestSchema
>;
export type UpdateIncidentServiceRequest = z.infer<typeof UpdateIncidentServiceRequestSchema>;
export type UploadResolvedImageRequest = z.infer<typeof UploadResolvedImageRequestSchema>;

export function parseCurrentResolvedIncident(
  value: unknown,
  path: string,
): CurrentResolvedIncidentDto {
  const record = expectRecord(value, path);
  const coordinates = parseIncidentCoordinates(record.latitude, record.longitude, path);
  return {
    id_zgloszenia: expectString(record.id_zgloszenia, `${path}.id_zgloszenia`),
    opis_zgloszenia: expectString(record.opis_zgloszenia, `${path}.opis_zgloszenia`),
    adres_zgloszenia: expectString(record.adres_zgloszenia, `${path}.adres_zgloszenia`),
    ...coordinates,
    typ_sluzby: expectString(record.typ_sluzby, `${path}.typ_sluzby`),
    status_incydentu: expectIncidentStatus(record.status_incydentu, `${path}.status_incydentu`),
    zdjecie_incydentu_rozwiazanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_rozwiazanego,
      `${path}.zdjecie_incydentu_rozwiazanego`,
    ),
    data_godzina_zgloszenia: expectString(
      record.data_godzina_zgloszenia,
      `${path}.data_godzina_zgloszenia`,
    ),
    data_godzina_rozwiazania: expectString(
      record.data_godzina_rozwiazania,
      `${path}.data_godzina_rozwiazania`,
    ),
  };
}

export function parseCurrentIncidentListItem(
  value: unknown,
  path: string,
): CurrentIncidentListItemDto {
  const record = expectRecord(value, path);
  const coordinates = parseIncidentCoordinates(record.latitude, record.longitude, path);
  return {
    id_zgloszenia: expectString(record.id_zgloszenia, `${path}.id_zgloszenia`),
    opis_zgloszenia: expectString(record.opis_zgloszenia, `${path}.opis_zgloszenia`),
    mail_zglaszajacego: expectString(record.mail_zglaszajacego, `${path}.mail_zglaszajacego`),
    adres_zgloszenia: expectString(record.adres_zgloszenia, `${path}.adres_zgloszenia`),
    ...coordinates,
    zdjecie_incydentu_zglaszanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_zglaszanego,
      `${path}.zdjecie_incydentu_zglaszanego`,
    ),
    zdjecie_incydentu_rozwiazanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_rozwiazanego,
      `${path}.zdjecie_incydentu_rozwiazanego`,
    ),
    sprawdzenie_incydentu: expectBoolean(
      record.sprawdzenie_incydentu,
      `${path}.sprawdzenie_incydentu`,
    ),
    status_incydentu: expectIncidentStatus(record.status_incydentu, `${path}.status_incydentu`),
    typ_sluzby: expectString(record.typ_sluzby, `${path}.typ_sluzby`),
    llm_odpowiedz: expectNullableString(record.llm_odpowiedz, `${path}.llm_odpowiedz`),
    llm_classification: expectLlmClassification(
      record.llm_classification,
      `${path}.llm_classification`,
    ),
    llm_model_available: expectBoolean(record.llm_model_available, `${path}.llm_model_available`),
    llm_source: expectLlmSource(record.llm_source, `${path}.llm_source`),
    llm_reason: expectLlmReason(record.llm_reason, `${path}.llm_reason`),
    data_godzina_zgloszenia: expectString(
      record.data_godzina_zgloszenia,
      `${path}.data_godzina_zgloszenia`,
    ),
    data_godzina_rozwiazania: expectNullableString(
      record.data_godzina_rozwiazania,
      `${path}.data_godzina_rozwiazania`,
    ),
  };
}

export function parseCurrentResolvedIncidents(value: unknown): CurrentResolvedIncidentDto[] {
  return expectArray(value, 'resolvedIncidents').map((item, index) =>
    parseCurrentResolvedIncident(item, `resolvedIncidents[${index}]`),
  );
}

export function parseCurrentIncidentList(value: unknown): CurrentIncidentListItemDto[] {
  return expectArray(value, 'incidents').map((item, index) =>
    parseCurrentIncidentListItem(item, `incidents[${index}]`),
  );
}

export function parseServiceIncidentList(value: unknown): ServiceIncidentListItemDto[] {
  return expectArray(value, 'serviceIncidents').map((item, index) => {
    const path = `serviceIncidents[${index}]`;
    const record = expectRecord(item, path);
    const revision = expectInteger(record.revision, `${path}.revision`);
    if (revision <= 0) {
      throw new ContractValidationError(`${path}.revision`, 'positive integer');
    }
    return Object.assign(parseCurrentIncidentListItem(record, path), { revision });
  });
}

export function parseCurrentCreateIncidentResponse(value: unknown): CurrentCreateIncidentResponse {
  const record = expectRecord(value, 'createIncidentResponse');
  if (record.success !== true) {
    throw new ContractValidationError('createIncidentResponse.success', 'true');
  }
  return {
    success: true,
    incydent: parseCurrentDatabaseIncident(record.incydent, 'createIncidentResponse.incydent'),
    classification: parseCurrentLlmClassificationResult(
      record.classification,
      'createIncidentResponse.classification',
    ),
  };
}

export function parseCurrentDatabaseIncident(
  value: unknown,
  path: string,
): CurrentDatabaseIncidentDto {
  const record = expectRecord(value, path);
  const coordinates = parseIncidentCoordinates(record.latitude, record.longitude, path);
  return {
    id_zgloszenia: expectString(record.id_zgloszenia, `${path}.id_zgloszenia`),
    data_zgloszenia: expectString(record.data_zgloszenia, `${path}.data_zgloszenia`),
    godzina_zgloszenia: expectString(record.godzina_zgloszenia, `${path}.godzina_zgloszenia`),
    opis_zgloszenia: expectString(record.opis_zgloszenia, `${path}.opis_zgloszenia`),
    mail_zglaszajacego: expectString(record.mail_zglaszajacego, `${path}.mail_zglaszajacego`),
    reporter_user_id: expectNullableString(record.reporter_user_id, `${path}.reporter_user_id`),
    adres_zgloszenia: expectString(record.adres_zgloszenia, `${path}.adres_zgloszenia`),
    ...coordinates,
    zdjecie_incydentu_zglaszanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_zglaszanego,
      `${path}.zdjecie_incydentu_zglaszanego`,
    ),
    zdjecie_incydentu_rozwiazanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_rozwiazanego,
      `${path}.zdjecie_incydentu_rozwiazanego`,
    ),
    sprawdzenie_incydentu: expectBoolean(
      record.sprawdzenie_incydentu,
      `${path}.sprawdzenie_incydentu`,
    ),
    status_incydentu: expectIncidentStatus(record.status_incydentu, `${path}.status_incydentu`),
    typ_sluzby: expectString(record.typ_sluzby, `${path}.typ_sluzby`),
    llm_odpowiedz: expectNullableString(record.llm_odpowiedz, `${path}.llm_odpowiedz`),
    llm_classification: expectLlmClassification(
      record.llm_classification,
      `${path}.llm_classification`,
    ),
    llm_model_available: expectBoolean(record.llm_model_available, `${path}.llm_model_available`),
    llm_source: expectLlmSource(record.llm_source, `${path}.llm_source`),
    llm_reason: expectLlmReason(record.llm_reason, `${path}.llm_reason`),
    data_rozwiazania: expectNullableString(record.data_rozwiazania, `${path}.data_rozwiazania`),
    godzina_rozwiazania: expectNullableString(
      record.godzina_rozwiazania,
      `${path}.godzina_rozwiazania`,
    ),
  };
}
