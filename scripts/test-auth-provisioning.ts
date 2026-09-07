import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const name = `zglosto-provisioning-test-${randomUUID()}`;
const docker = (args: string[], input?: string) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    input,
    timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const sql = (input: string) =>
  docker(
    ['exec', '-i', name, 'psql', '-XAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    input,
  ).trim();
const migration = readFileSync(
  resolve(root, 'database/migrations/015-atomic-user-provisioning.sql'),
  'utf8',
);
const createUser = (id: string) =>
  `INSERT INTO public."user" (id,email) VALUES ('${id}','${id}@example.com');`;
let started = false;
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--network',
    'none',
    '--tmpfs',
    '/var/lib/postgresql',
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '--mount',
    `type=bind,src=${root}/database/migrations,dst=/opt/zglosto/migrations,readonly`,
    'postgres:18.6-alpine3.24',
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], {
        timeout: 5000,
        stdio: 'ignore',
      }).status === 0
    ) {
      ready = true;
      break;
    }
    // Readiness attempts must be sequential to observe PostgreSQL startup.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await setTimeout(500);
  }
  assert.ok(ready, 'temporary PostgreSQL did not become ready');
  for (const file of ['02-create-auth.sql', '03-create-dbtables.sql']) {
    sql(readFileSync(resolve(root, 'database/init-scripts', file), 'utf8'));
  }
  sql(`${createUser('missing')} ${createUser('admin')} ${createUser('service')}
    INSERT INTO uzytkownicy (id_uzytkownika,uprawnienia,service_key) VALUES
    ('admin','admin',NULL), ('service','sluzby','roads');`);
  sql(migration);
  sql(migration);
  assert.equal(
    sql(
      "SELECT id_uzytkownika || ':' || uprawnienia || ':' || COALESCE(service_key,'-') FROM uzytkownicy ORDER BY id_uzytkownika",
    ),
    'admin:admin:-\nmissing:mieszkaniec:-\nservice:sluzby:roads',
  );
  sql(`CREATE FUNCTION fail_test_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected role failure'; END; $$;
    CREATE TRIGGER test_fail_role BEFORE INSERT ON uzytkownicy FOR EACH ROW EXECUTE FUNCTION fail_test_role();`);
  assert.throws(() => sql(createUser('retry')), /injected role failure/u);
  assert.equal(sql('SELECT count(*) FROM public."user" WHERE id=\'retry\''), '0');
  sql('DROP TRIGGER test_fail_role ON uzytkownicy;');
  sql(createUser('retry'));
  assert.equal(
    sql(
      "SELECT count(*) FROM uzytkownicy WHERE id_uzytkownika='retry' AND uprawnienia='mieszkaniec'",
    ),
    '1',
  );
  sql(`BEGIN; ${createUser('rollback')} ROLLBACK;`);
  assert.equal(sql('SELECT count(*) FROM public."user" WHERE id=\'rollback\''), '0');
  assert.equal(sql("SELECT count(*) FROM uzytkownicy WHERE id_uzytkownika='rollback'"), '0');
  sql('DELETE FROM public."user" WHERE id=\'retry\';');
  assert.equal(sql("SELECT count(*) FROM uzytkownicy WHERE id_uzytkownika='retry'"), '0');
  // Exercise the actual fresh-install entrypoint too, independently of migrated tables.
  sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const file of ['02-create-auth.sql', '03-create-dbtables.sql', '05-user-provisioning.sql']) {
    sql(readFileSync(resolve(root, 'database/init-scripts', file), 'utf8'));
  }
  sql(createUser('fresh'));
  assert.equal(
    sql("SELECT uprawnienia FROM uzytkownicy WHERE id_uzytkownika='fresh'"),
    'mieszkaniec',
  );
  console.log(
    'PostgreSQL provisioning passed: backfill, preserved permissions, idempotence, failed insert/retry, rollback, cascade and fresh install.',
  );
} finally {
  if (started) docker(['rm', '--force', name]);
}
