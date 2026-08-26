import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Cluster stateful services policy failed: ${message}`);
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${path} must be a non-empty string`);
  }
  return value;
}

function render(path: string): string {
  return execFileSync('kubectl', ['kustomize', path], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function documents(rendered: string): string[] {
  return rendered.split(/^---\s*$/mu);
}

function resource(rendered: string, kind: string, name: string): string {
  return (
    documents(rendered).find(
      (document: string) =>
        new RegExp(`^kind:\\s*${kind}\\s*$`, 'mu').test(document) &&
        new RegExp(`^\\s{2}name:\\s*${name}\\s*$`, 'mu').test(document),
    ) ?? fail(`${kind}/${name} was not rendered`)
  );
}

function hasWorkload(rendered: string, name: string): boolean {
  return documents(rendered).some(
    (document: string) =>
      /^kind:\s*(?:Deployment|StatefulSet)\s*$/mu.test(document) &&
      new RegExp(`^\\s{2}name:\\s*${name}\\s*$`, 'mu').test(document),
  );
}

function validatePrivateService(rendered: string, name: string, forbiddenPort?: number): void {
  const service = resource(rendered, 'Service', name);
  if (/^\s+type:\s*(?:NodePort|LoadBalancer)\s*$/mu.test(service)) {
    fail(`Service/${name} must remain private`);
  }
  if (forbiddenPort !== undefined && service.includes(`port: ${forbiddenPort}`)) {
    fail(`Service/${name} exposes forbidden port ${forbiddenPort}`);
  }
}

function validateStatefulSet(
  rendered: string,
  name: string,
  storageClassName: string,
  expectedClaims: Record<string, string>,
): void {
  const statefulSet = resource(rendered, 'StatefulSet', name);
  if (
    !statefulSet.includes('persistentVolumeClaimRetentionPolicy:') ||
    (statefulSet.match(/whenDeleted:\s*Retain/gu)?.length ?? 0) !== 1 ||
    (statefulSet.match(/whenScaled:\s*Retain/gu)?.length ?? 0) !== 1
  ) {
    fail(`StatefulSet/${name} must retain PVCs on deletion and scale-down`);
  }
  if (!statefulSet.includes('startupProbe:') || !statefulSet.includes('readinessProbe:')) {
    fail(`StatefulSet/${name} lacks startup/readiness probes`);
  }
  for (const [claimName, size] of Object.entries(expectedClaims)) {
    const claimPattern = new RegExp(
      `name:\\s*${claimName}[\\s\\S]*?storage:\\s*${size}[\\s\\S]*?storageClassName:\\s*${storageClassName}`,
      'u',
    );
    if (!claimPattern.test(statefulSet)) {
      fail(`StatefulSet/${name} lacks retained ${claimName}=${size} on ${storageClassName}`);
    }
  }
}

function validateApplicationDatabaseIsolation(rendered: string): void {
  for (const consumer of ['authorization', 'backend']) {
    const deployment = resource(rendered, 'Deployment', consumer);
    if (!deployment.includes('name: DATABASE_URL_FILE')) {
      fail(`Deployment/${consumer} does not receive the PgBouncer application URL`);
    }
    if (
      deployment.includes('DATABASE_DIRECT_URL') ||
      deployment.includes('database-direct-url') ||
      deployment.includes('name: database\n')
    ) {
      fail(`Deployment/${consumer} can bypass PgBouncer`);
    }
  }

  const pgbouncer = resource(rendered, 'Deployment', 'pgbouncer');
  if (
    !pgbouncer.includes('name: DATABASE_URL_FILE') ||
    !pgbouncer.includes('database-direct-url') ||
    !pgbouncer.includes('name: PGBOUNCER_CLIENT_URL_FILE') ||
    !pgbouncer.includes('database-url') ||
    !pgbouncer.includes('value: transaction')
  ) {
    fail('PgBouncer must separate its direct upstream URL from the application URL');
  }
}

function validateExternalObjectStorage(rendered: string, profile: string): void {
  if (hasWorkload(rendered, 'rustfs') || rendered.includes('name: rustfs-headless')) {
    fail(`${profile} external Object Storage overlay unexpectedly contains RustFS`);
  }
  if (
    !rendered.includes('S3_ENDPOINT: https://s3.example.invalid') ||
    !rendered.includes('S3_FORCE_PATH_STYLE: "false"') ||
    !rendered.includes('S3_AUTO_CREATE_BUCKET: "false"')
  ) {
    fail(`${profile} external Object Storage contract is not provider-neutral`);
  }
}

function validateRustfsOverlay(rendered: string, profile: string, storageClassName: string): void {
  validateStatefulSet(rendered, 'rustfs', storageClassName, { 'rustfs-data': '50Gi' });
  validatePrivateService(rendered, 'rustfs');
  const rustfs = resource(rendered, 'StatefulSet', 'rustfs');
  if (
    !rustfs.includes('value: "false"') ||
    !rustfs.includes('/run/secrets/object-storage/access-key-id') ||
    !rustfs.includes('/run/secrets/object-storage/secret-access-key')
  ) {
    fail(`${profile} RustFS does not disable its console or use file-mounted credentials`);
  }
  if (
    !rendered.includes('S3_ENDPOINT: http://rustfs:9000') ||
    !rendered.includes('S3_FORCE_PATH_STYLE: "true"') ||
    !rendered.includes('S3_AUTO_CREATE_BUCKET: "true"')
  ) {
    fail(`${profile} RustFS overlay does not override only the neutral S3 contract`);
  }
}

const contract = asRecord(
  JSON.parse(readFileSync('deploy/cluster-stateful-contract.json', 'utf8')) as unknown,
  'clusterStatefulContract',
);
if (contract.schemaVersion !== 1 || contract.phase !== '9.5' || contract.status !== 'implemented') {
  fail('contract must identify implemented Phase 9 step 5');
}
const databaseRouting = asRecord(contract.databaseRouting, 'databaseRouting');
if (
  databaseRouting.applicationEndpoint !== 'pgbouncer:6432' ||
  databaseRouting.directEndpoint !== 'database:54325' ||
  databaseRouting.directFallbackAllowed !== false
) {
  fail('database routing contract differs from Phase 9 step 5');
}
const workloads = asRecord(contract.workloads, 'workloads');
const rabbitmqContract = asRecord(workloads.rabbitmq, 'workloads.rabbitmq');
if (rabbitmqContract.managementEnabled !== false) {
  fail('RabbitMQ management plugin must remain disabled');
}

const profiles = asRecord(contract.profiles, 'profiles');
for (const profileName of ['kubernetes', 'k3s']) {
  const profile = asRecord(profiles[profileName], `profiles.${profileName}`);
  const externalOverlay = asString(
    profile.externalObjectStorageOverlay,
    `${profileName}.externalObjectStorageOverlay`,
  );
  const rustfsOverlay = asString(profile.rustfsOverlay, `${profileName}.rustfsOverlay`);
  const storageClassName = asString(profile.storageClassName, `${profileName}.storageClassName`);
  const external = render(externalOverlay);
  const withRustfs = render(rustfsOverlay);

  validateExternalObjectStorage(external, profileName);
  validateStatefulSet(external, 'database', storageClassName, {
    'postgres-data': '20Gi',
    'pgbackrest-data': '40Gi',
  });
  validateStatefulSet(external, 'rabbitmq', storageClassName, { 'rabbitmq-data': '10Gi' });
  validatePrivateService(external, 'database');
  validatePrivateService(external, 'pgbouncer');
  validatePrivateService(external, 'rabbitmq', 15672);
  validateApplicationDatabaseIsolation(external);

  const database = resource(external, 'StatefulSet', 'database');
  if (
    !database.includes('name: pgbackrest-scheduler') ||
    !database.includes('key: PGBACKREST_BACKUP_INTERVAL_SECONDS') ||
    !database.includes('backup_type=full')
  ) {
    fail(`${profileName} does not schedule differential and weekly full pgBackRest backups`);
  }

  const rabbitmq = resource(external, 'StatefulSet', 'rabbitmq');
  if (rabbitmq.includes('containerPort: 15672')) {
    fail(`${profileName} RabbitMQ must not expose the disabled management listener`);
  }

  const pgbouncer = resource(external, 'Deployment', 'pgbouncer');
  if (!pgbouncer.includes('replicas: 2')) {
    fail(`${profileName} must run two stateless PgBouncer replicas`);
  }
  resource(external, 'PodDisruptionBudget', 'pgbouncer-pdb');
  validateRustfsOverlay(withRustfs, profileName, storageClassName);
}

console.log(
  'Cluster stateful services policy OK: retained PostgreSQL/RabbitMQ storage, PgBouncer-only application DB routing, pgBackRest scheduling and optional RustFS overlays are consistent.',
);
