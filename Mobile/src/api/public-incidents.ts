import { parseCurrentResolvedIncidents, type CurrentResolvedIncidentDto } from '@zglosto/contracts';

import type { ApiClient } from './client';

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
