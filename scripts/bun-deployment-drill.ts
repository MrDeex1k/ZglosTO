// Disposable acceptance drill; never targets a user-provided Compose project or database.
import assert from 'node:assert/strict';
import { evaluateBunPerformance } from './lib/bun-performance.ts';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tag = process.argv[2];
if (!tag || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(tag))
  throw new Error('Usage: bun scripts/bun-deployment-drill.ts EXACT_ROLLBACK_TAG');
const seconds = Number(process.env.BUN_SOAK_SECONDS ?? 600);
if (!Number.isSafeInteger(seconds) || seconds < 60)
  throw new Error('BUN_SOAK_SECONDS must be >= 60');
const runId = `${Date.now()}`;
const project = `zglosto-bun-drill-${runId}`;
const evidence = join(root, '.state/bun-migration', runId);
const source = mkdtempSync(join(tmpdir(), 'zglosto-bun-rollback-'));
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  DOCKER_HOST: process.env.DOCKER_HOST,
  DOCKER_CONTEXT: process.env.DOCKER_CONTEXT,
  DOCKER_CONFIG: process.env.DOCKER_CONFIG,
  INTEGRATION_PROJECT_NAME: project,
  INTEGRATION_HTTP_PORT: '12635',
  INTEGRATION_DATABASE_PORT: '18432',
  INTEGRATION_AUTHORIZATION_MTLS_PORT: '21956',
  INTEGRATION_RABBITMQ_TLS_PORT: '17671',
  INTEGRATION_KEEP_RUNNING: '1',
  INTEGRATION_OBSERVABILITY: '0',
  INTEGRATION_REDIS_MODE: 'disabled',
};
const log = (message: string) => console.log(`[bun-deployment] ${message}`);
function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; input?: Buffer } = {},
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? env,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.slice(0, 3).join(' ')} failed: ${result.error?.message ?? result.stderr.slice(-6000)}\n${result.stdout.slice(-2000)}`,
    );
  }
  return result.stdout;
}
const composeArgs = [
  'compose',
  '--project-name',
  project,
  '--env-file',
  'tests/integration/integration.env',
  '-f',
  'docker-compose.no-rustfs.yml',
  '-f',
  'docker-compose.rustfs.yml',
  '-f',
  'docker-compose.integration.yml',
];
const compose = (args: string[], override?: string) =>
  run('docker', [...composeArgs, ...(override ? ['-f', override] : []), ...args]);
const services = ['authorization', 'backend', 'media_worker', 'llm_gateway', 'frontend'];
const builds = ['authorization', 'backend', 'llm_gateway', 'frontend'];
const report: Record<string, unknown> = {
  schemaVersion: 1,
  project,
  rollbackTag: tag,
  startedAt: new Date().toISOString(),
  productionCertified: false,
};
let started = false;
let passed = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    report.passed = false;
    report.error = `Interrupted by ${signal}`;
    report.finishedAt = new Date().toISOString();
    if (started) {
      try {
        compose(['down', '--volumes', '--remove-orphans']);
      } catch {
        report.cleanup = 'failed';
      }
    }
    writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    rmSync(source, { recursive: true, force: true });
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}
try {
  const revision = run('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]).trim();
  report.rollbackRevision = revision;
  report.candidateRevision = run('git', ['rev-parse', 'HEAD']).trim();
  report.candidateDirty = run('git', ['status', '--porcelain']).length > 0;
  log(`Exact-tag rebuild: ${tag} (${revision}); evidence ${evidence}`);
  const archive = spawnSync('git', ['archive', revision], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(archive.status, 0);
  run('tar', ['-x', '-C', source], { input: archive.stdout });
  const baselineImages: Record<string, string> = {};
  const buildSeconds: Record<string, number> = {};
  for (const service of builds) {
    const image = `${project}-rollback-${service}:${tag}`;
    const began = performance.now();
    log(`Rebuilding ${service} from archived tag`);
    run('docker', ['build', '-f', join(source, service, 'Dockerfile'), '-t', image, source]);
    baselineImages[service] = image;
    buildSeconds[service] = (performance.now() - began) / 1000;
  }
  report.rollbackBuildSeconds = buildSeconds;
  // Obtain old entrypoints and probes from the archived configuration, not guesses about paths.
  const previous = JSON.parse(
    run(
      'docker',
      [
        'compose',
        '--env-file',
        'tests/integration/integration.env',
        '-f',
        'docker-compose.no-rustfs.yml',
        '-f',
        'docker-compose.rustfs.yml',
        '-f',
        'docker-compose.integration.yml',
        'config',
        '--format',
        'json',
      ],
      { cwd: source },
    ),
  );
  const baseline: Record<string, unknown> = {};
  for (const service of services) {
    const image = baselineImages[service === 'media_worker' ? 'backend' : service];
    assert.ok(image, `Missing baseline image for ${service}`);
    const [metadata] = JSON.parse(run('docker', ['image', 'inspect', image]));
    baseline[service] = {
      image,
      ...(service === 'backend' ? { ports: ['127.0.0.1:12636:3000'] } : {}),
      command: previous.services[service].command ?? metadata.Config.Cmd,
      entrypoint: metadata.Config.Entrypoint,
      working_dir: metadata.Config.WorkingDir,
      healthcheck: previous.services[service].healthcheck,
    };
  }
  const baselineOverride = join(evidence, 'rollback.compose.json');
  writeFileSync(baselineOverride, JSON.stringify({ services: baseline }, null, 2));
  log('Starting isolated integration suite');
  started = true;
  const integration = run('bash', ['scripts/test-phase0-integration.sh']);
  writeFileSync(join(evidence, 'integration.log'), integration, { mode: 0o600 });
  report.integration = 'passed';
  const candidate: Record<string, unknown> = {};
  for (const service of services) {
    const id = compose(['ps', '-q', service]).trim();
    const [container] = JSON.parse(run('docker', ['inspect', id]));
    const [image] = JSON.parse(run('docker', ['image', 'inspect', container.Image]));
    candidate[service] = {
      image: container.Image,
      ...(service === 'backend' ? { ports: ['127.0.0.1:12636:3000'] } : {}),
      command: container.Config.Cmd,
      entrypoint: image.Config.Entrypoint,
      working_dir: container.Config.WorkingDir,
    };
  }
  const candidateOverride = join(evidence, 'candidate.compose.json');
  writeFileSync(candidateOverride, JSON.stringify({ services: candidate }, null, 2));
  const sql = (query: string) =>
    compose([
      'exec',
      '-T',
      'database',
      'sh',
      '-c',
      'psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -tAc "$1"',
      'sh',
      query,
    ]).trim();
  sql(
    'CREATE TABLE bun_rollback_marker (id integer primary key); INSERT INTO bun_rollback_marker VALUES (5)',
  );

  // A persisted marker plus route/auth smoke verifies that an image swap does not recreate the DB.
  const marker = () => assert.equal(sql('SELECT id FROM bun_rollback_marker'), '5');
  const measurements: Record<string, unknown>[] = [];
  function load(name: string, duration = 0): Record<string, number> {
    const file = join(evidence, `${name}.json`);
    run('bun', ['scripts/phase12-load-test.ts'], {
      env: {
        ...env,
        PHASE12_BASE_URL: 'http://127.0.0.1:12636',
        PHASE12_LOAD_SCENARIO: 'backend-read',
        PHASE12_LOAD_CONCURRENCY: '20',
        PHASE12_LOAD_REQUESTS: '2000',
        PHASE12_LOAD_MAX_ERROR_RATE: '0',
        PHASE12_LOAD_DURATION_SECONDS: String(duration),
        PHASE12_LOAD_PACING_MS: duration ? '50' : '0',
        PHASE12_EVIDENCE_FILE: file,
      },
    });
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  for (const runtime of ['node', 'bun', 'node', 'bun', 'node', 'bun']) {
    const override = runtime === 'node' ? baselineOverride : candidateOverride;
    log(`Measuring ${runtime}, round ${measurements.length + 1}`);
    const began = performance.now();
    compose(
      [
        'up',
        '-d',
        '--no-build',
        '--force-recreate',
        '--wait',
        '--wait-timeout',
        '180',
        ...services,
      ],
      override,
    );
    // Restart nginx to discard upstream addresses cached before the application containers were replaced.
    compose(['restart', 'nginx']);
    const readySeconds = (performance.now() - began) / 1000;
    marker();
    for (const service of services.filter((name) => name !== 'frontend')) {
      const actual = compose(
        ['exec', '-T', service, runtime, '-p', "process.versions.bun ? 'bun' : 'node'"],
        override,
      ).trim();
      assert.equal(actual, runtime);
    }
    // eslint-disable-next-line no-await-in-loop -- Each runtime must be checked before switching images.
    const unauthorized = await fetch('http://127.0.0.1:12635/api/mieszkaniec/incydenty');
    assert.equal(unauthorized.status, 401);
    // eslint-disable-next-line no-await-in-loop -- Drain this smoke response before the measurement.
    await unauthorized.arrayBuffer();
    load(`warmup-${measurements.length}`);
    const result = load(`load-${runtime}-${measurements.length}`);
    const rss: Record<string, number> = {};
    for (const service of services.filter((name) => name !== 'frontend')) {
      const status = compose(['exec', '-T', service, 'cat', '/proc/1/status'], override);
      const kb = Number(/^VmRSS:\s+(\d+)/mu.exec(status)?.[1]);
      assert.ok(Number.isFinite(kb) && kb > 0);
      rss[service] = kb * 1024;
    }
    const stats = run('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{json .}}',
      ...services.map((service) => compose(['ps', '-q', service]).trim()),
    ]);
    writeFileSync(join(evidence, `stats-${measurements.length}.jsonl`), stats);
    measurements.push({ runtime, readySeconds, ...result, rss });
    report.measurements = measurements;
    writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  }
  log(`Bun soak: ${seconds} seconds`);
  report.soak = load('soak-bun', seconds);
  marker();
  report.rollbackSmoke =
    'passed: three switches to rebuilt Node images, same database marker and auth boundary';
  report.limitations = [
    'Local arm64 Docker VM; cluster/production acceptance is separate.',
    'Direct backend reads bypass Nginx; Docker stats is a snapshot, RSS is sampled after load.',
    'Full release certification requires audit, native amd64, long soak and a clean exact-tag candidate.',
  ];
  const comparison = evaluateBunPerformance(measurements);
  report.performance = comparison;
  passed = comparison.passed;
  if (!passed) process.exitCode = 1;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      compose(['down', '--volumes', '--remove-orphans']);
    } catch (error) {
      console.error('Cleanup failed', error);
      report.cleanup = 'failed';
      passed = false;
      process.exitCode = 1;
    }
  }
  rmSync(source, { recursive: true, force: true });
  report.passed = passed;
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  log(`Evidence: ${evidence}`);
}
