import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

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
    'postgres:18.7-alpine3.24',
  ]);
  expect(launch.code, launch.stderr).toBe(0);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Probe the isolated server sequentially.
    const probe = await docker(['exec', container, 'pg_isready', '-U', 'postgres']);
    if (probe.code === 0) {
      ready = true;
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- PostgreSQL initialization needs a short interval.
    await Bun.sleep(250);
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  await must('postgres', 'CREATE DATABASE legacy; CREATE DATABASE fresh;');
  await must(
    'legacy',
    `CREATE TABLE incydenty (
    id_zgloszenia uuid PRIMARY KEY DEFAULT uuidv7(), llm_source text NOT NULL DEFAULT 'fallback'
  ); INSERT INTO incydenty DEFAULT VALUES;`,
  );
  const migration = await Bun.file(
    new URL('../migrations/017-private-llm-diagnostics.sql', import.meta.url),
  ).text();
  await must('legacy', migration);
  await must('legacy', migration);
  await must('fresh', 'CREATE TABLE "user" (id text PRIMARY KEY);');
  await must(
    'fresh',
    await Bun.file(new URL('../init-scripts/03-create-dbtables.sql', import.meta.url)).text(),
  );
  await must('fresh', migration);
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
  const status =
    database === 'fresh'
      ? `llm_classification='${fallback ? 'unknown' : 'emergency'}',
       llm_model_available=${!fallback}, llm_reason=${fallback ? "'timeout'" : 'NULL'},`
      : '';
  return `BEGIN; UPDATE incydenty SET ${status} llm_source='${fallback ? 'fallback' : 'model'}',
    ${diagnosticSet}; SELECT llm_confidence_raw, llm_p_emergency_raw, llm_model_revision,
    llm_prompt_version, llm_latency_ms FROM incydenty; ROLLBACK;`;
}

test.each(['legacy', 'fresh'])(
  '%s schema retains old rows and stores private diagnostic fields',
  async (database) => {
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
  },
  30_000,
);

test.each(['legacy', 'fresh'])(
  '%s schema rejects partial, non-finite and inconsistent diagnostic scores',
  async (database) => {
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
  },
  30_000,
);
