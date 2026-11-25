import {
  formatIncidentRevisionEtag,
  parseCurrentCreateIncidentResponse,
  parseCurrentIncidentList,
  parseCurrentResolvedIncidents,
  parseServiceIncidentList,
  ServiceIncidentMutationResponseSchema,
  UpdateUserPermissionsRequestSchema,
  InitiateImageUploadResponseSchema,
  type CurrentCreateIncidentRequest,
  type CurrentCreateIncidentResponse,
  type CurrentIncidentListItemDto,
  type CurrentResolvedIncidentDto,
  type IncidentStatusCode,
  type InitiateImageUploadRequest,
  type UpdateIncidentServiceRequest,
  type UpdateIncidentStatusRequest,
  type UpdateIncidentVerificationRequest,
  type ServiceIncidentListItemDto,
  type UploadResolvedImageRequest,
  type UserRole,
} from '@zglosto/contracts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP error! status: ${status}`);
    this.status = status;
  }
}

async function ensureSuccessfulResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw new ApiResponseError(response.status);
  }
}

async function readJson(response: Response): Promise<unknown> {
  await ensureSuccessfulResponse(response);
  const payload: unknown = await response.json();
  return payload;
}

function requestMutation(
  url: string,
  method: 'PATCH' | 'POST',
  body: object,
  revision?: number,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(revision === undefined ? {} : { 'If-Match': formatIncidentRevisionEtag(revision) }),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

async function sendMutation(url: string, method: 'PATCH' | 'POST', body: object): Promise<void> {
  await ensureSuccessfulResponse(await requestMutation(url, method, body));
}

async function imageUploadContract(file: File): Promise<InitiateImageUploadRequest> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const checksumSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    checksumSha256,
    mimeType: file.type as InitiateImageUploadRequest['mimeType'],
    sizeBytes: file.size,
  };
}

async function uploadWithPresignedUrl(endpoint: string, file: File): Promise<string> {
  const contractResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(await imageUploadContract(file)),
  });
  const contract = InitiateImageUploadResponseSchema.parse(await readJson(contractResponse));
  const uploadResponse = await fetch(contract.uploadUrl, {
    method: contract.method,
    headers: contract.headers,
    body: file,
  });
  await ensureSuccessfulResponse(uploadResponse);
  return contract.uploadId;
}

export function uploadReportImage(file: File): Promise<string> {
  return uploadWithPresignedUrl(`${API_BASE_URL}/mieszkaniec/obrazy/uploads`, file);
}

export async function fetchResolvedIncidents(
  signal?: AbortSignal,
): Promise<CurrentResolvedIncidentDto[]> {
  const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty/glowna`, {
    signal: signal ?? null,
  });
  return parseCurrentResolvedIncidents(await readJson(response));
}

export async function fetchAllIncidents(
  signal?: AbortSignal,
): Promise<CurrentIncidentListItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/admin/incydenty`, {
    signal: signal ?? null,
    credentials: 'include',
  });
  return parseCurrentIncidentList(await readJson(response));
}

export async function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatusCode,
): Promise<void> {
  const body: UpdateIncidentStatusRequest = { status_incydentu: status };
  await sendMutation(`${API_BASE_URL}/admin/incydenty/${incidentId}/status`, 'PATCH', body);
}

export async function updateIncidentVerification(
  incidentId: string,
  checked: boolean,
): Promise<void> {
  const body: UpdateIncidentVerificationRequest = { sprawdzenie_incydentu: checked };
  await sendMutation(`${API_BASE_URL}/admin/incydenty/${incidentId}/sprawdzenie`, 'PATCH', body);
}

export async function updateIncidentService(incidentId: string, serviceKey: string): Promise<void> {
  const body: UpdateIncidentServiceRequest = { typ_sluzby: serviceKey };
  await sendMutation(`${API_BASE_URL}/admin/incydenty/${incidentId}/typ`, 'PATCH', body);
}

export async function updateUserPermissions(
  email: string,
  permissions: UserRole,
  serviceKey: string | null,
): Promise<void> {
  const body = UpdateUserPermissionsRequestSchema.parse({
    email,
    uprawnienia: permissions,
    serviceKey,
  });
  await sendMutation(`${API_BASE_URL}/admin/uzytkownicy/service-key`, 'PATCH', body);
}

export async function fetchServiceIncidents(
  signal?: AbortSignal,
): Promise<ServiceIncidentListItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/sluzby/incydenty`, {
    signal: signal ?? null,
    credentials: 'include',
  });
  return parseServiceIncidentList(await readJson(response));
}

async function patchServiceIncident(path: string, body: object, revision: number): Promise<number> {
  const response = await requestMutation(
    `${API_BASE_URL}/sluzby/incydenty/${path}`,
    'PATCH',
    body,
    revision,
  );
  return ServiceIncidentMutationResponseSchema.parse(await readJson(response)).revision;
}

export function updateIncidentStatusService(
  incidentId: string,
  status: IncidentStatusCode,
  revision: number,
): Promise<number> {
  const body: UpdateIncidentStatusRequest = { status_incydentu: status };
  return patchServiceIncident(`${incidentId}/status`, body, revision);
}

export function updateIncidentVerificationService(
  incidentId: string,
  checked: boolean,
  revision: number,
): Promise<number> {
  const body: UpdateIncidentVerificationRequest = { sprawdzenie_incydentu: checked };
  return patchServiceIncident(`${incidentId}/sprawdzenie`, body, revision);
}

export function stageResolvedImageService(incidentId: string, file: File): Promise<string> {
  return uploadWithPresignedUrl(
    `${API_BASE_URL}/sluzby/incydenty/${incidentId}/obrazy/uploads`,
    file,
  );
}

export async function attachResolvedImageService(
  incidentId: string,
  uploadId: string,
): Promise<void> {
  const body: UploadResolvedImageRequest = { uploadId };
  await sendMutation(
    `${API_BASE_URL}/sluzby/incydenty/${incidentId}/zdjecie_rozwiazane`,
    'POST',
    body,
  );
}

export async function fetchUserIncidents(
  signal?: AbortSignal,
): Promise<CurrentIncidentListItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty`, {
    signal: signal ?? null,
    credentials: 'include',
  });
  return parseCurrentIncidentList(await readJson(response));
}

export async function createIncident(
  incidentData: CurrentCreateIncidentRequest,
): Promise<CurrentCreateIncidentResponse> {
  const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(incidentData),
  });
  return parseCurrentCreateIncidentResponse(await readJson(response));
}
