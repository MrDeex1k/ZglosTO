import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

// Dedicated disposable PostgreSQL: no host ports, network or persistent volumes.
const container = `zglosto-migration-security-${randomUUID()}`;
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
  return { stdout, stderr, code };
}
function sql(input: string) {
  return docker(
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    input,
  );
}
beforeAll(async () => {
  const result = await docker([
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
  expect(result.code, result.stderr).toBe(0);
  started = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    // Readiness probes must be sequential and stop as soon as PostgreSQL is ready.
    // oxlint-disable-next-line no-await-in-loop
    const probe = await docker([
      'exec',
      container,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
    ]);
    if (probe.code === 0) return;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(250);
  }
  throw new Error('Isolated PostgreSQL did not become ready');
}, 30_000);
afterAll(async () => {
  if (started) await docker(['rm', '-f', container]);
});
test('migration refuses populated legacy data atomically; empty legacy schema can migrate twice', async () => {
  expect(
    (
      await sql(`CREATE TABLE incydenty (
    id_zgloszenia uuid PRIMARY KEY DEFAULT uuidv7(),
    zdjecie_incydentu_zglaszanego bytea, zdjecie_incydentu_rozwiazanego bytea
  ); INSERT INTO incydenty (zdjecie_incydentu_zglaszanego) VALUES ('legacy-image');`)
    ).code,
  ).toBe(0);
  const migration = await Bun.file(
    new URL('../migrations/006-object-storage-images.sql', import.meta.url),
  ).text();
  const refused = await sql(migration);
  expect(refused.code).not.toBe(0);
  expect(refused.stderr).toContain('require an explicit data migration');
  expect(
    (
      await sql('SELECT count(*) FROM incydenty WHERE zdjecie_incydentu_zglaszanego IS NOT NULL;')
    ).stdout.trim(),
  ).toBe('1');
  // These rows exist only in this test container, never in the running application stack.
  expect((await sql('DELETE FROM incydenty;')).code).toBe(0);
  const empty = await sql(migration);
  expect(empty.code, empty.stderr).toBe(0);
  const repeat = await sql(migration);
  expect(repeat.code, repeat.stderr).toBe(0);
}, 30_000);
