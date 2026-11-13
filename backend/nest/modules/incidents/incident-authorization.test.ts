import { expect, test, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.ts';
import type { IncidentMediaService } from '../media/incident-media.service.ts';
import type { ServiceCatalogSynchronizer } from './service-catalog-synchronizer.ts';
import { PostgresIncidentAdapter } from './postgres-incident.adapter.ts';
import { claimVerifiedAnonymousIncidents } from '../../../lib/reporter-identity.ts';

function setup() {
  const query = vi.fn(async (_sql: string, _parameters?: readonly unknown[]) => ({
    rows: [],
    rowCount: 0,
  }));
  const adapter = new PostgresIncidentAdapter(
    { query } as unknown as DatabaseService,
    {} as IncidentMediaService,
    { classify: vi.fn() },
    { ensureSynchronized: async () => {} } as unknown as ServiceCatalogSynchronizer,
  );
  return { adapter, query };
}

test('resident listing binds the verified user id rather than interpolating SQL', async () => {
  const { adapter, query } = setup();
  const userId = "resident' OR TRUE --";
  await adapter.listResidentIncidents(userId);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE i.reporter_user_id = $1'), [
    userId,
  ]);
  expect(query.mock.calls[0]?.[0]).not.toContain(userId);
});

test('service status, verification and transfer keep ownership and revision in the UPDATE predicate', async () => {
  const { adapter, query } = setup();
  const serviceKey = "other' OR TRUE --";
  const results = [
    await adapter.updateServiceIncidentStatus('foreign-incident', serviceKey, 'resolved', 7),
    await adapter.updateServiceIncidentVerification('foreign-incident', serviceKey, true, 7),
    await adapter.updateServiceIncidentService('foreign-incident', serviceKey, 'roads', 7),
  ];
  expect(results).toEqual(Array.from({ length: 3 }, () => ({ kind: 'not-found' })));
  const mutations = query.mock.calls.filter(([sql]) => sql.includes('UPDATE incydenty'));
  expect(mutations).toHaveLength(3);
  for (const [sql, parameters] of mutations) {
    expect(sql).toContain('WHERE id_zgloszenia = $2 AND service_key = $3 AND revision = $4');
    expect(parameters?.slice(1)).toEqual(['foreign-incident', serviceKey, 7]);
    expect(sql).not.toContain(serviceKey);
  }
});

test('claiming anonymous reports requires database-verified email and never steals an existing owner', async () => {
  const { query } = setup();
  await claimVerifiedAnonymousIncidents({ query }, 'verified-user');
  const sql = query.mock.calls[0]?.[0];
  expect(sql).toContain('app_user.id = $1');
  expect(sql).toContain('app_user.email_verified = TRUE');
  expect(sql).toContain('incident.reporter_user_id IS NULL');
  expect(sql).toContain('incident.mail_zglaszajacego = LOWER(BTRIM(app_user.email))');
  expect(query.mock.calls[0]?.[1]).toEqual(['verified-user']);
});
