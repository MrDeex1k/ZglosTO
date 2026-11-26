import type { IncidentListQuery, IncidentPage } from '@zglosto/contracts';
import { z } from 'zod';
import { badRequest } from '../../application-error.ts';

const IncidentCursorSchema = z.tuple([
  z.iso.date().refine((date) => !date.startsWith('0000-')),
  z.union([z.iso.time(), z.literal('24:00:00')]),
  z.guid(),
]);

type IncidentCursor = z.infer<typeof IncidentCursorSchema>;

export interface IncidentPageRequest {
  limit: number;
  after: IncidentCursor | null;
  status?: IncidentListQuery['status'];
  serviceKey?: IncidentListQuery['serviceKey'];
}

export function incidentPageRequest(query: IncidentListQuery): IncidentPageRequest | null {
  if (
    query.limit == null &&
    query.cursor == null &&
    query.status == null &&
    query.serviceKey == null
  )
    return null;
  return {
    limit: query.limit ?? 50,
    after: query.cursor == null ? null : decodeCursor(query.cursor),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.serviceKey === undefined ? {} : { serviceKey: query.serviceKey }),
  };
}

function decodeCursor(token: string): IncidentCursor {
  try {
    return IncidentCursorSchema.parse(JSON.parse(Buffer.from(token, 'base64url').toString('utf8')));
  } catch {
    throw badRequest('Invalid incident cursor');
  }
}

export function incidentPage<Item>(
  request: IncidentPageRequest,
  rows: readonly unknown[],
  parseItem: (row: unknown, path: string) => Item,
): IncidentPage<Item> {
  const items = rows
    .slice(0, request.limit)
    .map((row, index) => parseItem(row, `incidents[${index}]`));
  if (rows.length <= request.limit) return { items, nextCursor: null };

  const row = z
    .object({
      cursor_date: z.string(),
      cursor_time: z.string(),
      id_zgloszenia: z.string(),
    })
    .parse(rows[request.limit - 1]);
  const cursor = IncidentCursorSchema.parse([row.cursor_date, row.cursor_time, row.id_zgloszenia]);
  return { items, nextCursor: Buffer.from(JSON.stringify(cursor)).toString('base64url') };
}
