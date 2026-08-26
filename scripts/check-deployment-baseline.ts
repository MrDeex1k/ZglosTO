import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Deployment baseline policy failed: ${message}`);
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

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown) => typeof entry === 'string')) {
    return fail(`${path} must be an array of strings`);
  }

  return value;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sorted(values: string[]): string[] {
  return [...values].sort((left: string, right: string) => left.localeCompare(right));
}

function assertSame(actual: string[], expected: string[], label: string): void {
  const normalizedActual = sorted(actual);
  const normalizedExpected = sorted(expected);

  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${label} differs.\nExpected: ${normalizedExpected.join(', ')}\nActual: ${normalizedActual.join(', ')}`,
    );
  }
}

function workloadNames(rendered: string): string[] {
  return rendered
    .split(/^---\s*$/mu)
    .filter((document: string) => /^kind:\s*(?:Deployment|StatefulSet)\s*$/mu.test(document))
    .map((document: string) => {
      const match = /^metadata:\s*$[\s\S]*?^\s{2}name:\s*([a-z0-9-]+)\s*$/mu.exec(document);
      return match === null ? fail('rendered workload has no metadata.name') : match[1];
    });
}

function validateServiceAccounts(rendered: string, expectedWorkloads: string[]): void {
  for (const workload of expectedWorkloads) {
    const workloadPattern = new RegExp(
      `kind:\\s*(?:Deployment|StatefulSet)[\\s\\S]*?metadata:[\\s\\S]*?name:\\s*${workload}[\\s\\S]*?serviceAccountName:\\s*${workload}(?:\\s|$)`,
      'u',
    );

    if (!workloadPattern.test(rendered)) {
      fail(`workload/${workload} must use its dedicated ServiceAccount`);
    }
  }
}

function validateRenderedProfile(
  profile: string,
  rendered: string,
  expectedWorkloads: string[],
  forbiddenComponents: string[],
): void {
  if (/(?:image:\s*\S*:latest(?:\s|$)|newTag:\s*latest(?:\s|$))/mu.test(rendered)) {
    fail(`${profile} renders a mutable latest image`);
  }

  if (/^kind:\s*Secret\s*$/mu.test(rendered)) {
    fail(`${profile} renders a Secret; production secrets must be provisioned externally`);
  }

  for (const forbidden of forbiddenComponents) {
    if (rendered.toLowerCase().includes(forbidden.toLowerCase())) {
      fail(`${profile} contains forbidden historical component: ${forbidden}`);
    }
  }

  if (!rendered.includes('app.kubernetes.io/part-of: zglosto')) {
    fail(`${profile} lacks the common app.kubernetes.io/part-of label`);
  }

  if (!rendered.includes(`app.kubernetes.io/platform: ${profile}`)) {
    fail(`${profile} lacks its app.kubernetes.io/platform label`);
  }

  assertSame(workloadNames(rendered), expectedWorkloads, `${profile} workloads`);
  validateServiceAccounts(rendered, expectedWorkloads);
}

function validateClusterProfile(profileName: string, profile: JsonRecord, rendered: string): void {
  const ingressClassName = asString(
    profile.ingressClassName,
    `clusterProfiles.${profileName}.ingressClassName`,
  );
  const ingressNamespace = asString(
    profile.ingressNamespace,
    `clusterProfiles.${profileName}.ingressNamespace`,
  );
  const ingressPodNameLabel = asString(
    profile.ingressPodNameLabel,
    `clusterProfiles.${profileName}.ingressPodNameLabel`,
  );
  const storageClassName = asString(
    profile.storageClassName,
    `clusterProfiles.${profileName}.storageClassName`,
  );

  const ingressMatches = [...rendered.matchAll(/^\s*ingressClassName:\s*([a-z0-9-]+)\s*$/gmu)].map(
    (match: RegExpExecArray) => match[1],
  );
  assertSame(ingressMatches, [ingressClassName], `${profileName} ingress classes`);

  const storageMatches = [...rendered.matchAll(/^\s*storageClassName:\s*([a-z0-9-]+)\s*$/gmu)].map(
    (match: RegExpExecArray) => match[1],
  );
  assertSame(
    storageMatches,
    [storageClassName, storageClassName, storageClassName],
    `${profileName} stateful storage classes`,
  );

  const namespaceSelector = `kubernetes.io/metadata.name: ${ingressNamespace}`;
  const selectorCount = rendered.split(namespaceSelector).length - 1;
  if (selectorCount < 1) {
    fail(
      `${profileName} must select ingress namespace ${ingressNamespace} in its ingress NetworkPolicy`,
    );
  }

  const podSelector = `app.kubernetes.io/name: ${ingressPodNameLabel}`;
  const podSelectorCount = rendered.split(podSelector).length - 1;
  if (podSelectorCount !== 1) {
    fail(
      `${profileName} must select ingress pods with app.kubernetes.io/name=${ingressPodNameLabel}`,
    );
  }
}

const parsedBaseline: unknown = JSON.parse(readFileSync('deploy/deployment-baseline.json', 'utf8'));
const baseline = asRecord(parsedBaseline, 'baseline');
const parsedClusterProfiles: unknown = JSON.parse(
  readFileSync('deploy/cluster-profiles.json', 'utf8'),
);
const clusterProfileContract = asRecord(parsedClusterProfiles, 'clusterProfiles');

if (baseline.schemaVersion !== 1 || baseline.phase !== '9.1') {
  fail('schemaVersion and phase must identify Phase 9 step 1');
}
if (clusterProfileContract.schemaVersion !== 1 || clusterProfileContract.phase !== '9.3') {
  fail('cluster profile contract must identify Phase 9 step 3');
}

const profiles = asRecord(baseline.profiles, 'profiles');
const compose = asRecord(profiles.compose, 'profiles.compose');
const kubernetes = asRecord(profiles.kubernetes, 'profiles.kubernetes');
const k3s = asRecord(profiles.k3s, 'profiles.k3s');
const sharedContracts = asRecord(baseline.sharedContracts, 'sharedContracts');
const clusterProfiles = asRecord(clusterProfileContract.profiles, 'clusterProfiles.profiles');
const kubernetesClusterProfile = asRecord(
  clusterProfiles.kubernetes,
  'clusterProfiles.profiles.kubernetes',
);
const k3sClusterProfile = asRecord(clusterProfiles.k3s, 'clusterProfiles.profiles.k3s');

if (sharedContracts.clusterPlatformContract !== 'deploy/cluster-profiles.json') {
  fail('deployment baseline must point to the Phase 9 step 3 cluster profile contract');
}
if (sharedContracts.imageProductionContract !== 'deploy/image-production-contract.json') {
  fail('deployment baseline must point to the Phase 11 image production contract');
}
if (sharedContracts.targetImagePolicy !== 'native-source-build-with-local-immutable-tag') {
  fail('deployment baseline must use locally built immutable release images');
}
if (
  sharedContracts.clusterSecretContract !== 'deploy/cluster-secret-contract.json' ||
  sharedContracts.clusterRuntimeConfig !== 'k8s/base/config/runtime.env' ||
  sharedContracts.clusterWhiteLabelSource !== 'config/white-label/zglosto.yaml'
) {
  fail('deployment baseline must point to the Phase 9 step 4 configuration contracts');
}
if (sharedContracts.clusterStatefulContract !== 'deploy/cluster-stateful-contract.json') {
  fail('deployment baseline must point to the Phase 9 step 5 stateful contract');
}

asString(compose.topology, 'profiles.compose.topology');
asString(kubernetes.topology, 'profiles.kubernetes.topology');
asString(k3s.topology, 'profiles.k3s.topology');

const kubernetesOverlay = asString(
  kubernetesClusterProfile.overlay,
  'clusterProfiles.profiles.kubernetes.overlay',
);
const k3sOverlay = asString(k3sClusterProfile.overlay, 'clusterProfiles.profiles.k3s.overlay');
if (kubernetes.renderCommand !== `kubectl kustomize ${kubernetesOverlay}`) {
  fail('Kubernetes render command differs from the cluster profile contract');
}
if (k3s.renderCommand !== `kubectl kustomize ${k3sOverlay}`) {
  fail('K3s render command differs from the cluster profile contract');
}
if (
  kubernetesClusterProfile.ingressController !== 'ingress-nginx' ||
  kubernetesClusterProfile.ingressClassName !== 'nginx' ||
  kubernetesClusterProfile.storageClassName !== 'standard' ||
  kubernetesClusterProfile.metricsServer !== 'required' ||
  kubernetesClusterProfile.eventAutoscaler !== 'keda-required' ||
  kubernetesClusterProfile.certificateController !== 'cert-manager-required' ||
  kubernetesClusterProfile.secretReloadController !== 'stakater-reloader-required'
) {
  fail('Kubernetes platform choices differ from the accepted Phase 9 step 3 contract');
}
if (
  k3sClusterProfile.ingressController !== 'traefik-packaged' ||
  k3sClusterProfile.ingressClassName !== 'traefik' ||
  k3sClusterProfile.storageClassName !== 'local-path' ||
  k3sClusterProfile.metricsServer !== 'packaged' ||
  k3sClusterProfile.eventAutoscaler !== 'keda-required-external' ||
  k3sClusterProfile.certificateController !== 'cert-manager-required-external' ||
  k3sClusterProfile.secretReloadController !== 'stakater-reloader-required-external'
) {
  fail('K3s platform choices differ from the accepted Phase 9 step 3 contract');
}

const k3sVariants = asRecord(k3sClusterProfile.variants, 'clusterProfiles.profiles.k3s.variants');
const singleNodeVariant = asRecord(
  k3sVariants.singleNode,
  'clusterProfiles.profiles.k3s.variants.singleNode',
);
const haVariant = asRecord(k3sVariants.ha, 'clusterProfiles.profiles.k3s.variants.ha');
if (
  singleNodeVariant.serverNodes !== 1 ||
  singleNodeVariant.hostFailureResilience !== false ||
  typeof haVariant.minimumServerNodes !== 'number' ||
  haVariant.minimumServerNodes < 3 ||
  haVariant.embeddedEtcd !== true ||
  haVariant.fixedRegistrationAddress !== true ||
  haVariant.replicatedOrExternalWorkloadStorage !== true ||
  haVariant.hostFailureResilience !== true
) {
  fail('K3s single-node and HA guarantees differ from the accepted topology contract');
}

const expectedComposeServices = asStringArray(
  compose.currentServices,
  'profiles.compose.currentServices',
);
const forbiddenComponents = asStringArray(
  sharedContracts.forbiddenRuntimeComponents,
  'sharedContracts.forbiddenRuntimeComponents',
);

const composeServices = run('docker', [
  'compose',
  '--env-file',
  '.env.example',
  'config',
  '--services',
])
  .trim()
  .split('\n')
  .filter((service: string) => service.length > 0);

assertSame(composeServices, expectedComposeServices, 'Compose services');

const kubernetesRendered = run('kubectl', ['kustomize', kubernetesOverlay]);
const k3sRendered = run('kubectl', ['kustomize', k3sOverlay]);

if (
  kubernetesRendered !== run('kubectl', ['kustomize', kubernetesOverlay]) ||
  k3sRendered !== run('kubectl', ['kustomize', k3sOverlay])
) {
  fail('cluster overlays do not render deterministically');
}

validateRenderedProfile(
  'kubernetes',
  kubernetesRendered,
  asStringArray(kubernetes.currentWorkloads, 'profiles.kubernetes.currentWorkloads'),
  forbiddenComponents,
);
validateRenderedProfile(
  'k3s',
  k3sRendered,
  asStringArray(k3s.currentWorkloads, 'profiles.k3s.currentWorkloads'),
  forbiddenComponents,
);
validateClusterProfile('kubernetes', kubernetesClusterProfile, kubernetesRendered);
validateClusterProfile('k3s', k3sClusterProfile, k3sRendered);

const basePlatformSources = [
  'k8s/base/ingress/ingress.yaml',
  'k8s/base/services/database-statefulset.yaml',
  'k8s/base/services/rabbitmq-statefulset.yaml',
].map((path: string) => readFileSync(path, 'utf8'));
if (
  basePlatformSources.some((source: string) =>
    /(?:ingressClassName|storageClassName|nginx\.ingress\.kubernetes\.io)/u.test(source),
  )
) {
  fail('the common base contains a platform-specific ingress or storage decision');
}

const sourceFiles = run('rg', ['--files', 'k8s', '-g', '*.yaml', '-g', '!examples/**'])
  .trim()
  .split('\n')
  .filter((path: string) => path.length > 0);

for (const path of sourceFiles) {
  const source = readFileSync(path, 'utf8');
  if (/(?:image:\s*\S*:latest(?:\s|$)|newTag:\s*latest(?:\s|$))/mu.test(source)) {
    fail(`${path} contains a mutable latest image`);
  }
  if (
    path.endsWith('kustomization.yaml') &&
    /^(?:commonLabels|bases|patchesStrategicMerge|patchesJson6902):/mu.test(source)
  ) {
    fail(`${path} uses a deprecated Kustomize field`);
  }
}

console.log(
  `Deployment baseline policy passed: ${composeServices.length} Compose services, ` +
    `${workloadNames(kubernetesRendered).length} Kubernetes workloads and ` +
    `${workloadNames(k3sRendered).length} K3s workloads.`,
);
