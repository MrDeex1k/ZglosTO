import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const identity = `security-db-roles-${randomUUID()}`;
const pg = `${identity}-pg`;
const pool = `${identity}-pool`;
const temporary = mkdtempSync(join(tmpdir(), 'security-db-roles-'));
const passwords: Record<string, string> = {};
await Promise.all(
  ['auth', 'backend', 'media_worker'].map(async (role) => {
    passwords[`zglosto_${role}`] = (
      await Bun.file(`${root}/tests/fixtures/database/${role.replaceAll('_', '-')}-password`).text()
    ).trim();
  }),
);
passwords.zglosto_admin = 'fixture-only-administrator-password';
async function command(argv: string[], input?: string, env?: NodeJS.ProcessEnv, cwd?: string) {
  const child = Bun.spawn(argv, {
    ...(env ? { env } : {}),
    ...(cwd ? { cwd } : {}),
    stdin: input === undefined ? 'ignore' : new Blob([input]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout: stdout.trim(), stderr, code };
}
const docker = (args: string[], input?: string) => command(['docker', ...args], input);
async function must(args: string[], input?: string) {
  const result = await docker(args, input);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout;
}
function sql(user: string, query: string, viaPool = false, password = passwords[user]) {
  return docker(
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${password}`,
      '-e',
      'PGSSLMODE=verify-full',
      '-e',
      'PGSSLROOTCERT=/certs/server.crt',
      pg,
      'psql',
      '-X',
      '-h',
      viaPool ? 'pgbouncer' : 'database',
      '-p',
      viaPool ? '6432' : '5432',
      '-U',
      user,
      '-d',
      'zglosto_db',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    query,
  );
}
async function allowed(user: string, query: string, viaPool = true) {
  const result = await sql(user, query, viaPool);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout;
}
beforeAll(async () => {
  mkdirSync(`${temporary}/init`);
  for (const file of [
    '01-init.sql',
    '02-create-auth.sql',
    '03-create-dbtables.sql',
    '05-user-provisioning.sql',
    '06-runtime-roles.sh',
    'apply-runtime-roles.txt',
  ]) {
    copyFileSync(`${root}/database/init-scripts/${file}`, `${temporary}/init/${file}`);
  }
  mkdirSync(`${temporary}/certs`);
  const cert = await command([
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=database',
    '-addext',
    'subjectAltName=DNS:database,DNS:pgbouncer,IP:127.0.0.1',
    '-keyout',
    `${temporary}/certs/server.key`,
    '-out',
    `${temporary}/certs/server.crt`,
  ]);
  expect(cert.code).toBe(0);
  chmodSync(`${temporary}/certs/server.key`, 0o644);
  await must(['network', 'create', identity]);
  await must([
    'run',
    '-d',
    '--pull=never',
    '--name',
    pg,
    '--network',
    identity,
    '--network-alias',
    'database',
    '--tmpfs',
    '/var/lib/postgresql',
    '-e',
    'POSTGRES_USER=zglosto_admin',
    '-e',
    'POSTGRES_DB=zglosto_db',
    '-e',
    `POSTGRES_PASSWORD=${passwords.zglosto_admin}`,
    '-e',
    'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',
    '-v',
    `${temporary}/init:/docker-entrypoint-initdb.d:ro`,
    '-v',
    `${root}/database/migrations:/opt/zglosto/migrations:ro`,
    '-v',
    `${root}/tests/fixtures/database:/runtime-secrets:ro`,
    '-v',
    `${temporary}/certs:/certs:ro`,
    ...['AUTH', 'BACKEND', 'MEDIA_WORKER'].flatMap((role) => [
      '-e',
      `DATABASE_${role}_PASSWORD_FILE=/runtime-secrets/${role.toLowerCase().replaceAll('_', '-')}-password`,
    ]),
    'postgres:18.7-alpine3.24',
    'sh',
    '-ec',
    'cp /certs/server.key /tmp/server.key; chown postgres /tmp/server.key; chmod 600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/tmp/server.key -c ssl_min_protocol_version=TLSv1.3',
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Observe startup sequentially.
    const result = await sql('zglosto_backend', 'SELECT 1');
    if (result.code === 0) {
      ready = true;
      break;
    }
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(250);
  }
  if (!ready) {
    const logs = await docker(['logs', pg]);
    throw new Error(`PostgreSQL did not start: ${logs.stderr}`);
  }
  await allowed(
    'zglosto_admin',
    'CREATE FUNCTION public.fixture_backup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN NULL;END$$;',
    false,
  );
  await must([
    'run',
    '-d',
    '--pull=never',
    '--name',
    pool,
    '-p',
    '127.0.0.1::6432',
    '--network',
    identity,
    '--network-alias',
    'pgbouncer',
    '--user',
    '70:70',
    '--tmpfs',
    '/etc/pgbouncer:uid=70,gid=70,mode=0700',
    '--tmpfs',
    '/var/run/pgbouncer:uid=70,gid=70,mode=0700',
    '-v',
    `${root}/pgbouncer/start-pgbouncer.sh:/start-pool:ro`,
    '-v',
    `${root}/scripts/container-load-secrets.sh:/load-secrets:ro`,
    '-v',
    `${root}/tests/fixtures/database:/runtime-secrets:ro`,
    '-v',
    `${temporary}/certs:/certs:ro`,
    '-e',
    'POSTGRES_DB=zglosto_db',
    '-e',
    'POSTGRES_PORT=5432',
    '-e',
    'LISTEN_PORT=6432',
    '-e',
    'MAX_CLIENT_CONN=30',
    '-e',
    'DEFAULT_POOL_SIZE=3',
    '-e',
    'RESERVE_POOL_SIZE=1',
    '-e',
    'MAX_PREPARED_STATEMENTS=50',
    '-e',
    'DATABASE_TLS_CA_SOURCE_PATH=/certs/server.crt',
    '-e',
    'PGBOUNCER_TLS_CERT_PATH=/certs/server.crt',
    '-e',
    'PGBOUNCER_TLS_KEY_PATH=/certs/server.key',
    ...['AUTH', 'BACKEND', 'MEDIA_WORKER'].flatMap((role) => [
      '-e',
      `DATABASE_${role}_PASSWORD_FILE=/runtime-secrets/${role.toLowerCase().replaceAll('_', '-')}-password`,
    ]),
    '--entrypoint',
    '/bin/sh',
    'edoburu/pgbouncer:v1.26.1-p0',
    '/load-secrets',
    '/bin/sh',
    '/start-pool',
  ]);
  for (let attempt = 0; attempt < 40; attempt++) {
    // oxlint-disable-next-line no-await-in-loop
    if ((await sql('zglosto_backend', 'SELECT 1', true)).code === 0) return;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(250);
  }
  throw new Error('PgBouncer did not become ready');
}, 45_000);
afterAll(async () => {
  await docker(['rm', '-f', pool, pg]);
  await docker(['network', 'rm', identity]);
  rmSync(temporary, { recursive: true, force: true });
});

test('three SCRAM logins retain identity through PgBouncer and reject wrong/admin credentials', async () => {
  for (const user of ['zglosto_auth', 'zglosto_backend', 'zglosto_media_worker']) {
    // oxlint-disable-next-line no-await-in-loop
    expect(await allowed(user, 'SELECT current_user')).toBe(user);
    // oxlint-disable-next-line no-await-in-loop
    expect((await sql(user, 'SELECT 1', true, 'wrong-fixture-password')).code).not.toBe(0);
  }
  expect((await sql('zglosto_admin', 'SELECT 1', true)).code).not.toBe(0);
}, 20_000);

test('auth CRUD provisions only a resident atomically; backend and worker CRUD succeeds', async () => {
  expect(
    await allowed(
      'zglosto_auth',
      `INSERT INTO "user" (id,email) VALUES ('role-test','roles@example.test');
    INSERT INTO account (id,user_id,account_id,provider_id,password) VALUES ('account-test','role-test','role-test','credential','fixture-hash');
    INSERT INTO session (id,user_id,token,expires_at) VALUES ('session-test','role-test','fixture-token',now()+interval '1 hour');
    INSERT INTO verification (id,identifier,value,expires_at) VALUES ('verification-test','roles@example.test','fixture-code',now()+interval '1 hour');
    UPDATE "user" SET email_verified=true WHERE id='role-test';
    SELECT uprawnienia FROM uzytkownicy WHERE id_uzytkownika='role-test';`,
    ),
  ).toContain('mieszkaniec');
  expect(
    await allowed(
      'zglosto_backend',
      `INSERT INTO incydenty (id_zgloszenia,opis_zgloszenia,mail_zglaszajacego,adres_zgloszenia,service_key)
    VALUES ('019c0000-0000-7000-8000-000000000001','fixture','roles@example.test','fixture','roads');
    UPDATE incydenty SET reporter_user_id='role-test' WHERE id_zgloszenia='019c0000-0000-7000-8000-000000000001';
    SELECT email FROM "user" WHERE id='role-test';`,
    ),
  ).toContain('roles@example.test');
  await allowed(
    'zglosto_backend',
    `INSERT INTO incident_images (id,incident_id,kind,original_object_key,original_mime_type,original_size_bytes,original_checksum_sha256)
    VALUES ('019c0000-0000-7000-8000-000000000002','019c0000-0000-7000-8000-000000000001','report','staging/fixture','image/png',10,repeat('a',64));
    INSERT INTO media_processing_jobs (id,image_id,image_revision,incident_id,original_object_key)
    VALUES ('019c0000-0000-7000-8000-000000000003','019c0000-0000-7000-8000-000000000002',1,'019c0000-0000-7000-8000-000000000001','staging/fixture');`,
  );
  await allowed(
    'zglosto_media_worker',
    `BEGIN;
    SELECT id FROM incident_images FOR UPDATE;
    UPDATE incident_images SET status='processing';
    UPDATE media_processing_jobs SET status='processing';
    INSERT INTO consumed_messages VALUES ('fixture','019c0000-0000-7000-8000-000000000004','fixture',now());
    SELECT count(*) FROM image_uploads; DELETE FROM image_uploads WHERE false;
    COMMIT;`,
  );
  await allowed(
    'zglosto_backend',
    `DELETE FROM incydenty WHERE id_zgloszenia='019c0000-0000-7000-8000-000000000001';`,
  );
  await allowed(
    'zglosto_auth',
    `DELETE FROM verification WHERE id='verification-test'; DELETE FROM "user" WHERE id='role-test';`,
  );
});

test('all runtime roles deny OS commands, DDL, role changes, catalog secrets and cross-service auth tables', async () => {
  const attacks = [
    "COPY (SELECT 'fixture') TO PROGRAM 'true'",
    'CREATE TABLE public.forbidden(id int)',
    'CREATE TEMP TABLE forbidden(id int)',
    'CREATE ROLE forbidden_role LOGIN',
    'SELECT public.fixture_backup()',
    'SELECT * FROM pg_authid',
    'ALTER ROLE zglosto_backend SUPERUSER',
    'SET ROLE zglosto_admin',
    'DROP TABLE public.incydenty',
  ];
  for (const user of ['zglosto_auth', 'zglosto_backend', 'zglosto_media_worker']) {
    for (const query of attacks) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await sql(user, query, true);
      expect(result.code, `${user}: ${query}`).not.toBe(0);
    }
  }
  for (const user of ['zglosto_backend', 'zglosto_media_worker']) {
    for (const table of ['account', 'session', 'verification']) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await sql(user, `SELECT * FROM public.${table}`, true)).code).not.toBe(0);
    }
  }
  expect((await sql('zglosto_backend', 'SELECT * FROM public."user"', true)).code).not.toBe(0);
  expect(
    (await sql('zglosto_media_worker', 'SELECT email FROM public."user"', true)).code,
  ).not.toBe(0);
  expect((await sql('zglosto_auth', 'SELECT * FROM public.incident_images', true)).code).not.toBe(
    0,
  );
  const flags = await allowed(
    'zglosto_admin',
    `SELECT bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolreplication AND NOT rolinherit)
    FROM pg_roles WHERE rolname IN ('zglosto_auth','zglosto_backend','zglosto_media_worker');`,
    false,
  );
  expect(flags).toBe('t');
}, 30_000);

test('administrative reapplication is idempotent and removes dangerous role membership', async () => {
  await allowed('zglosto_admin', 'GRANT pg_read_all_data TO zglosto_media_worker;', false);
  const migration = await Bun.file(
    `${root}/database/migrations/016-runtime-role-grants.sql`,
  ).text();
  for (let i = 0; i < 2; i++) {
    // oxlint-disable-next-line no-await-in-loop
    await allowed('zglosto_admin', migration, false);
  }
  expect((await sql('zglosto_media_worker', 'SELECT * FROM session', true)).code).not.toBe(0);
  expect(
    await allowed(
      'zglosto_auth',
      `INSERT INTO "user" (id,email) VALUES ('reapply','reapply@example.test');
    SELECT uprawnienia FROM uzytkownicy WHERE id_uzytkownika='reapply'; DELETE FROM "user" WHERE id='reapply';`,
    ),
  ).toContain('mieszkaniec');
});

test('explicit existing-installation entrypoint refuses missing confirmation and safely reapplies', async () => {
  expect(
    (await docker(['exec', pg, 'sh', '/docker-entrypoint-initdb.d/apply-runtime-roles.txt'])).code,
  ).not.toBe(0);
  const direct = `postgresql://zglosto_admin:${passwords.zglosto_admin}@database:5432/zglosto_db?sslmode=verify-full&sslrootcert=/certs/server.crt`;
  await Bun.write(`${temporary}/init/admin-url.fixture`, direct);
  const applied = await docker([
    'exec',
    '-e',
    'DATABASE_DIRECT_URL_FILE=/docker-entrypoint-initdb.d/admin-url.fixture',
    pg,
    'sh',
    '/docker-entrypoint-initdb.d/apply-runtime-roles.txt',
    '--apply-runtime-role-separation',
  ]);
  expect(applied.code, applied.stderr).toBe(0);
  expect(await allowed('zglosto_backend', 'SELECT current_user')).toBe('zglosto_backend');
});

test('migration refuses roles owning objects instead of leaving an ownership bypass', async () => {
  await allowed(
    'zglosto_admin',
    'ALTER FUNCTION public.trigger_set_timestamp() OWNER TO zglosto_backend;',
    false,
  );
  const result = await sql(
    'zglosto_admin',
    await Bun.file(`${root}/database/migrations/016-runtime-role-grants.sql`).text(),
  );
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('owns objects');
  await allowed(
    'zglosto_admin',
    'ALTER FUNCTION public.trigger_set_timestamp() OWNER TO zglosto_admin;',
    false,
  );
});

test('real Better Auth signup, password login and custom session use the restricted auth role', async () => {
  const published = await must(['port', pool, '6432/tcp']);
  const port = published.split(':').at(-1);
  const urlFile = `${temporary}/auth-url.fixture`;
  await Bun.write(
    urlFile,
    `postgresql://zglosto_auth:${passwords.zglosto_auth}@127.0.0.1:${port}/zglosto_db`,
  );
  const login = await command(
    [
      'bun',
      '-e',
      `
    import { auth, closeAuthDatabase } from './src/auth.ts';
    const body = { email: 'isolated-login@example.test', name: 'Fixture', password: 'fixture-only-user-password-12345' };
    try {
      const signup = await auth.api.signUpEmail({ body, asResponse: true });
      if (signup.status !== 200) throw new Error('Signup failed with restricted auth role');
      const signin = await auth.api.signInEmail({ body, asResponse: true });
      if (signin.status !== 200) throw new Error('Login failed with restricted auth role');
      const cookie = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const session = await auth.api.getSession({ headers: new Headers({ cookie, origin: 'https://city.example' }) });
      if (session?.user?.uprawnienia !== 'mieszkaniec') throw new Error('Resident role was not provisioned or session lookup failed');
      const signout = await auth.api.signOut({ headers: new Headers({ cookie, origin: 'https://city.example' }), asResponse: true });
      if (signout.status !== 200) throw new Error('Logout failed');
    } finally { await closeAuthDatabase(); }
    process.exit(0);
  `,
    ],
    undefined,
    {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: '',
      DATABASE_URL_FILE: urlFile,
      DATABASE_TLS_CA_PATH: `${temporary}/certs/server.crt`,
      BETTER_AUTH_SECRET: 'fixture-only-auth-secret-at-least-32-characters',
      BETTER_AUTH_URL: 'https://city.example/api/auth',
      FRONTEND_ORIGIN: 'https://city.example',
      EMAIL_DELIVERY_MODE: 'disabled',
      REDIS_MODE: 'disabled',
      REDIS_URL_FILE: '',
      REDIS_TLS_CA_PATH: '',
      RATE_LIMIT_HMAC_KEY_FILE: '',
      AUTHORIZATION_MTLS_PORT: '9956',
      AUTHORIZATION_MTLS_CA_PATH: `${temporary}/certs/server.crt`,
      AUTHORIZATION_MTLS_CERT_PATH: `${temporary}/certs/server.crt`,
      AUTHORIZATION_MTLS_KEY_PATH: `${temporary}/certs/server.key`,
      AUTHORIZATION_MTLS_BACKEND_IDENTITY: 'spiffe://zglosto.local/workload/backend',
      AUTHORIZATION_MTLS_HEALTHCHECK_IDENTITY: 'spiffe://zglosto.local/workload/healthcheck',
      AUTHORIZATION_MTLS_NGINX_IDENTITY: 'spiffe://zglosto.local/workload/nginx',
    },
    `${root}/authorization`,
  );
  expect(login.code, login.stderr).toBe(0);
  await allowed('zglosto_auth', `DELETE FROM "user" WHERE email='isolated-login@example.test';`);
}, 30_000);
