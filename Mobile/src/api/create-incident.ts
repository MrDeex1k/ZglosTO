import {
  parseCurrentCreateIncidentResponse,
  type CurrentCreateIncidentRequest,
  type CurrentCreateIncidentResponse,
} from '@zglosto/contracts';

import type { ApiClient } from './client';

export const CREATE_INCIDENT_PATH = '/api/mieszkaniec/incydenty';

interface CreateIncidentOptions {
  client: ApiClient;
  idempotencyKey: string;
  request: CurrentCreateIncidentRequest;
  signal?: AbortSignal;
}

export function createIncident({
  client,
  idempotencyKey,
  request,
  signal,
}: CreateIncidentOptions): Promise<CurrentCreateIncidentResponse> {
  return client.requestJson(CREATE_INCIDENT_PATH, {
    body: request,
    headers: { 'Idempotency-Key': idempotencyKey },
    method: 'POST',
    parser: parseCurrentCreateIncidentResponse,
    ...(signal === undefined ? {} : { signal }),
  });
}
