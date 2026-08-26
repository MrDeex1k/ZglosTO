import {
  IncidentMutationResponseSchema,
  ServiceIncidentMutationResponseSchema,
  InitiateImageUploadResponseSchema,
  parseServiceIncidentList,
  ServiceIncidentStatisticsItemSchema,
  UpdateIncidentStatusRequestSchema,
  UpdateIncidentVerificationRequestSchema,
  UploadResolvedImageRequestSchema,
  type CurrentDatabaseIncidentDto,
  type ServiceIncidentListItemDto,
  type IncidentStatusCode,
  type InitiateImageUploadRequest,
  type InitiateImageUploadResponse,
  type ServiceIncidentStatisticsItem,
  formatIncidentRevisionEtag,
} from '@zglosto/contracts';

import type { ApiClient } from './client';

export const SERVICE_INCIDENTS_PATH = '/api/sluzby/incydenty';
export const SERVICE_STATISTICS_PATH = '/api/sluzby/statystyki';

export interface IncidentMutationResult {
  success: true;
  incydent: CurrentDatabaseIncidentDto;
}

export interface VersionedIncidentMutationResult extends IncidentMutationResult {
  revision: number;
}

export function loadServiceIncidents({
  client,
  signal,
}: {
  client: ApiClient;
  signal?: AbortSignal;
}): Promise<ServiceIncidentListItemDto[]> {
  return client.requestJson(SERVICE_INCIDENTS_PATH, {
    method: 'GET',
    parser: parseServiceIncidentList,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function loadServiceStatistics({
  client,
  signal,
}: {
  client: ApiClient;
  signal?: AbortSignal;
}): Promise<ServiceIncidentStatisticsItem[]> {
  return client.requestJson(SERVICE_STATISTICS_PATH, {
    method: 'GET',
    parser: (value) => ServiceIncidentStatisticsItemSchema.array().parse(value),
    ...(signal === undefined ? {} : { signal }),
  });
}

export function updateServiceIncidentStatus({
  client,
  incidentId,
  revision,
  signal,
  status,
}: {
  client: ApiClient;
  incidentId: string;
  revision: number;
  signal?: AbortSignal;
  status: IncidentStatusCode;
}): Promise<VersionedIncidentMutationResult> {
  const body = UpdateIncidentStatusRequestSchema.parse({ status_incydentu: status });
  return client.requestJson(`${SERVICE_INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/status`, {
    body,
    method: 'PATCH',
    headers: { 'If-Match': formatIncidentRevisionEtag(revision) },
    parser: (value) => ServiceIncidentMutationResponseSchema.parse(value),
    ...(signal === undefined ? {} : { signal }),
  });
}

export function updateServiceIncidentVerification({
  client,
  incidentId,
  revision,
  signal,
  verified,
}: {
  client: ApiClient;
  incidentId: string;
  revision: number;
  signal?: AbortSignal;
  verified: boolean;
}): Promise<VersionedIncidentMutationResult> {
  const body = UpdateIncidentVerificationRequestSchema.parse({
    sprawdzenie_incydentu: verified,
  });
  return client.requestJson(
    `${SERVICE_INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/sprawdzenie`,
    {
      body,
      headers: { 'If-Match': formatIncidentRevisionEtag(revision) },
      method: 'PATCH',
      parser: (value) => ServiceIncidentMutationResponseSchema.parse(value),
      ...(signal === undefined ? {} : { signal }),
    },
  );
}

export function initiateServiceResolutionUpload({
  client,
  incidentId,
  request,
  signal,
}: {
  client: ApiClient;
  incidentId: string;
  request: InitiateImageUploadRequest;
  signal?: AbortSignal;
}): Promise<InitiateImageUploadResponse> {
  return client.requestJson(
    `${SERVICE_INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/obrazy/uploads`,
    {
      body: request,
      method: 'POST',
      parser: (value) => InitiateImageUploadResponseSchema.parse(value),
      ...(signal === undefined ? {} : { signal }),
    },
  );
}

export function attachServiceResolutionImage({
  client,
  incidentId,
  signal,
  uploadId,
}: {
  client: ApiClient;
  incidentId: string;
  signal?: AbortSignal;
  uploadId: string;
}): Promise<IncidentMutationResult> {
  const body = UploadResolvedImageRequestSchema.parse({ uploadId });
  return client.requestJson(
    `${SERVICE_INCIDENTS_PATH}/${encodeURIComponent(incidentId)}/zdjecie_rozwiazane`,
    {
      body,
      method: 'POST',
      parser: (value) => IncidentMutationResponseSchema.parse(value),
      ...(signal === undefined ? {} : { signal }),
    },
  );
}
