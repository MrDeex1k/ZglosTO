import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  statSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkClusterProduction } from './check-cluster-production.ts';
import { checkDockerWorkspaces } from './check-docker-workspaces.ts';

const root = resolve(import.meta.dirname, '..');
const render = (profile: string) =>
  execFileSync('kubectl', ['kustomize', `k8s/overlays/${profile}`], {
    cwd: root,
    encoding: 'utf8',
  });

test('Docker allowlists include transitive workspace dependencies and reject missing sources', () => {
  checkDockerWorkspaces(root);
  const fixture = mkdtempSync(join(tmpdir(), 'zglosto-context-'));
  try {
    for (const directory of ['backend', 'authorization', 'frontend', 'llm_gateway']) {
      mkdirSync(join(fixture, directory), { recursive: true });
      for (const file of ['package.json', 'Dockerfile', 'Dockerfile.dockerignore']) {
        cpSync(join(root, directory, file), join(fixture, directory, file));
      }
    }
    for (const directory of readdirSync(join(root, 'packages'))) {
      mkdirSync(join(fixture, 'packages', directory), { recursive: true });
      cpSync(
        join(root, 'packages', directory, 'package.json'),
        join(fixture, 'packages', directory, 'package.json'),
      );
    }
    const ignore = join(fixture, 'backend/Dockerfile.dockerignore');
    writeFileSync(ignore, readFileSync(ignore, 'utf8').replace('!packages/workload-auth/**', ''));
    assert.throws(() => checkDockerWorkspaces(fixture), /excludes @zglosto\/workload-auth/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('production refuses distributed local-only rate limits and accepts Redis profiles', () => {
  assert.throws(() => checkClusterProduction(render('kubernetes')), /multiple replicas require/u);
  for (const profile of [
    'kubernetes-redis-local',
    'kubernetes-redis-external',
    'k3s-redis-local',
    'k3s-redis-external',
  ]) {
    checkClusterProduction(render(profile));
  }
  assert.throws(
    () =>
      checkClusterProduction(
        render('kubernetes-redis-local').replace(
          'ingressClassName: traefik',
          'ingressClassName: nginx',
        ),
      ),
    /retired/u,
  );
});

test('K3s profiles distinguish single-node operation from recoverable HA storage', () => {
  const single = render('k3s-single-node');
  checkClusterProduction(single);
  assert.doesNotMatch(
    single,
    /^kind: (ScaledObject|TriggerAuthentication|InterceptorRoute|HorizontalPodAutoscaler)$/mu,
  );
  assert.match(single, /LLM_GATEWAY_URL: https:\/\/llm-gateway:8130/u);
  assert.match(single, /LLM_GATEWAY_SERVER_NAME: llm-gateway\n/u);
  assert.doesNotMatch(single, /externalName: .*keda/u);
  const ha = render('k3s-ha');
  checkClusterProduction(ha, true);
  assert.throws(
    () =>
      checkClusterProduction(
        ha.replaceAll('storageClassName: zglosto-ha', 'storageClassName: local-path'),
        true,
      ),
    /replicated/u,
  );
  assert.throws(
    () =>
      checkClusterProduction(
        ha.replaceAll('whenUnsatisfiable: DoNotSchedule', 'whenUnsatisfiable: ScheduleAnyway'),
        true,
      ),
    /strict spreading/u,
  );
});

const dockerMock = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args)+'\\n');
if (args[0] === 'inspect') {
  console.log(process.env.MOCK_FORCE_KILL && args.at(-1).includes(process.env.MOCK_FORCE_KILL) ? 137 : 0);
  process.exit(0);
}
const commands = ['config','ps','stop','start','run','exec','up'];
const position = args.findIndex(arg => commands.includes(arg));
const command = args[position];
const tail = args.slice(position+1);
let stopped = new Set(JSON.parse(fs.readFileSync(process.env.MOCK_STATE,'utf8')));
if (command === 'config') {
  if (tail.includes('--environment')) {
    for (const name of ['COMPOSE_FILE','COMPOSE_PATH_SEPARATOR']) {
      if (process.env[name]) console.log(name+'='+process.env[name]);
    }
  } else if (process.env.MOCK_FAIL === 'overlay' && args.some(arg => arg.endsWith('storage.operations.yml'))) {
    process.exit(19);
  }
} else if (command === 'ps') {
  const service = tail.at(-1);
  if (process.env.MOCK_PS_FAIL === service) process.exit(23);
  if (!stopped.has(service)) {
    console.log('id-'+service+'-1');
    if (service === 'media_worker') console.log('id-media_worker-2');
  }
} else if (command === 'stop') {
  stopped.add(tail.at(-1));
} else if (command === 'start') {
  stopped.delete(tail.at(-1));
} else if (command === 'up') {
  throw Error('Must preserve existing replicas with start');
} else {
  for (const writer of ['nginx','authorization','backend','media_worker']) {
    if (!stopped.has(writer)) throw Error('Writer remains active: '+writer);
  }
  if (args.some(arg => arg.includes('audit-cli'))) {
    console.log('{}');
    if (process.env.MOCK_FAIL === 'audit') process.exit(Number(process.env.MOCK_AUDIT_EXIT ?? 2));
  } else if (args.at(-1) === 'backup') {
    if (process.env.MOCK_FAIL === 'archive') process.exit(1);
    console.log('object archive');
  } else if (args.some(arg => arg.includes('pg_dump'))) {
    console.log('database archive');
  }
}
fs.writeFileSync(process.env.MOCK_STATE,JSON.stringify([...stopped]));
`;

function maintenanceFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-maintenance-'));
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), dockerMock, { mode: 0o755 });
  const state = join(directory, 'state.json');
  const log = join(directory, 'commands.jsonl');
  writeFileSync(state, '[]');
  const environment = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    MOCK_STATE: state,
    MOCK_LOG: log,
  };
  const run = (script: string, backup: string, overrides = {}, options: string[] = []) =>
    spawnSync('bash', [join(root, 'scripts', script), backup, ...options], {
      cwd: root,
      env: { ...environment, ...overrides },
      encoding: 'utf8',
      timeout: 15_000,
    });
  return { directory, state, log, run };
}

test('backup/restore quiesce all writers, preserve replicas and verify before serving traffic', () => {
  const fixture = maintenanceFixture();
  try {
    const backup = join(fixture.directory, 'backup');
    let result = fixture.run('backup-compose.sh', backup);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(fixture.state, 'utf8')), []);
    result = fixture.run('restore-compose.sh', backup);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(fixture.state, 'utf8')), []);
    const commands = readFileSync(fixture.log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    assert.equal(commands.at(-1)?.at(-1), 'nginx');
    assert.ok(commands.some((command) => command.includes('id-media_worker-2')));
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('backup failure resumes services; failed restore leaves writers stopped', () => {
  const fixture = maintenanceFixture();
  try {
    let result = fixture.run('backup-compose.sh', join(fixture.directory, 'failed'), {
      MOCK_FAIL: 'archive',
    });
    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(readFileSync(fixture.state, 'utf8')), []);
    const backup = join(fixture.directory, 'backup');
    result = fixture.run('backup-compose.sh', backup);
    assert.equal(result.status, 0, result.stderr);
    result = fixture.run('restore-compose.sh', backup, { MOCK_FAIL: 'audit' });
    assert.notEqual(result.status, 0);
    const stopped = JSON.parse(readFileSync(fixture.state, 'utf8')) as string[];
    for (const writer of ['nginx', 'authorization', 'backend', 'media_worker'])
      assert.ok(stopped.includes(writer));
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('a forced worker termination prevents snapshot creation', () => {
  const fixture = maintenanceFixture();
  try {
    const result = fixture.run('backup-compose.sh', join(fixture.directory, 'backup'), {
      MOCK_FORCE_KILL: 'media_worker',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SIGKILL/u);
    assert.doesNotMatch(readFileSync(fixture.log, 'utf8'), /pg_dump/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('maintenance does not start application services that were already stopped', () => {
  const fixture = maintenanceFixture();
  try {
    const writers = ['nginx', 'authorization', 'backend', 'media_worker'];
    writeFileSync(fixture.state, JSON.stringify(writers));
    const backup = join(fixture.directory, 'backup');
    const result = fixture.run('backup-compose.sh', backup);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(fixture.state, 'utf8')), writers);
    const restored = fixture.run('restore-compose.sh', backup);
    assert.equal(restored.status, 0, restored.stderr);
    assert.deepEqual(JSON.parse(readFileSync(fixture.state, 'utf8')), writers);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('control-plane backup couples snapshot, token and configuration and rejects token rotation', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zglosto-k3s-backup-')));
  try {
    const bin = join(directory, 'bin');
    const data = join(directory, 'data');
    const config = join(directory, 'config');
    mkdirSync(bin);
    mkdirSync(join(data, 'server/db/etcd'), { recursive: true });
    mkdirSync(config);
    writeFileSync(join(data, 'server/token'), 'test-only-token');
    writeFileSync(join(config, 'config.yaml'), 'cluster-init: true\n');
    writeFileSync(
      join(bin, 'k3s'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('test-k3s'); process.exit(0); }
if (args[0] !== 'etcd-snapshot' || args[1] !== 'save') throw Error('Unexpected command');
const destination = args[args.indexOf('--etcd-snapshot-dir')+1];
fs.writeFileSync(path.join(destination,'snapshot.db'),'test-snapshot');
if (process.env.MOCK_ROTATE_TOKEN) fs.writeFileSync(path.join(process.env.K3S_DATA_DIR,'server/token'),'rotated');
`,
      { mode: 0o755 },
    );
    const service = join(directory, 'k3s.service');
    const serviceEnv = join(directory, 'k3s.service.env');
    writeFileSync(service, '[Service]\nExecStart=/usr/local/bin/k3s server\n');
    writeFileSync(serviceEnv, 'K3S_NODE_NAME=test\n');
    mkdirSync(`${service}.d`);
    writeFileSync(join(`${service}.d`, 'override.conf'), '[Service]\nLimitNOFILE=1048576\n');
    const run = (name: string, rotate = false) =>
      spawnSync(
        'bash',
        [join(root, 'scripts/backup-k3s-control-plane.sh'), join(directory, name)],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            K3S_DATA_DIR: data,
            K3S_CONFIG_DIR: config,
            K3S_SERVICE_FILE: service,
            K3S_SERVICE_ENV_FILE: serviceEnv,
            ...(rotate ? { MOCK_ROTATE_TOKEN: '1' } : {}),
          },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
    const result = run('complete');
    assert.equal(result.status, 0, result.stderr);
    const manifest = readFileSync(join(directory, 'complete/SHA256SUMS'), 'utf8');
    for (const file of [
      'server-token',
      'snapshots/snapshot.db',
      'config/config.yaml',
      'service/k3s.service',
      'service/k3s.service.env',
      'service/drop-ins/override.conf',
      'version.txt',
    ]) {
      assert.ok(manifest.includes(file));
    }
    assert.notEqual(run('complete').status, 0);
    const outside = join(directory, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(directory, 'linked'));
    symlinkSync(join(directory, 'absent'), join(directory, 'dangling'));
    assert.notEqual(run('linked').status, 0);
    assert.notEqual(run('dangling').status, 0);
    writeFileSync(
      join(bin, 'mkdir'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2);
const destination = args.at(-1);
if (destination.endsWith('/raced')) fs.symlinkSync(path.join(path.dirname(destination), 'outside'), destination);
const result = cp.spawnSync('/bin/mkdir', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
      { mode: 0o755 },
    );
    assert.notEqual(run('raced').status, 0);
    assert.deepEqual(readdirSync(outside), []);
    assert.equal(existsSync(join(directory, 'absent')), false);
    const writable = join(directory, 'writable');
    mkdirSync(writable);
    chmodSync(writable, 0o777);
    mkdirSync(join(writable, 'private'), { mode: 0o700 });
    assert.notEqual(run('writable/backup').status, 0);
    assert.notEqual(run('writable/private/backup').status, 0);
    assert.equal(existsSync(join(writable, 'backup')), false);
    assert.equal(existsSync(join(writable, 'private/backup')), false);
    rmSync(join(config, 'config.yaml'));
    assert.notEqual(run('missing-config').status, 0);
    assert.equal(existsSync(join(directory, 'missing-config')), false);
    writeFileSync(join(config, 'config.yaml'), 'cluster-init: true\n');
    rmSync(serviceEnv);
    assert.notEqual(run('missing-service-env').status, 0);
    assert.equal(existsSync(join(directory, 'missing-service-env')), false);
    writeFileSync(serviceEnv, 'K3S_NODE_NAME=test\n');
    const failed = run('rotated', true);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /token changed/u);
    assert.equal(existsSync(join(directory, 'rotated/SHA256SUMS')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Longhorn accepts either YAML string quote style but rejects invalid replica counts', () => {
  const ha = render('k3s-ha');
  const replicas = /^  numberOfReplicas: .+$/mu;
  for (const value of ['"3"', "'3'"])
    checkClusterProduction(ha.replace(replicas, `  numberOfReplicas: ${value}`), true);
  for (const value of ['3', '"2"', "'2'", String.fromCharCode(34, 51, 39)]) {
    assert.throws(
      () => checkClusterProduction(ha.replace(replicas, `  numberOfReplicas: ${value}`), true),
      /three Longhorn replicas/u,
    );
  }
});

test('failed restore audits stop temporary PgBouncer and preserve the original failure code', () => {
  for (const code of [1, 2]) {
    const fixture = maintenanceFixture();
    try {
      const backup = join(fixture.directory, 'backup');
      const saved = fixture.run('backup-compose.sh', backup);
      assert.equal(saved.status, 0, saved.stderr);
      writeFileSync(fixture.state, JSON.stringify(['pgbouncer']));
      const restored = fixture.run('restore-compose.sh', backup, {
        MOCK_FAIL: 'audit',
        MOCK_AUDIT_EXIT: String(code),
      });
      assert.equal(restored.status, code, restored.stderr);
      const stopped = JSON.parse(readFileSync(fixture.state, 'utf8')) as string[];
      for (const service of ['pgbouncer', 'nginx', 'authorization', 'backend', 'media_worker'])
        assert.ok(stopped.includes(service));
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  }
});

test('Compose backups reject existing, linked and shared destinations before Docker runs', () => {
  const fixture = maintenanceFixture();
  try {
    const existing = join(fixture.directory, 'existing');
    mkdirSync(existing, { mode: 0o755 });
    const linked = join(fixture.directory, 'linked');
    symlinkSync(existing, linked);
    const shared = join(fixture.directory, 'shared');
    mkdirSync(shared);
    chmodSync(shared, 0o777);
    for (const destination of [existing, linked, join(shared, 'backup')]) {
      const result = fixture.run('backup-compose.sh', destination);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(fixture.log), false);
    }
    const destination = join(fixture.directory, 'private-backup');
    const result = fixture.run('backup-compose.sh', destination);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(destination).mode & 0o777, 0o700);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('edge access logs omit signed-upload and auth-callback query credentials', () => {
  const configuration = readFileSync(join(root, 'nginx/nginx-main.conf'), 'utf8');
  const format = configuration.match(/log_format main[\s\S]*?;/u)?.[0];
  assert.ok(format);
  assert.match(format, /\$uri\b/u);
  assert.doesNotMatch(format, /\$(?:request|request_uri|args|query_string|http_referer)\b/u);
});

test('backend runtime removes TypeScript platform binaries as well as the compiler package', () => {
  const dockerfile = readFileSync(join(root, 'backend/Dockerfile'), 'utf8');
  assert.match(dockerfile, /-path '\*\/@typescript\/typescript-\*'/u);
  assert.match(dockerfile, /verify-production-install/u);
});

test('gateway receives usable Redis mode and CA variables in both Compose profiles', () => {
  for (const mode of ['local', 'external']) {
    const rendered = execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        'tests/integration/integration.env',
        '-f',
        'docker-compose.no-rustfs.yml',
        '-f',
        `docker-compose.redis.${mode}.yml`,
        'config',
        '--format',
        'json',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          REDIS_ACL_FILE: 'tests/fixtures/redis/users.acl',
          REDIS_URL_SECRET_FILE: 'tests/fixtures/redis/url',
          RATE_LIMIT_HMAC_KEY_SECRET_FILE: 'tests/fixtures/redis/rate-limit-hmac',
          REDIS_TLS_CA_FILE: '.certs/database/ca.crt',
        },
      },
    );
    const gateway = JSON.parse(rendered).services.llm_gateway.environment;
    assert.equal(gateway.REDIS_MODE, mode);
    assert.equal(gateway.REDIS_URL_FILE, '/run/secrets/redis/url');
    assert.equal(gateway.REDIS_TLS_CA_PATH, mode === 'local' ? '' : '/run/secrets/redis/ca.crt');
  }
});

test('storage IAM bootstrap and runtime secrets remain separate in rendered profiles', () => {
  const script = readFileSync(join(root, 'scripts/provision-storage-iam.sh'), 'utf8');
  assert.equal(
    readFileSync(join(root, 'k8s/components/rustfs/provision-storage-iam.sh'), 'utf8'),
    script,
  );
  const rendered = render('k3s-rustfs');
  const documents = rendered.split(/^---\s*$/mu);
  const workload = (kind: string, name: string) =>
    documents.find(
      (document) => document.includes(`kind: ${kind}\n`) && document.includes(`  name: ${name}\n`),
    ) ?? '';
  const backend = workload('Deployment', 'backend');
  const worker = workload('Deployment', 'media-worker');
  const server = workload('StatefulSet', 'rustfs');
  const bootstrap = workload('Job', 'storage-provision');
  assert.match(server, /secretName: zglosto-rustfs-root/u);
  assert.doesNotMatch(server, /secretName: zglosto-object-storage-credentials/u);
  assert.match(worker, /secretName: zglosto-object-storage-worker-credentials/u);
  for (const runtime of [backend, worker]) {
    assert.doesNotMatch(runtime, /secretName: zglosto-rustfs-root/u);
    assert.doesNotMatch(runtime, /secretName: zglosto-object-storage-operations-credentials/u);
  }
  assert.match(bootstrap, /rustfs\/rc:v0\.1\.37@sha256:/u);
  assert.match(bootstrap, /automountServiceAccountToken: false/u);
  assert.match(bootstrap, /secretName: zglosto-object-storage-operations-credentials/u);
});

test('archive/audit one-off overlay selects operations credentials without exposing root', () => {
  const overlay = readFileSync(join(root, 'docker-compose.storage.operations.yml'), 'utf8');
  assert.match(overlay, /S3_ACCESS_KEY_ID_FILE: \/run\/secrets\/s3_operations_access_key_id/u);
  assert.doesNotMatch(overlay, /rustfs_root/u);
  const helper = readFileSync(join(root, 'scripts/lib/compose-maintenance.sh'), 'utf8');
  assert.match(helper, /operations_compose\+=\(--file "\$operations_file"\)/u);
  for (const file of ['backup-compose.sh', 'restore-compose.sh']) {
    const script = readFileSync(join(root, 'scripts', file), 'utf8');
    assert.match(script, /prepare_maintenance_compose "\$@"/u);
    assert.doesNotMatch(script, /"\$\{compose\[@\]\}" run.*backend/u);
  }
});

test('maintenance appends operations to default, environment and explicit Compose files', () => {
  const fixture = maintenanceFixture();
  const overlay = join(root, 'docker-compose.storage.operations.yml');
  const base = join(root, 'docker-compose.yml');
  try {
    for (const { environment, options, files } of [
      { environment: { COMPOSE_FILE: '' }, options: [], files: [base] },
      {
        environment: {
          COMPOSE_FILE: 'base.yml;override with spaces.yml',
          COMPOSE_PATH_SEPARATOR: ';',
        },
        options: ['--project-name', 'isolated'],
        files: ['base.yml', 'override with spaces.yml'],
      },
      {
        environment: { COMPOSE_FILE: 'ignored.yml' },
        options: ['--file=explicit.yml', '-f', 'last.yml'],
        files: ['--file=explicit.yml', '-f', 'last.yml'],
      },
    ]) {
      writeFileSync(fixture.log, '');
      const backup = join(fixture.directory, `backup-${files.length}-${options.length}`);
      const result = fixture.run('backup-compose.sh', backup, environment, options);
      assert.equal(result.status, 0, result.stderr);
      const commands = readFileSync(fixture.log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[]);
      const [baseConfig, operationsConfig] = commands.filter(
        (command) => command.includes('config') && command.includes('--quiet'),
      );
      assert.deepEqual(baseConfig, ['compose', ...options, 'config', '--quiet']);
      const operationsOptions = options[0]?.startsWith('--file=')
        ? options
        : [...options, ...files.flatMap((file) => ['--file', file])];
      assert.deepEqual(operationsConfig, [
        'compose',
        ...operationsOptions,
        '--file',
        overlay,
        'config',
        '--quiet',
      ]);
      assert.ok(commands.indexOf(operationsConfig!) < commands.findIndex((c) => c.includes('ps')));
      assert.ok(commands.filter((c) => c.includes('run')).every((c) => c.includes(overlay)));
      assert.ok(commands.filter((c) => c.includes('exec')).every((c) => !c.includes(overlay)));
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('maintenance aborts before any stop or data operation when validation or compose ps fails', () => {
  const fixture = maintenanceFixture();
  try {
    const backup = join(fixture.directory, 'complete');
    const saved = fixture.run('backup-compose.sh', backup);
    assert.equal(saved.status, 0, saved.stderr);
    for (const script of ['backup-compose.sh', 'restore-compose.sh']) {
      for (const environment of [{ MOCK_FAIL: 'overlay' }, { MOCK_PS_FAIL: 'media_worker' }]) {
        writeFileSync(fixture.log, '');
        const destination =
          script === 'restore-compose.sh'
            ? backup
            : join(fixture.directory, JSON.stringify(environment));
        const result = fixture.run(script, destination, environment);
        assert.notEqual(result.status, 0);
        const commands = readFileSync(fixture.log, 'utf8').trim().split('\n');
        assert.ok(commands.length >= 2);
        assert.doesNotMatch(commands.join('\n'), /"(?:stop|start|run|exec)"/u);
        assert.deepEqual(JSON.parse(readFileSync(fixture.state, 'utf8')), []);
      }
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('phase 12 media evidence requires successful jobs for the exact uploaded images', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-media-evidence-'));
  try {
    const report = join(directory, 'load.json');
    writeFileSync(
      report,
      JSON.stringify({
        scenario: 'incident-write',
        passed: true,
        requests: 1,
        failures: 0,
        mediaTargets: [
          {
            incidentId: '00000000-0000-4000-8000-000000000001',
            imageId: '00000000-0000-4000-8000-000000000002',
          },
        ],
      }),
    );
    const run = (state: string) =>
      spawnSync(
        'bash',
        [
          '-e',
          '-c',
          `
      source scripts/lib/phase12-media.sh
      compose() {
        if [ "$3" = database ]; then
          cat >&2
          printf '%s\\n' "$MOCK_MEDIA_STATE"
        fi
      }
      verify_phase12_media_jobs "$1" compose
    `,
          'bash',
          report,
        ],
        {
          cwd: root,
          env: { ...process.env, MOCK_MEDIA_STATE: state },
          encoding: 'utf8',
        },
      );
    const failed = run('0|1|0|1');
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /media jobs failed or are missing/u);
    assert.match(failed.stderr, /00000000-0000-4000-8000-000000000002/u);
    assert.match(failed.stderr, /job\.image_revision = image\.revision/u);
    assert.match(failed.stderr, /processed_mime_type = 'image\/webp'/u);
    const verified = run('0|0|1|1');
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /Verified 1 load-test media jobs/u);
    writeFileSync(
      report,
      '{"scenario":"incident-write","passed":true,"requests":0,"failures":0,"mediaTargets":[]}',
    );
    const empty = run('0|0|0|0');
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /Missing or invalid incident-write media targets/u);
    assert.doesNotMatch(empty.stderr, /SELECT/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resource sizing requires a successful monitor and fresh evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-resource-evidence-'));
  try {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      join(bin, 'bun'),
      `#!${process.execPath}
      const fs = require('node:fs');
      const path = require('node:path');
      const args = process.argv.slice(2);
      const field = key => args[args.indexOf(key) + 1];
      const ready = path.join(process.env.PHASE12_ARTIFACT_DIR, 'monitor-ready');
      if (args[0].endsWith('phase12-resource-monitor.ts')) {
        process.on('SIGTERM', () => {
          if (process.env.MONITOR_RESULT === 'bad-status') process.exit(7);
          if (process.env.MONITOR_RESULT === 'ok') {
            const report = { schemaVersion: 1, kind: 'local-resource-measurement',
              project: field('--project'), profile: field('--profile'),
              completion: 'signal', samples: 1, containers: [{name: 'test-backend'}] };
            fs.writeFileSync(field('--output'), JSON.stringify(report));
          }
          process.exit(0);
        });
        fs.writeFileSync(ready, '');
        setInterval(() => {}, 1000);
      } else if (args[0].endsWith('phase12-observability-drill.ts')) {
        const deadline = Date.now() + 3000;
        while (!fs.existsSync(ready) && Date.now() < deadline) Bun.sleepSync(10);
        process.exit(fs.existsSync(ready) ? 0 : 1);
      } else {
        process.exit(require('node:child_process').spawnSync(process.execPath, args, {stdio: 'inherit'}).status ?? 1);
      }
    `,
      { mode: 0o755 },
    );
    for (const result of ['bad-status', 'no-report', 'ok']) {
      const artifacts = join(directory, result);
      mkdirSync(artifacts);
      writeFileSync(join(artifacts, 'resources.json'), '{"stale":true}');
      const measured = spawnSync('bash', ['scripts/phase12-resource-profile.sh', 'observability'], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PHASE12_ALLOW_DESTRUCTIVE: '1',
          PHASE12_ARTIFACT_DIR: artifacts,
          MONITOR_RESULT: result,
        },
        encoding: 'utf8',
        timeout: 10_000,
      });
      const report = readFileSync(join(artifacts, 'resources.json'), 'utf8');
      const runLog = readFileSync(join(artifacts, 'run.log'), 'utf8');
      if (result === 'ok') {
        assert.equal(measured.status, 0, measured.stderr + runLog);
        assert.match(report, /local-resource-measurement/u);
      } else {
        assert.equal(measured.status, 1, measured.stderr + runLog);
        assert.match(
          runLog,
          /resource monitor (?:exited unsuccessfully|did not produce)/u,
          measured.stderr,
        );
        assert.equal(report, '{"stale":true}');
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('IAM bootstrap rejects reused root identity before any RC request', () => {
  const result = spawnSync('sh', [join(root, 'scripts/provision-storage-iam.sh')], {
    env: {
      PATH: process.env.PATH!,
      RUSTFS_ROOT_ACCESS_KEY: 'root-fixture',
      RUSTFS_ROOT_SECRET_KEY: 'root-secret-fixture',
      S3_ACCESS_KEY_ID: 'root-fixture',
      S3_SECRET_ACCESS_KEY: 'backend-secret-fixture',
      S3_WORKER_ACCESS_KEY_ID: 'worker-fixture',
      S3_WORKER_SECRET_ACCESS_KEY: 'worker-secret-fixture',
      S3_OPERATIONS_ACCESS_KEY_ID: 'operations-fixture',
      S3_OPERATIONS_SECRET_ACCESS_KEY: 'operations-secret-fixture',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 78);
  assert.match(result.stderr, /identities must differ/u);
  assert.doesNotMatch(result.stderr, /root-secret-fixture|backend-secret-fixture/u);
});
