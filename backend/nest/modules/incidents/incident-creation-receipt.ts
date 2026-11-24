import { createHash } from 'node:crypto';
import {
  expectRecord,
  parseCurrentCreateIncidentResponse,
  type CurrentCreateIncidentResponse,
} from '@zglosto/contracts';
import type { DatabaseClient } from '../../../types.ts';
import { conflict } from '../../application-error.ts';
import type { CreateIncidentCommand } from './incident-domain.port.ts';

type ReceiptIdentity = [scope: string, key: string, fingerprint: string];

function hash(values: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export function incidentCreationReceiptIdentity(
  command: CreateIncidentCommand,
): ReceiptIdentity | null {
  if (command.idempotencyKey === undefined) return null;
  return [
    hash(
      command.reporterUserId === null
        ? ['anonymous', command.reporterEmail]
        : ['resident', command.reporterUserId],
    ),
    command.idempotencyKey,
    hash([
      command.address,
      command.description,
      command.imageUploadId,
      command.latitude,
      command.longitude,
      command.reporterEmail,
      command.requestedServiceKey,
    ]),
  ];
}

export async function readIncidentCreationReceipt(
  client: DatabaseClient,
  [scope, key, fingerprint]: ReceiptIdentity,
): Promise<CurrentCreateIncidentResponse | null> {
  const { rows } = await client.query(
    'SELECT fingerprint, response FROM incident_creation_receipts WHERE scope = $1 AND key = $2',
    [scope, key],
  );
  if (rows.length === 0) return null;
  const receipt = expectRecord(rows[0], 'incidentCreationReceipt');
  if (receipt.fingerprint !== fingerprint) {
    throw conflict('Idempotency-Key was already used with a different incident request');
  }
  return parseCurrentCreateIncidentResponse(receipt.response);
}

// Use the same transaction client for this reservation, the incident, its media, and the receipt.
export async function createWithIncidentReceipt(
  client: DatabaseClient,
  identity: ReceiptIdentity,
  create: () => Promise<CurrentCreateIncidentResponse>,
): Promise<CurrentCreateIncidentResponse> {
  const { rowCount } = await client.query(
    `INSERT INTO incident_creation_receipts (scope, key, fingerprint)
     VALUES ($1, $2, $3) ON CONFLICT (scope, key) DO NOTHING`,
    identity,
  );
  if (rowCount === 0) {
    const replay = await readIncidentCreationReceipt(client, identity);
    if (replay === null) throw new Error('Incident creation receipt disappeared');
    return replay;
  }

  const response = await create();
  const [scope, key] = identity;
  await client.query(
    `UPDATE incident_creation_receipts SET incident_id = $3, response = $4::jsonb
     WHERE scope = $1 AND key = $2`,
    [scope, key, response.incydent.id_zgloszenia, JSON.stringify(response)],
  );
  return response;
}
