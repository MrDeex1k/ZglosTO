import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');

// Disposable PostgreSQL only: no host ports, network, persistent volumes or application data.
const container = `zglosto-llm-diagnostics-${randomUUID()}`;
let started = false;
async function docker(args: string[], input?: string) {
  const child = Bun.spawn(['docker', ...args], {
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
function sql(database: string, query: string) {
  return docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    query,
  );
}
async function must(database: string, query: string) {
  const result = await sql(database, query);
  expect(result.code, result.stderr).toBe(0);
  return result.stdout;
}

beforeAll(async () => {
  const launch = await docker([
    'run',
    '-d',
    '--pull=never',
    '--name',
    container,
    '--network=none',
    '--tmpfs',
    '/var/lib/postgresql',
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e',
    'POSTGRES_DB=fresh',
    ...[
      '01-init.sql',
      '02-create-auth.sql',
      '03-create-dbtables.sql',
      '05-user-provisioning.sql',
      '06-runtime-roles.sh',
      'runtime-role-grants.txt',
    ].flatMap((file) => [
      '--mount',
      `type=bind,src=${root}/database/init-scripts/${file},dst=/docker-entrypoint-initdb.d/${file},readonly`,
    ]),
    '--mount',
    `type=bind,src=${root}/tests/fixtures/database,dst=/runtime-secrets,readonly`,
    ...['AUTH', 'BACKEND', 'MEDIA_WORKER'].flatMap((role) => [
      '-e',
      `DATABASE_${role}_PASSWORD_FILE=/runtime-secrets/${role.toLowerCase().replaceAll('_', '-')}-password`,
    ]),
    'postgres:18.7-alpine3.24',
  ]);
  expect(launch.code, launch.stderr).toBe(0);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Probe the isolated server sequentially.
    const probe = await docker([
      'exec',
      container,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      'fresh',
    ]);
    if (probe.code === 0) {
      ready = true;
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- PostgreSQL initialization needs a short interval.
    await Bun.sleep(250);
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  await must(
    'fresh',
    `INSERT INTO incydenty (opis_zgloszenia,mail_zglaszajacego,adres_zgloszenia,service_key)
    VALUES ('fixture','fixture@example.com','Rynek 1','roads');`,
  );
}, 30_000);
afterAll(async () => {
  if (started) await docker(['rm', '-f', container]);
});

const revision = `sha256:${'a'.repeat(64)}`;
const metadata = `llm_model_id='zglosto/basal-2.0-mini:q5_k_m',
  llm_model_revision='${revision}', llm_prompt_version='municipal-emergency-v1',
  llm_latency_ms=153, llm_calibration_version=NULL`;
function update(database: string, diagnosticSet: string, fallback = false) {
  const status = `llm_classification='${fallback ? 'unknown' : 'emergency'}',
    llm_model_available=${!fallback}, llm_reason=${fallback ? "'timeout'" : 'NULL'},`;
  return `BEGIN; UPDATE incydenty SET ${status} llm_source='${fallback ? 'fallback' : 'model'}',
    ${diagnosticSet}; SELECT llm_confidence_raw, llm_p_emergency_raw, llm_model_revision,
    llm_prompt_version, llm_latency_ms FROM incydenty; ROLLBACK;`;
}

test('fresh automatic initialization stores private diagnostic fields without migrations', async () => {
  const database = 'fresh';
  expect(
    await must(
      database,
      'SELECT count(*) FROM incydenty WHERE llm_model_id IS NULL AND llm_confidence_raw IS NULL;',
    ),
  ).toBe('1');
  const value = await must(
    database,
    update(database, `${metadata}, llm_confidence_raw=0.9, llm_p_emergency_raw=0.9`),
  );
  expect(value).toContain(`0.9|0.9|${revision}|municipal-emergency-v1|153`);
  const fallback = await must(
    database,
    update(database, `${metadata}, llm_confidence_raw=NULL, llm_p_emergency_raw=NULL`, true),
  );
  expect(fallback).toContain(`||${revision}|municipal-emergency-v1|153`);
}, 30_000);

test('fresh automatic initialization rejects partial, non-finite and inconsistent diagnostic scores', async () => {
  const database = 'fresh';
  const invalid = [
    `${metadata}, llm_confidence_raw=1.1, llm_p_emergency_raw=0.9`,
    `${metadata}, llm_confidence_raw=0.9, llm_p_emergency_raw=NULL`,
    `${metadata}, llm_confidence_raw=NULL, llm_p_emergency_raw=0.9`,
    `${metadata}, llm_confidence_raw='NaN', llm_p_emergency_raw=0.9`,
    `${metadata}, llm_confidence_raw='Infinity', llm_p_emergency_raw=0.9`,
    `${metadata}, llm_confidence_raw=0.8, llm_p_emergency_raw=0.9`,
    `${metadata.replace('llm_latency_ms=153', 'llm_latency_ms=-1')}, llm_confidence_raw=0.9, llm_p_emergency_raw=0.9`,
    `llm_confidence_raw=0.9, llm_p_emergency_raw=0.9`,
    `llm_model_id='model-without-prompt-and-timing'`,
    `${metadata.replace(revision, 'not-a-digest')}, llm_confidence_raw=0.9, llm_p_emergency_raw=0.9`,
    `${metadata.replace('municipal-emergency-v1', 'bad prompt version')}, llm_confidence_raw=0.9, llm_p_emergency_raw=0.9`,
  ];
  for (const set of invalid) {
    // oxlint-disable-next-line no-await-in-loop -- Each update runs in its own rolled-back transaction.
    const result = await sql(database, update(database, set));
    expect(result.code, set).not.toBe(0);
  }
  const scoredFallback = await sql(
    database,
    update(database, `${metadata}, llm_confidence_raw=0.9, llm_p_emergency_raw=0.9`, true),
  );
  expect(scoredFallback.code).not.toBe(0);
}, 30_000);

test('fresh initialization grants diagnostic writes only to the backend runtime role', async () => {
  const statement = `BEGIN; INSERT INTO incydenty
    (opis_zgloszenia,mail_zglaszajacego,adres_zgloszenia,service_key,
     llm_classification,llm_source,llm_model_available,llm_reason,
     llm_confidence_raw,llm_p_emergency_raw,llm_model_id,llm_model_revision,
     llm_prompt_version,llm_latency_ms,llm_calibration_version)
    VALUES ('fixture','fixture@example.com','Rynek 1','roads',
      'emergency','model',true,NULL,0.9,0.9,'zglosto/basal-2.0-mini:q5_k_m',
      '${revision}','municipal-emergency-v1',153,NULL)
    RETURNING llm_confidence_raw,llm_p_emergency_raw; ROLLBACK;`;
  const backend = await docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-U',
      'zglosto_backend',
      '-d',
      'fresh',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    statement,
  );
  expect(backend.code, backend.stderr).toBe(0);
  expect(backend.stdout).toContain('0.9|0.9');
  const auth = await docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-U',
      'zglosto_auth',
      '-d',
      'fresh',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    'SELECT llm_confidence_raw FROM incydenty;',
  );
  expect(auth.code).not.toBe(0);
  expect(auth.stderr).toContain('permission denied');
}, 30_000);
