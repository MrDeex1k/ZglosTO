import {
  CurrentResolvedIncidentSchema,
  parseCurrentResolvedIncidents,
  type CurrentResolvedIncidentDto,
} from '@zglosto/contracts';

import type { ApiClient } from './client';
import { ApiError } from './errors';

export const PUBLIC_INCIDENTS_PATH = '/api/mieszkaniec/incydenty/glowna';

interface LoadPublicIncidentsOptions {
  client: ApiClient;
  signal?: AbortSignal;
}

export function loadPublicIncidents({
  client,
  signal,
}: LoadPublicIncidentsOptions): Promise<CurrentResolvedIncidentDto[]> {
  return client.requestJson(PUBLIC_INCIDENTS_PATH, {
    method: 'GET',
    parser: parseCurrentResolvedIncidents,
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function loadPublicIncident({
  client,
  incidentId,
  signal,
}: LoadPublicIncidentsOptions & {
  incidentId: string;
}): Promise<CurrentResolvedIncidentDto | null> {
  try {
    return await client.requestJson(`${PUBLIC_INCIDENTS_PATH}/${encodeURIComponent(incidentId)}`, {
      method: 'GET',
      parser: (value) => CurrentResolvedIncidentSchema.parse(value),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
