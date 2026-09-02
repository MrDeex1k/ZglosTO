import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;
type ObjectStorageMode = 'external' | 'local';
type OptionalMode = 'disabled' | 'external' | 'local';
type Modes = {
  objectStorage: ObjectStorageMode;
  redis: OptionalMode;
  observability: OptionalMode;
  llm: OptionalMode;
};
type Options = {
  environmentFile: string;
  imagesEnvironmentFile: string;
  manifestFile: string | null;
  inspectLocalImages: boolean;
  matrix: boolean;
  modes: Modes;
};

const coreServices = [
  'authorization',
  'backend',
  'database',
  'frontend',
  'llm_gateway',
  'media_worker',
  'nginx',
  'pgbouncer',
  'rabbitmq',
];
const imageRepositories: Readonly<Record<string, string>> = {
  AUTHORIZATION_IMAGE: 'zglosto/authorization',
  BACKEND_IMAGE: 'zglosto/backend',
  DATABASE_IMAGE: 'zglosto/database',
  FRONTEND_IMAGE: 'zglosto/frontend',
  LLM_GATEWAY_IMAGE: 'zglosto/llm-gateway',
  NGINX_IMAGE: 'zglosto/nginx',
  PGBOUNCER_IMAGE: 'zglosto/pgbouncer',
  RABBITMQ_IMAGE: 'zglosto/rabbitmq',
};
const serviceImageVariables: Readonly<Record<string, string>> = {
  authorization: 'AUTHORIZATION_IMAGE',
  backend: 'BACKEND_IMAGE',
  database: 'DATABASE_IMAGE',
  frontend: 'FRONTEND_IMAGE',
  llm_gateway: 'LLM_GATEWAY_IMAGE',
  media_worker: 'BACKEND_IMAGE',
  nginx: 'NGINX_IMAGE',
  pgbouncer: 'PGBOUNCER_IMAGE',
  rabbitmq: 'RABBITMQ_IMAGE',
};
const secretEnvironmentNames = [
  'BETTER_AUTH_SECRET',
  'DATABASE_DIRECT_URL',
  'DATABASE_URL',
  'PGBOUNCER_CLIENT_URL',
  'POSTGRES_PASSWORD',
  'RABBITMQ_DEFAULT_PASS',
  'RABBITMQ_DEFAULT_USER',
  'RABBITMQ_PASSWORD',
  'RABBITMQ_URL',
  'RABBITMQ_USER',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];
const requiredReadOnlyServices = [
  'authorization',
  'backend',
  'frontend',
  'llm_gateway',
  'media_worker',
  'nginx',
  'pgbouncer',
];

function fail(message: string): never {
  throw new Error(`Production Compose policy failed: ${message}`);
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, path: string): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : fail(`${path} must be a non-empty string`);
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown) => typeof entry === 'string')) {
    return fail(`${path} must be a string array`);
  }
  return value;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left: string, right: string) => left.localeCompare(right));
}

function assertSame(actual: Iterable<string>, expected: Iterable<string>, path: string): void {
  const normalizedActual = sorted(actual);
  const normalizedExpected = sorted(expected);
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${path} differs; expected ${normalizedExpected.join(', ')}, received ${normalizedActual.join(', ')}`,
    );
  }
}

function parseOptionalMode(value: string, path: string): OptionalMode {
  return value === 'disabled' || value === 'external' || value === 'local'
    ? value
    : fail(`${path} must be disabled, external or local`);
}

function parseObjectStorageMode(value: string): ObjectStorageMode {
  return value === 'external' || value === 'local'
    ? value
    : fail('--object-storage must be external or local');
}

function optionValue(cliArguments: string[], name: string): string | null {
  const index = cliArguments.indexOf(name);
  if (index === -1) return null;
  const value = cliArguments[index + 1];
  if (value === undefined || value.startsWith('--')) fail(`${name} requires a value`);
  return value;
}

function parseOptions(cliArguments: string[]): Options {
  const environmentFile =
    cliArguments.find((argument: string) => !argument.startsWith('--')) ??
    '.env.production.example';
  const knownValueOptions = [
    '--images-env',
    '--manifest',
    '--object-storage',
    '--redis',
    '--observability',
    '--llm',
  ];
  for (let index = 0; index < cliArguments.length; index += 1) {
    const argument = cliArguments[index];
    if (
      argument === environmentFile ||
      argument === '--matrix' ||
      argument === '--inspect-local-images'
    ) {
      continue;
    }
    if (knownValueOptions.includes(argument)) {
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) fail(`unsupported option ${argument}`);
  }

  return {
    environmentFile,
    imagesEnvironmentFile:
      optionValue(cliArguments, '--images-env') ?? 'deploy/compose/images.env.example',
    manifestFile: optionValue(cliArguments, '--manifest'),
    inspectLocalImages: cliArguments.includes('--inspect-local-images'),
    matrix: cliArguments.includes('--matrix'),
    modes: {
      objectStorage: parseObjectStorageMode(
        optionValue(cliArguments, '--object-storage') ?? 'local',
      ),
      redis: parseOptionalMode(optionValue(cliArguments, '--redis') ?? 'disabled', '--redis'),
      observability: parseOptionalMode(
        optionValue(cliArguments, '--observability') ?? 'disabled',
        '--observability',
      ),
      llm: parseOptionalMode(optionValue(cliArguments, '--llm') ?? 'disabled', '--llm'),
    },
  };
}

function parseEnvironmentFile(path: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [index, rawLine] of readFileSync(path, 'utf8').split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) fail(`${path}:${String(index + 1)} is not NAME=value`);
    const name = line.slice(0, separator);
    if (result.has(name)) fail(`${path} defines ${name} more than once`);
    result.set(name, line.slice(separator + 1));
  }
  return result;
}

function validateImageEnvironment(path: string): Map<string, string> {
  const environment = parseEnvironmentFile(path);
  assertSame(environment.keys(), Object.keys(imageRepositories), `${path} variables`);
  for (const [name, repository] of Object.entries(imageRepositories)) {
    const reference = environment.get(name) ?? fail(`${path} lacks ${name}`);
    const pattern = new RegExp(
      `^${repository.replace('/', '\\/')}:[A-Za-z0-9_.-]+-(?:amd64|arm64)-[a-f0-9]{12}$`,
      'u',
    );
    if (!pattern.test(reference)) {
      fail(`${name} must be a native immutable local reference under ${repository}`);
    }
  }
  return environment;
}

function modeFiles(contract: JsonRecord, area: keyof Modes, mode: string): string[] {
  const modes = asRecord(contract.modes, 'contract.modes');
  const areaContract = asRecord(modes[area], `contract.modes.${area}`);
  const modeContract = asRecord(areaContract[mode], `contract.modes.${area}.${mode}`);
  return asStringArray(modeContract.files, `contract.modes.${area}.${mode}.files`);
}

function expectedModuleServices(contract: JsonRecord, modes: Modes): string[] {
  const result: string[] = [];
  for (const [area, mode] of Object.entries(modes)) {
    const areaContract = asRecord(asRecord(contract.modes, 'contract.modes')[area], area);
    const modeContract = asRecord(areaContract[mode], `${area}.${mode}`);
    result.push(...asStringArray(modeContract.services, `${area}.${mode}.services`));
  }
  return result;
}

function renderProductionCompose(contract: JsonRecord, options: Options, modes: Modes): JsonRecord {
  const files = [
    ...asStringArray(contract.baseFiles, 'contract.baseFiles'),
    ...modeFiles(contract, 'objectStorage', modes.objectStorage),
    ...modeFiles(contract, 'redis', modes.redis),
    ...modeFiles(contract, 'observability', modes.observability),
    ...modeFiles(contract, 'llm', modes.llm),
  ];
  const composeArguments = [
    'compose',
    '--project-directory',
    process.cwd(),
    '--env-file',
    options.environmentFile,
    '--env-file',
    options.imagesEnvironmentFile,
  ];
  for (const file of files) composeArguments.push('--file', file);
  composeArguments.push('config', '--format', 'json');

  const environment = { ...process.env };
  for (const name of Object.keys(imageRepositories)) delete environment[name];
  Object.assign(environment, {
    GRAFANA_ADMIN_PASSWORD_FILE: 'tests/fixtures/secrets/better_auth_secret',
    LLM_EXTERNAL_API_KEY_FILE: 'tests/fixtures/llm/api-key',
    LLM_EXTERNAL_MODEL: 'municipal-classifier',
    LLM_EXTERNAL_URL: 'https://llm.example.invalid/v1',
    OTEL_EXTERNAL_AUTHORIZATION_FILE: 'tests/fixtures/secrets/better_auth_secret',
    OTEL_EXTERNAL_ENDPOINT: 'https://otel.example.invalid',
    RATE_LIMIT_HMAC_KEY_SECRET_FILE: 'tests/fixtures/redis/rate-limit-hmac',
    REDIS_ACL_FILE: 'tests/fixtures/redis/users.acl',
    REDIS_TLS_CA_FILE: 'tests/fixtures/redis/ca.crt',
    REDIS_URL_SECRET_FILE: 'tests/fixtures/redis/url',
  });
  const output = execFileSync('docker', composeArguments, {
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return asRecord(JSON.parse(output) as unknown, 'compose');
}

function validateCoreService(
  serviceName: string,
  service: JsonRecord,
  imageEnvironment: Map<string, string>,
): void {
  const variable =
    serviceImageVariables[serviceName] ?? fail(`unknown core service ${serviceName}`);
  if (service.image !== imageEnvironment.get(variable)) {
    fail(`${serviceName} does not use ${variable} from the verified image environment`);
  }
  if (Object.hasOwn(service, 'build')) fail(`${serviceName} retains a build section`);
  if (service.pull_policy !== 'never') fail(`${serviceName} must never pull its local image`);
  if (service.restart !== 'always' || service.init !== true) {
    fail(`${serviceName} must use restart: always and init: true`);
  }
  if (
    typeof service.cpus !== 'number' ||
    typeof service.mem_limit !== 'string' ||
    typeof service.pids_limit !== 'number'
  ) {
    fail(`${serviceName} must declare CPU, memory and PID limits`);
  }
  const securityOptions = service.security_opt;
  if (!Array.isArray(securityOptions) || !securityOptions.includes('no-new-privileges:true')) {
    fail(`${serviceName} must disable privilege escalation`);
  }
  const logging = asRecord(service.logging, `services.${serviceName}.logging`);
  const loggingOptions = asRecord(logging.options, `services.${serviceName}.logging.options`);
  if (
    logging.driver !== 'local' ||
    loggingOptions['max-size'] !== '10m' ||
    loggingOptions['max-file'] !== '5'
  ) {
    fail(`${serviceName} must use bounded local log rotation`);
  }

  const environment = Object.hasOwn(service, 'environment')
    ? asRecord(service.environment, `services.${serviceName}.environment`)
    : {};
  for (const name of secretEnvironmentNames) {
    if (Object.hasOwn(environment, name)) {
      fail(`${serviceName} exposes secret environment variable ${name}`);
    }
  }
  if (requiredReadOnlyServices.includes(serviceName)) {
    if (service.read_only !== true) fail(`${serviceName} must use a read-only root filesystem`);
    if (!Array.isArray(service.cap_drop) || !service.cap_drop.includes('ALL')) {
      fail(`${serviceName} must drop every Linux capability`);
    }
  }
}

function validateOptionalServiceHardening(serviceName: string, service: JsonRecord): void {
  if (service.restart !== 'always' || service.init !== true) {
    fail(`${serviceName} must use restart: always and init: true`);
  }
  if (service.pull_policy !== 'missing') {
    fail(`${serviceName} must pull a pinned external image only when it is missing locally`);
  }
  if (typeof service.user !== 'string' || service.user.length === 0) {
    fail(`${serviceName} must declare its non-root runtime identity`);
  }
  if (
    typeof service.cpus !== 'number' ||
    typeof service.mem_limit !== 'string' ||
    typeof service.pids_limit !== 'number'
  ) {
    fail(`${serviceName} must declare CPU, memory and PID limits`);
  }
  if (service.read_only !== true) {
    fail(`${serviceName} must use a read-only root filesystem`);
  }
  if (!Array.isArray(service.cap_drop) || !service.cap_drop.includes('ALL')) {
    fail(`${serviceName} must drop every Linux capability`);
  }
  if (
    !Array.isArray(service.security_opt) ||
    !service.security_opt.includes('no-new-privileges:true')
  ) {
    fail(`${serviceName} must disable privilege escalation`);
  }
  if (!Array.isArray(service.tmpfs) || service.tmpfs.length === 0) {
    fail(`${serviceName} must declare bounded temporary filesystems`);
  }
  if (service.stop_grace_period !== '30s' && service.stop_grace_period !== '10s') {
    fail(`${serviceName} must declare an explicit shutdown grace period`);
  }
  const healthcheck = asRecord(service.healthcheck, `services.${serviceName}.healthcheck`);
  if (!Array.isArray(healthcheck.test) || healthcheck.test.length === 0) {
    fail(`${serviceName} must expose a container-local healthcheck`);
  }
  const logging = asRecord(service.logging, `services.${serviceName}.logging`);
  const loggingOptions = asRecord(logging.options, `services.${serviceName}.logging.options`);
  if (
    logging.driver !== 'local' ||
    loggingOptions['max-size'] !== '10m' ||
    loggingOptions['max-file'] !== '5'
  ) {
    fail(`${serviceName} must use bounded local log rotation`);
  }
}

function serviceNetworks(service: JsonRecord, path: string): Set<string> {
  const networks = asRecord(service.networks, `${path}.networks`);
  return new Set(Object.keys(networks));
}

function validateModes(
  contract: JsonRecord,
  compose: JsonRecord,
  modes: Modes,
  imageEnvironment: Map<string, string>,
): void {
  const services = asRecord(compose.services, 'services');
  assertSame(
    Object.keys(services),
    [...coreServices, ...expectedModuleServices(contract, modes)],
    'production services',
  );
  for (const serviceName of coreServices) {
    validateCoreService(
      serviceName,
      asRecord(services[serviceName], `services.${serviceName}`),
      imageEnvironment,
    );
  }

  const nginx = asRecord(services.nginx, 'services.nginx');
  const nginxPorts = nginx.ports;
  if (
    !Array.isArray(nginxPorts) ||
    nginxPorts.length !== 1 ||
    asRecord(nginxPorts[0], 'services.nginx.ports[0]').target !== 8443
  ) {
    fail('Nginx must publish exactly the HTTPS target port 8443');
  }
  for (const [serviceName, value] of Object.entries(services)) {
    if (serviceName === 'nginx' || (serviceName === 'grafana' && modes.observability === 'local')) {
      continue;
    }
    if (Object.hasOwn(asRecord(value, `services.${serviceName}`), 'ports')) {
      fail(`${serviceName} unexpectedly publishes a host port`);
    }
  }

  const networks = asRecord(compose.networks, 'networks');
  for (const networkName of ['internal-net', 'llm-runtime-net']) {
    if (asRecord(networks[networkName], `networks.${networkName}`).internal !== true) {
      fail(`${networkName} must be internal`);
    }
  }

  const backend = asRecord(services.backend, 'services.backend');
  const worker = asRecord(services.media_worker, 'services.media_worker');
  const backendEnvironment = asRecord(backend.environment, 'services.backend.environment');
  const workerEnvironment = asRecord(worker.environment, 'services.media_worker.environment');
  if (modes.objectStorage === 'local') {
    const rustfs = asRecord(services.rustfs, 'services.rustfs');
    validateOptionalServiceHardening('rustfs', rustfs);
    const rustfsEnvironment = asRecord(rustfs.environment, 'services.rustfs.environment');
    if (Object.hasOwn(rustfs, 'ports') || Object.hasOwn(rustfs, 'expose')) {
      fail('local RustFS API must remain private on the internal Docker network');
    }
    if (
      rustfs.image !== 'rustfs/rustfs:1.0.0-rc.5' ||
      backendEnvironment.S3_ENDPOINT !== 'http://rustfs:9000' ||
      workerEnvironment.S3_ENDPOINT !== 'http://rustfs:9000' ||
      rustfsEnvironment.RUSTFS_ACCESS_KEY_FILE !== '/run/secrets/s3/access-key-id' ||
      rustfsEnvironment.RUSTFS_SECRET_KEY_FILE !== '/run/secrets/s3/secret-access-key' ||
      Object.hasOwn(rustfsEnvironment, 'RUSTFS_ACCESS_KEY') ||
      Object.hasOwn(rustfsEnvironment, 'RUSTFS_SECRET_KEY')
    ) {
      fail('local Object Storage must use pinned internal RustFS with file-backed credentials');
    }
  } else {
    if (Object.hasOwn(services, 'rustfs')) fail('external Object Storage contains RustFS');
    for (const [name, service] of [
      ['backend', backend],
      ['media_worker', worker],
    ] as const) {
      if (!serviceNetworks(service, `services.${name}`).has('object-storage-external-net')) {
        fail(`${name} lacks external Object Storage egress`);
      }
    }
  }

  const authorization = asRecord(services.authorization, 'services.authorization');
  for (const [name, service] of [
    ['authorization', authorization],
    ['backend', backend],
  ] as const) {
    const environment = asRecord(service.environment, `services.${name}.environment`);
    if (environment.REDIS_MODE !== modes.redis) {
      fail(`${name} does not use REDIS_MODE=${modes.redis}`);
    }
  }
  if (Object.hasOwn(services, 'redis') !== (modes.redis === 'local')) {
    fail(`Redis service presence differs for ${modes.redis}`);
  }
  if (modes.redis === 'local') {
    validateOptionalServiceHardening('redis', asRecord(services.redis, 'services.redis'));
  }
  if (
    modes.redis === 'external' &&
    (!serviceNetworks(authorization, 'services.authorization').has('redis-external-net') ||
      !serviceNetworks(backend, 'services.backend').has('redis-external-net'))
  ) {
    fail('external Redis lacks application egress');
  }

  const expectedObservabilityServices =
    modes.observability === 'local'
      ? ['alertmanager', 'grafana', 'loki', 'otel-collector', 'prometheus', 'tempo']
      : modes.observability === 'external'
        ? ['otel-collector']
        : [];
  for (const name of expectedObservabilityServices) {
    if (!Object.hasOwn(services, name)) fail(`${modes.observability} observability lacks ${name}`);
    validateOptionalServiceHardening(name, asRecord(services[name], `services.${name}`));
  }
  if (
    modes.observability === 'external' &&
    !serviceNetworks(
      asRecord(services['otel-collector'], 'services.otel-collector'),
      'services.otel-collector',
    ).has('observability-external-net')
  ) {
    fail('external observability Collector lacks egress');
  }

  const gateway = asRecord(services.llm_gateway, 'services.llm_gateway');
  const llmEnvironment = asRecord(gateway.environment, 'services.llm_gateway.environment');
  const expectedRuntime =
    modes.llm === 'local'
      ? 'docker-model-runner'
      : modes.llm === 'external'
        ? 'openai-compatible'
        : 'disabled';
  if (llmEnvironment.LLM_RUNTIME !== expectedRuntime) {
    fail(`LLM ${modes.llm} rendered runtime ${String(llmEnvironment.LLM_RUNTIME)}`);
  }
  if (
    modes.llm === 'external' &&
    (!serviceNetworks(gateway, 'services.llm_gateway').has('llm-external-net') ||
      !JSON.stringify(gateway.secrets).includes('/run/secrets/llm/api-key'))
  ) {
    fail('external LLM lacks isolated API-key secret or egress');
  }
}

function validateManifest(
  manifestPath: string,
  imageEnvironment: Map<string, string>,
  inspectLocalImages: boolean,
): void {
  const manifest = asRecord(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown, 'manifest');
  if (
    manifest.schemaVersion !== 1 ||
    manifest.phase !== '11.9' ||
    manifest.status !== 'candidate'
  ) {
    fail('build manifest must be a Phase 11.9 candidate');
  }
  if (!Array.isArray(manifest.artifacts)) fail('manifest.artifacts must be an array');
  const references = new Map<string, { imageId: string; reference: string }>();
  for (const [index, value] of manifest.artifacts.entries()) {
    const artifact = asRecord(value, `manifest.artifacts[${String(index)}]`);
    references.set(asString(artifact.id, 'artifact.id'), {
      imageId: asString(artifact.imageId, 'artifact.imageId'),
      reference: asString(artifact.reference, 'artifact.reference'),
    });
  }
  const artifactVariables: Readonly<Record<string, string>> = {
    authorization: 'AUTHORIZATION_IMAGE',
    backend: 'BACKEND_IMAGE',
    database: 'DATABASE_IMAGE',
    frontend: 'FRONTEND_IMAGE',
    llm_gateway: 'LLM_GATEWAY_IMAGE',
    nginx: 'NGINX_IMAGE',
    pgbouncer: 'PGBOUNCER_IMAGE',
    rabbitmq: 'RABBITMQ_IMAGE',
  };
  assertSame(references.keys(), Object.keys(artifactVariables), 'manifest artifact ids');
  for (const [id, variable] of Object.entries(artifactVariables)) {
    const artifact = references.get(id) ?? fail(`manifest lacks ${id}`);
    if (artifact.reference !== imageEnvironment.get(variable)) {
      fail(`manifest ${id} differs from ${variable}`);
    }
    if (inspectLocalImages) {
      const imageId = execFileSync(
        'docker',
        ['image', 'inspect', '--format', '{{.Id}}', artifact.reference],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim();
      if (imageId !== artifact.imageId)
        fail(`${artifact.reference} no longer matches its manifest`);
    }
  }
}

function validatePrivateStateFile(path: string): void {
  if ((statSync(path).mode & 0o077) !== 0) {
    fail(`${path} must not be readable or writable by group/other`);
  }
}

const options = parseOptions(process.argv.slice(2));
const contract = asRecord(
  JSON.parse(readFileSync('deploy/production-compose-modules.json', 'utf8')) as unknown,
  'contract',
);
if (
  contract.schemaVersion !== 1 ||
  contract.phase !== '11.10' ||
  contract.status !== 'implemented' ||
  contract.forbiddenMode !== 'both' ||
  contract.supportedCombinationCount !== 54
) {
  fail('contract must identify implemented Phase 11 step 10 and all 54 supported combinations');
}

const imageEnvironment = validateImageEnvironment(options.imagesEnvironmentFile);
if (options.manifestFile !== null) {
  validatePrivateStateFile(options.imagesEnvironmentFile);
  validatePrivateStateFile(options.manifestFile);
  validateManifest(options.manifestFile, imageEnvironment, options.inspectLocalImages);
} else if (options.inspectLocalImages) {
  fail('--inspect-local-images requires --manifest');
}

const combinations: Modes[] = options.matrix
  ? (['local', 'external'] as const).flatMap((objectStorage: ObjectStorageMode) =>
      (['disabled', 'local', 'external'] as const).flatMap((redis: OptionalMode) =>
        (['disabled', 'local', 'external'] as const).flatMap((observability: OptionalMode) =>
          (['disabled', 'local', 'external'] as const).map((llm: OptionalMode) => ({
            objectStorage,
            redis,
            observability,
            llm,
          })),
        ),
      ),
    )
  : [options.modes];
if (combinations.length !== (options.matrix ? 54 : 1)) {
  fail('mode matrix has an unexpected size');
}

for (const modes of combinations) {
  validateModes(
    contract,
    renderProductionCompose(contract, options, modes),
    modes,
    imageEnvironment,
  );
}

console.log(
  `Production Compose policy passed for ${String(combinations.length)} module combination(s) using verified native local images and default RustFS.`,
);
