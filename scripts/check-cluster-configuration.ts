import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

const profiles = ['kubernetes', 'k3s'] as const;
const sensitiveRuntimeKeys = [
  'BETTER_AUTH_SECRET',
  'DATABASE_DIRECT_URL',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'RABBITMQ_PASSWORD',
  'RABBITMQ_URL',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

function fail(message: string): never {
  throw new Error(`Cluster configuration policy failed: ${message}`);
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }

  return value as JsonRecord;
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown) => typeof entry === 'string')) {
    return fail(`${path} must be an array of strings`);
  }

  return value;
}

function render(profile: (typeof profiles)[number]): string {
  return execFileSync('kubectl', ['kustomize', `k8s/overlays/${profile}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function documents(rendered: string): string[] {
  return rendered.split(/^---\s*$/mu);
}

function resourceDocument(rendered: string, kind: string, namePrefix: string): string {
  const match = documents(rendered).find(
    (document: string) =>
      new RegExp(`^kind:\\s*${kind}\\s*$`, 'mu').test(document) &&
      new RegExp(`^\\s{2}name:\\s*${namePrefix}[a-z0-9-]*\\s*$`, 'mu').test(document),
  );

  return match ?? fail(`${kind}/${namePrefix} was not rendered`);
}

function count(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

function validateGeneratedConfigMaps(profile: string, rendered: string): void {
  const runtime = resourceDocument(rendered, 'ConfigMap', 'zglosto-config-');
  const whiteLabel = resourceDocument(rendered, 'ConfigMap', 'zglosto-white-label-');
  const canonicalWhiteLabel = readFileSync('config/white-label/zglosto.yaml', 'utf8').trim();

  for (const [name, document] of [
    ['runtime', runtime],
    ['white-label', whiteLabel],
  ] as const) {
    if (!/^immutable:\s*true\s*$/mu.test(document)) {
      fail(`${profile} ${name} ConfigMap must be immutable`);
    }
  }

  if (!runtime.includes('NODE_ENV: production')) {
    fail(`${profile} runtime ConfigMap must set NODE_ENV=production`);
  }
  if (!runtime.includes('WHITE_LABEL_CONFIG: /app/config/city.yaml')) {
    fail(`${profile} must use the canonical White Label mount path`);
  }
  for (const key of sensitiveRuntimeKeys) {
    if (new RegExp(`^\\s{2}${key}:`, 'mu').test(runtime)) {
      fail(`${profile} exposes ${key} in a ConfigMap`);
    }
  }
  const whiteLabelBlock = /^  city\.yaml: \|\n([\s\S]*?)^immutable:/mu.exec(whiteLabel)?.[1];
  const renderedWhiteLabel = whiteLabelBlock
    ?.split('\n')
    .map((line: string) => line.replace(/^ {4}/u, ''))
    .join('\n')
    .trim();
  if (renderedWhiteLabel !== canonicalWhiteLabel) {
    fail(`${profile} White Label ConfigMap differs from the canonical YAML`);
  }
}

function validateSecretDelivery(
  profile: string,
  rendered: string,
  expectedSecrets: Set<string>,
): void {
  if (/^kind:\s*Secret\s*$/mu.test(rendered)) {
    fail(`${profile} renders a Secret`);
  }
  if (/\bsecretKeyRef:/u.test(rendered) || /\benvFrom:/u.test(rendered)) {
    fail(`${profile} must deliver secrets only through mounted read-only files`);
  }

  const renderedSecretNames = new Set(
    [...rendered.matchAll(/^\s+secretName:\s*([a-z0-9-]+)\s*$/gmu)].map(
      (match: RegExpExecArray) => match[1],
    ),
  );
  for (const secretName of renderedSecretNames) {
    if (!expectedSecrets.has(secretName)) {
      fail(`${profile} references undocumented Secret/${secretName}`);
    }
  }
  for (const secretName of expectedSecrets) {
    if (!renderedSecretNames.has(secretName)) {
      fail(`${profile} does not consume contracted Secret/${secretName}`);
    }
  }

  const volumeCount = [...rendered.matchAll(/^\s+secret:\s*$/gmu)].length;
  if (count(rendered, 'optional: false') < volumeCount) {
    fail(`${profile} contains an optional Secret volume`);
  }
  if (count(rendered, 'defaultMode: 288') < volumeCount) {
    fail(`${profile} must mount every Secret with mode 0440`);
  }

  for (const variable of [
    'BETTER_AUTH_SECRET_FILE',
    'DATABASE_URL_FILE',
    'POSTGRES_PASSWORD_FILE',
    'RABBITMQ_URL_FILE',
    'S3_ACCESS_KEY_ID_FILE',
    'S3_SECRET_ACCESS_KEY_FILE',
  ]) {
    if (!rendered.includes(`name: ${variable}`)) {
      fail(`${profile} does not expose the required file reference ${variable}`);
    }
  }
}

function validateWhiteLabelConsumers(profile: string, rendered: string): void {
  for (const workload of ['authorization', 'backend']) {
    const deployment = resourceDocument(rendered, 'Deployment', workload);
    if (
      !deployment.includes('mountPath: /app/config') ||
      !deployment.includes('name: white-label-config') ||
      !deployment.includes('optional: false')
    ) {
      fail(`${profile} Deployment/${workload} lacks the required White Label volume`);
    }
  }
}

const contract = asRecord(
  JSON.parse(readFileSync('deploy/cluster-secret-contract.json', 'utf8')) as unknown,
  'clusterSecretContract',
);
if (contract.schemaVersion !== 1 || contract.phase !== '9.4' || contract.status !== 'implemented') {
  fail('secret contract must identify implemented Phase 9 step 4');
}
const provisioning = asRecord(contract.provisioning, 'clusterSecretContract.provisioning');
if (
  provisioning.mode !== 'external-credentials-and-cert-manager-pki' ||
  provisioning.renderedByKustomize !== false ||
  provisioning.delivery !== 'read-only-files' ||
  provisioning.missingSecretPolicy !== 'workload-not-ready-no-fallback'
) {
  fail('external secret provisioning policy differs from Phase 9 step 4');
}

const secretContract = asRecord(contract.secrets, 'clusterSecretContract.secrets');
const expectedSecrets = new Set(Object.keys(secretContract));
for (const [secretName, rawDefinition] of Object.entries(secretContract)) {
  const definition = asRecord(rawDefinition, `clusterSecretContract.secrets.${secretName}`);
  const keys = asStringArray(definition.keys, `${secretName}.keys`);
  const currentConsumers = asStringArray(
    definition.currentConsumers,
    `${secretName}.currentConsumers`,
  );
  asStringArray(definition.plannedConsumers, `${secretName}.plannedConsumers`);
  if (keys.length === 0 || currentConsumers.length === 0) {
    fail(`${secretName} must define keys and at least one current consumer`);
  }
}

for (const profile of profiles) {
  const rendered = render(profile);
  validateGeneratedConfigMaps(profile, rendered);
  validateSecretDelivery(profile, rendered, expectedSecrets);
  validateWhiteLabelConsumers(profile, rendered);
}

console.log(
  'Cluster configuration policy OK: immutable White Label/runtime ConfigMaps and external file-mounted Secrets are consistent for Kubernetes and K3s.',
);
