import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

const dockerMock = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args)+'\\n');
if (args[0] === 'inspect') {
  console.log(process.env.MOCK_FORCE_KILL && args.at(-1).includes(process.env.MOCK_FORCE_KILL) ? 137 : 0);
  process.exit(0);
}
const commands = ['ps','stop','start','run','exec','up'];
const position = args.findIndex(arg => commands.includes(arg));
const command = args[position];
const tail = args.slice(position+1);
let stopped = new Set(JSON.parse(fs.readFileSync(process.env.MOCK_STATE,'utf8')));
if (command === 'ps') {
  const service = tail.at(-1);
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
    if (process.env.MOCK_FAIL === 'audit') process.exit(2);
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
  const run = (script: string, backup: string, overrides = {}) =>
    spawnSync('bash', [join(root, 'scripts', script), backup], {
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
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-k3s-backup-'));
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
      'version.txt',
    ]) {
      assert.ok(manifest.includes(file));
    }
    const failed = run('rotated', true);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /token changed/u);
    assert.equal(existsSync(join(directory, 'rotated/SHA256SUMS')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
