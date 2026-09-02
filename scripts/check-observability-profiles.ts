import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type Mode = 'disabled' | 'external' | 'local';
type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Observability profile policy failed: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown) => typeof entry === 'string')) {
    return fail(`${path} must be a string array`);
  }
  return value;
}

function compose(files: string[], environment: Record<string, string> = {}): string {
  const args = ['compose', '--env-file', '.env.example'];
  for (const file of files) args.push('-f', file);
  args.push('config');
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

function composeServices(files: string[], environment: Record<string, string> = {}): string[] {
  const args = ['compose', '--env-file', '.env.example'];
  for (const file of files) args.push('-f', file);
  args.push('config', '--services');
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })
    .trim()
    .split('\n')
    .filter((name: string) => name.length > 0);
}

function cluster(path: string): string {
  return execFileSync('kubectl', ['kustomize', path], { encoding: 'utf8' });
}

function workloadNames(rendered: string): string[] {
  return rendered
    .split(/^---\s*$/mu)
    .filter((document: string) => /^kind:\s*(?:Deployment|StatefulSet)\s*$/mu.test(document))
    .flatMap((document: string) => {
      const name = /^metadata:\s*$[\s\S]*?^\s{2}name:\s*([a-z0-9-]+)\s*$/mu.exec(document)?.[1];
      return name === undefined ? [] : [name];
    });
}

function validateMode(
  mode: Mode,
  rendered: string,
  names: string[],
  localBackends: string[],
  collector: boolean,
): void {
  if (names.includes('otel-collector') !== collector) {
    fail(`${mode} collector presence differs from the contract`);
  }
  for (const backend of ['prometheus', 'loki', 'tempo', 'grafana', 'alertmanager']) {
    if (names.includes(backend) !== localBackends.includes(backend)) {
      fail(`${mode} backend ${backend} presence differs from the contract`);
    }
  }
  if (
    rendered.includes('OBSERVABILITY_MODE: both') ||
    rendered.includes('OBSERVABILITY_MODE: "both"')
  ) {
    fail('the forbidden both mode was rendered');
  }
  if (mode !== 'disabled') {
    for (const service of ['authorization', 'backend', 'media_worker', 'llm_gateway']) {
      if (
        !rendered.includes(`OTEL_SERVICE_NAME: ${service}`) &&
        !new RegExp(`name:\\s+OTEL_SERVICE_NAME\\s+value:\\s+${service}(?:\\s|$)`, 'mu').test(
          rendered,
        )
      ) {
        fail(`${mode} lacks OTEL_SERVICE_NAME=${service}`);
      }
    }
  }
}

const contract = record(
  JSON.parse(readFileSync('deploy/observability-contract.json', 'utf8')) as unknown,
  'contract',
);
if (contract.phase !== '9.8' || contract.forbiddenMode !== 'both') {
  fail('contract must identify Phase 9 step 8 and forbid both');
}
const modes = record(contract.modes, 'modes');
const composeProfiles = record(contract.compose, 'compose');
const clusterOverlays = record(contract.clusterOverlays, 'clusterOverlays');
const rustfsClusterOverlays = record(contract.rustfsClusterOverlays, 'rustfsClusterOverlays');

const composeEnvironment = {
  GRAFANA_ADMIN_PASSWORD_FILE: 'tests/fixtures/secrets/better_auth_secret',
  OTEL_EXTERNAL_AUTHORIZATION_FILE: 'tests/fixtures/secrets/better_auth_secret',
  OTEL_EXTERNAL_ENDPOINT: 'https://otel.example.invalid',
};

for (const mode of ['disabled', 'external', 'local'] as const) {
  const modeContract = record(modes[mode], `modes.${mode}`);
  const renderedCompose = compose(
    strings(composeProfiles[mode], `compose.${mode}`),
    composeEnvironment,
  );
  validateMode(
    mode,
    renderedCompose,
    composeServices(strings(composeProfiles[mode], `compose.${mode}`), composeEnvironment),
    strings(modeContract.localBackends, `modes.${mode}.localBackends`),
    modeContract.collector === true,
  );

  for (const platform of ['kubernetes', 'k3s'] as const) {
    const overlays = record(clusterOverlays[platform], `clusterOverlays.${platform}`);
    const overlay = overlays[mode];
    if (typeof overlay !== 'string') fail(`missing ${platform}/${mode} overlay`);
    validateMode(
      mode,
      cluster(overlay),
      workloadNames(cluster(overlay)),
      strings(modeContract.localBackends, `modes.${mode}.localBackends`),
      modeContract.collector === true,
    );
  }
}

for (const platform of ['kubernetes', 'k3s'] as const) {
  const overlays = record(rustfsClusterOverlays[platform], `rustfsClusterOverlays.${platform}`);
  for (const mode of ['external', 'local'] as const) {
    const overlay = overlays[mode];
    if (typeof overlay !== 'string') fail(`missing RustFS ${platform}/${mode} overlay`);
    const rendered = cluster(overlay);
    if (!workloadNames(rendered).includes('rustfs')) {
      fail(`RustFS ${platform}/${mode} composition lacks rustfs`);
    }
    const modeContract = record(modes[mode], `modes.${mode}`);
    validateMode(
      mode,
      rendered,
      workloadNames(rendered),
      strings(modeContract.localBackends, `modes.${mode}.localBackends`),
      true,
    );
  }
}

const externalCompose = compose(
  strings(composeProfiles.external, 'compose.external'),
  composeEnvironment,
);
if (
  !externalCompose.includes('/run/secrets/otel_external_authorization') ||
  !externalCompose.includes('OTEL_EXTERNAL_ENDPOINT: https://otel.example.invalid')
) {
  fail('external mode does not isolate endpoint credentials in the Collector');
}

const localCompose = compose(strings(composeProfiles.local, 'compose.local'), composeEnvironment);
for (const image of [
  'otel/opentelemetry-collector-contrib:0.159.0',
  'prom/prometheus:v3.14.0',
  'grafana/loki:3.7.7',
  'grafana/tempo:3.0.3',
  'grafana/grafana:13.2.1',
  'prom/alertmanager:v0.34.0',
]) {
  if (!localCompose.includes(`image: ${image}`)) fail(`local mode lacks pinned ${image}`);
}

const failureProbe = spawnSync(
  process.execPath,
  [
    '--import',
    './packages/observability/src/register.ts',
    '--eval',
    'console.log("product-ready")',
  ],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      OBSERVABILITY_MODE: 'external',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
      OTEL_SERVICE_NAME: 'failure-probe',
    },
  },
);
if (failureProbe.status !== 0 || !failureProbe.stdout.includes('product-ready')) {
  fail('an unavailable Collector blocked product startup');
}

if (
  readFileSync('authorization/src/logger.ts', 'utf8').includes('appendFile') ||
  readFileSync('authorization/src/logger.ts', 'utf8').includes('auth_log.txt')
) {
  fail('Authorization still writes operational logs to a file');
}

console.log(
  'Observability profile policy OK: disabled, external and local are exclusive, deterministic and non-blocking for Compose, Kubernetes and K3s.',
);
