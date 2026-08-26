import {
  parseCurrentCreateIncidentResponse,
  parseCurrentIncidentList,
  parseCurrentResolvedIncidents,
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
  type UpdateUserPermissionsRequest,
  type UploadResolvedImageRequest,
  type UserRole,
} from '@zglosto/contracts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function ensureSuccessfulResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}

async function readJson(response: Response): Promise<unknown> {
  await ensureSuccessfulResponse(response);
  const payload: unknown = await response.json();
  return payload;
}

async function sendMutation(url: string, method: 'PATCH' | 'POST', body: object): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  await ensureSuccessfulResponse(response);
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

export async function fetchResolvedIncidents(): Promise<CurrentResolvedIncidentDto[]> {
  const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty/glowna`);
  return parseCurrentResolvedIncidents(await readJson(response));
}

export async function fetchAllIncidents(): Promise<CurrentIncidentListItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/admin/incydenty`, {
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
  const body: UpdateUserPermissionsRequest = {
    email,
    uprawnienia: permissions,
    serviceKey: permissions === 'sluzby' ? serviceKey : null,
  };
  await sendMutation(`${API_BASE_URL}/admin/uzytkownicy/service-key`, 'PATCH', body);
}

export async function fetchServiceIncidents(): Promise<CurrentIncidentListItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/sluzby/incydenty`, {
    credentials: 'include',
  });
  return parseCurrentIncidentList(await readJson(response));
}

export async function updateIncidentStatusService(
  incidentId: string,
  status: IncidentStatusCode,
): Promise<void> {
  const body: UpdateIncidentStatusRequest = { status_incydentu: status };
  await sendMutation(`${API_BASE_URL}/sluzby/incydenty/${incidentId}/status`, 'PATCH', body);
}

export async function updateIncidentVerificationService(
  incidentId: string,
  checked: boolean,
): Promise<void> {
  const body: UpdateIncidentVerificationRequest = { sprawdzenie_incydentu: checked };
  await sendMutation(`${API_BASE_URL}/sluzby/incydenty/${incidentId}/sprawdzenie`, 'PATCH', body);
}

export async function uploadResolvedImageService(incidentId: string, file: File): Promise<void> {
  const uploadId = await uploadWithPresignedUrl(
    `${API_BASE_URL}/sluzby/incydenty/${incidentId}/obrazy/uploads`,
    file,
  );
  const body: UploadResolvedImageRequest = { uploadId };
  await sendMutation(
    `${API_BASE_URL}/sluzby/incydenty/${incidentId}/zdjecie_rozwiazane`,
    'POST',
    body,
  );
}

export async function fetchUserIncidents(): Promise<CurrentIncidentListItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/mieszkaniec/incydenty`, {
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
