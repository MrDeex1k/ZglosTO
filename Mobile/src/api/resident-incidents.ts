import { parseCurrentIncidentList, type CurrentIncidentListItemDto } from '@zglosto/contracts';

import type { ApiClient } from './client';

export const RESIDENT_INCIDENTS_PATH = '/api/mieszkaniec/incydenty';

interface LoadResidentIncidentsOptions {
  client: ApiClient;
  signal?: AbortSignal;
}

export function loadResidentIncidents({
  client,
  signal,
}: LoadResidentIncidentsOptions): Promise<CurrentIncidentListItemDto[]> {
  return client.requestJson(RESIDENT_INCIDENTS_PATH, {
    method: 'GET',
    parser: parseCurrentIncidentList,
    ...(signal === undefined ? {} : { signal }),
  });
}
