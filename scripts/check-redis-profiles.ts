import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;
type RedisMode = 'disabled' | 'external' | 'local';

function fail(message: string): never {
  throw new Error(`Redis profile policy failed: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function stringValue(value: unknown, path: string): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : fail(`${path} must be a non-empty string`);
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown) => typeof entry === 'string')) {
    return fail(`${path} must be a string array`);
  }
  return value;
}

function compose(files: string[], environmentFile = '.env.example'): JsonRecord {
  const args = [
    'compose',
    '--env-file',
    environmentFile,
    '--env-file',
    'deploy/compose/images.env.example',
  ];
  for (const file of files) args.push('--file', file);
  args.push('config', '--format', 'json');
  const output = execFileSync('docker', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      RATE_LIMIT_HMAC_KEY_SECRET_FILE: 'tests/fixtures/redis/rate-limit-hmac',
      REDIS_ACL_FILE: 'tests/fixtures/redis/users.acl',
      REDIS_TLS_CA_FILE: 'tests/fixtures/redis/ca.crt',
      REDIS_URL_SECRET_FILE: 'tests/fixtures/redis/url',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return record(JSON.parse(output) as unknown, 'compose');
}

function cluster(path: string): string {
  return execFileSync('kubectl', ['kustomize', path], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function documents(rendered: string): string[] {
  return rendered.split(/^---\s*$/mu);
}

function resource(rendered: string, kind: string, name: string): string | null {
  return (
    documents(rendered).find(
      (document: string) =>
        new RegExp(`^kind:\\s*${kind}\\s*$`, 'mu').test(document) &&
        new RegExp(`^\\s{2}name:\\s*${name}\\s*$`, 'mu').test(document),
    ) ?? null
  );
}

function composeServices(rendered: JsonRecord): JsonRecord {
  return record(rendered.services, 'compose.services');
}

function composeEnvironment(service: JsonRecord, path: string): JsonRecord {
  return record(service.environment, `${path}.environment`);
}

function validateComposeApplications(mode: RedisMode, services: JsonRecord): void {
  for (const serviceName of ['authorization', 'backend']) {
    const service = record(services[serviceName], `services.${serviceName}`);
    const environment = composeEnvironment(service, `services.${serviceName}`);
    if (environment.REDIS_MODE !== mode) {
      fail(`Compose ${mode} does not set REDIS_MODE=${mode} on ${serviceName}`);
    }

    const secrets = Array.isArray(service.secrets) ? service.secrets : [];
    const targets = secrets.map((entry: unknown) =>
      stringValue(record(entry, `${serviceName}.secrets[]`).target, `${serviceName}.secret.target`),
    );
    if (mode === 'disabled') {
      if (
        environment.REDIS_URL_FILE !== '' ||
        environment.RATE_LIMIT_HMAC_KEY_FILE !== '' ||
        targets.some((target: string) => target.startsWith('/run/secrets/redis/'))
      ) {
        fail(`Compose disabled leaks Redis configuration into ${serviceName}`);
      }
      continue;
    }

    for (const target of ['/run/secrets/redis/url', '/run/secrets/redis/rate-limit-hmac']) {
      if (!targets.includes(target)) fail(`Compose ${mode}/${serviceName} lacks ${target}`);
    }
    if (mode === 'external' && !targets.includes('/run/secrets/redis/ca.crt')) {
      fail(`Compose external/${serviceName} lacks the Redis CA`);
    }
  }
}

function validateCompose(mode: RedisMode, files: string[], expectedImage: string): void {
  const rendered = compose(files);
  const services = composeServices(rendered);
  validateComposeApplications(mode, services);
  const redis = Object.hasOwn(services, 'redis') ? record(services.redis, 'services.redis') : null;

  if (mode === 'local') {
    if (redis === null) fail('Compose local lacks Redis');
    if (redis.image !== expectedImage) fail('Compose local uses an unexpected Redis image');
    if (Object.hasOwn(redis, 'ports')) fail('Compose local publishes Redis to the host');
    if (!Object.hasOwn(redis, 'healthcheck')) fail('Compose local lacks a Redis healthcheck');
    if (redis.read_only !== true) fail('Compose local Redis root filesystem must be read-only');
    const networks = record(redis.networks, 'services.redis.networks');
    if (!Object.hasOwn(networks, 'internal-net')) {
      fail('Compose local Redis must only use internal-net');
    }
  } else if (redis !== null) {
    fail(`Compose ${mode} unexpectedly contains a Redis workload`);
  }

  if (mode === 'external') {
    const networks = record(rendered.networks, 'compose.networks');
    if (!Object.hasOwn(networks, 'redis-external-net')) {
      fail('Compose external lacks the dedicated Redis egress network');
    }
  }
}

function validateClusterApplications(mode: RedisMode, rendered: string): void {
  for (const serviceName of ['authorization', 'backend']) {
    const deployment =
      resource(rendered, 'Deployment', serviceName) ??
      fail(`Cluster ${mode} lacks Deployment/${serviceName}`);
    if (!deployment.includes(`name: REDIS_MODE\n`) || !deployment.includes(`value: ${mode}`)) {
      fail(`Cluster ${mode} does not configure ${serviceName}`);
    }
    if (mode === 'disabled') {
      if (
        deployment.includes('name: REDIS_URL_FILE') ||
        deployment.includes('zglosto-redis-credentials')
      ) {
        fail(`Cluster disabled leaks Redis configuration into ${serviceName}`);
      }
      continue;
    }
    for (const fragment of [
      'name: REDIS_URL_FILE',
      'name: RATE_LIMIT_HMAC_KEY_FILE',
      'secretName: zglosto-redis-credentials',
      'optional: false',
      'defaultMode: 288',
    ]) {
      if (!deployment.includes(fragment)) {
        fail(`Cluster ${mode}/${serviceName} lacks ${fragment}`);
      }
    }
    if (mode === 'external' && !deployment.includes('secretName: zglosto-redis-external-ca')) {
      fail(`Cluster external/${serviceName} lacks the Redis CA`);
    }
  }
}

function validateCluster(
  mode: RedisMode,
  path: string,
  expectedImage: string,
  platform: string,
): void {
  const rendered = cluster(path);
  if (/^kind:\s*Secret\s*$/mu.test(rendered)) {
    fail(`${platform}/${mode} renders secret values`);
  }
  validateClusterApplications(mode, rendered);
  const redis = resource(rendered, 'StatefulSet', 'redis');
  if (mode === 'local') {
    if (redis === null) fail(`${platform}/local lacks StatefulSet/redis`);
    for (const fragment of [
      `image: ${expectedImage}`,
      'readOnlyRootFilesystem: true',
      'livenessProbe:',
      'readinessProbe:',
      'secretName: zglosto-redis-acl',
      'secretName: zglosto-redis-credentials',
      'cat /run/secrets/redis/url',
      '--maxmemory-policy',
      'allkeys-lru',
    ]) {
      if (!redis.includes(fragment)) fail(`${platform}/local Redis lacks ${fragment}`);
    }
    if (resource(rendered, 'Service', 'redis') === null) {
      fail(`${platform}/local lacks Service/redis`);
    }
    if (resource(rendered, 'NetworkPolicy', 'allow-redis') === null) {
      fail(`${platform}/local lacks ingress policy for Redis`);
    }
  } else if (redis !== null) {
    fail(`${platform}/${mode} unexpectedly contains StatefulSet/redis`);
  }
  if (
    mode === 'external' &&
    resource(rendered, 'NetworkPolicy', 'allow-applications-to-external-redis') === null
  ) {
    fail(`${platform}/external lacks the external Redis egress policy`);
  }
}

const contract = record(
  JSON.parse(readFileSync('deploy/redis-profile-contract.json', 'utf8')) as unknown,
  'contract',
);
if (
  contract.schemaVersion !== 1 ||
  contract.phase !== '10.9' ||
  contract.status !== 'implemented'
) {
  fail('contract must identify implemented Phase 10 step 9');
}
const expectedImage = stringValue(contract.image, 'contract.image');
const modes = record(contract.modes, 'contract.modes');

for (const mode of ['disabled', 'local', 'external'] as const) {
  const definition = record(modes[mode], `modes.${mode}`);
  validateCompose(mode, stringArray(definition.compose, `modes.${mode}.compose`), expectedImage);
  const clusters = record(definition.clusters, `modes.${mode}.clusters`);
  for (const platform of ['kubernetes', 'k3s'] as const) {
    validateCluster(
      mode,
      stringValue(clusters[platform], `modes.${mode}.clusters.${platform}`),
      expectedImage,
      platform,
    );
  }
}

const productionLocal = compose(
  [
    'docker-compose.no-rustfs.yml',
    'docker-compose.production.yml',
    'docker-compose.redis.local.yml',
  ],
  '.env.production.example',
);
const productionRedis = record(composeServices(productionLocal).redis, 'production.services.redis');
if (productionRedis.image !== expectedImage) {
  fail('production local Redis image must use the contract-pinned version');
}
if (
  productionRedis.restart !== 'always' ||
  productionRedis.read_only !== true ||
  productionRedis.init !== true
) {
  fail('production local Redis lacks lifecycle or filesystem hardening');
}

console.log(
  'Redis profile policy OK: disabled, local and external are isolated and consistent across Compose, Kubernetes and K3s.',
);
