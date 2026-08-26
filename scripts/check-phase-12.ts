import { existsSync, readFileSync, statSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Phase 12 policy failed: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function expectProfile(
  profiles: JsonRecord,
  name: string,
  expected: Readonly<Record<string, string>>,
): void {
  const profile = record(profiles[name], `profiles.${name}`);
  for (const [key, value] of Object.entries(expected)) {
    if (profile[key] !== value) fail(`profiles.${name}.${key} must be ${value}`);
  }
}

function requireText(path: string, markers: readonly string[]): void {
  if (!existsSync(path)) fail(`missing ${path}`);
  const content = readFileSync(path, 'utf8');
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${path} lacks marker: ${marker}`);
  }
}

const contract = record(
  JSON.parse(readFileSync('deploy/phase-12-acceptance-contract.json', 'utf8')) as unknown,
  'contract',
);
if (
  contract.phase !== '12' ||
  contract.status !== 'active' ||
  contract.implementationStatus !== 'automation-complete' ||
  contract.localPreflightStatus !== 'passed' ||
  contract.localResourceSizingStatus !== 'local-measured-provisional' ||
  contract.certificationStatus !== 'pending-reference-host' ||
  contract.kubernetesStatus !== 'frozen' ||
  contract.k3sStatus !== 'optional-after-compose'
) {
  fail('contract must keep Phase 12 active until reference-host evidence and operator sign-off');
}
const host = record(contract.referenceHost, 'referenceHost');
if (
  host.productionOperatingSystem !== 'ubuntu-server' ||
  host.compatibilityOperatingSystem !== 'windows-wsl2-docker-desktop' ||
  host.architecture !== 'amd64' ||
  host.minimumLogicalCpu !== 8 ||
  host.minimumMemoryGiB !== 16 ||
  host.minimumDiskGiB !== 100 ||
  host.windowsProductionCertified !== false
) {
  fail('reference-host contract differs from the accepted x86_64 Ubuntu/Windows class');
}
const profiles = record(contract.profiles, 'profiles');
expectProfile(profiles, 'minimal', {
  objectStorage: 'local',
  redis: 'disabled',
  observability: 'disabled',
  llm: 'local',
});
expectProfile(profiles, 'recommended', {
  objectStorage: 'local',
  redis: 'local',
  observability: 'disabled',
  llm: 'disabled',
});

const resourceSizing = record(contract.resourceSizing, 'resourceSizing');
const sizingProfiles = record(resourceSizing.profiles, 'resourceSizing.profiles');
const minimalSizing = record(sizingProfiles.minimal, 'resourceSizing.profiles.minimal');
const recommendedSizing = record(sizingProfiles.recommended, 'resourceSizing.profiles.recommended');
const observabilitySizing = record(
  sizingProfiles.observabilityLocalWithoutLocalLlm,
  'resourceSizing.profiles.observabilityLocalWithoutLocalLlm',
);
const combinedSizing = record(
  sizingProfiles.localLlmAndObservabilityLocal,
  'resourceSizing.profiles.localLlmAndObservabilityLocal',
);
if (
  minimalSizing.measuredPeakCpuCores !== 5.5756 ||
  minimalSizing.measuredPeakContainerMemoryMiB !== 2765.855 ||
  minimalSizing.minimumLogicalCpu !== 8 ||
  minimalSizing.minimumMemoryGiB !== 8 ||
  recommendedSizing.measuredPeakCpuCores !== 1.2403 ||
  recommendedSizing.measuredPeakContainerMemoryMiB !== 921.019 ||
  recommendedSizing.minimumLogicalCpu !== 2 ||
  recommendedSizing.minimumMemoryGiB !== 4 ||
  observabilitySizing.measuredPeakCpuCores !== 0.7431 ||
  observabilitySizing.measuredPeakContainerMemoryMiB !== 2404.98 ||
  observabilitySizing.minimumLogicalCpu !== 4 ||
  observabilitySizing.minimumMemoryGiB !== 8 ||
  combinedSizing.measurement !== 'conservative-extrapolation' ||
  combinedSizing.minimumLogicalCpu !== 12 ||
  combinedSizing.minimumMemoryGiB !== 12 ||
  resourceSizing.evidence !== 'docs/phase-12-local-resource-sizing.md'
) {
  fail('local resource sizing must match the measured provisional profile requirements');
}

const externalProfiles = record(contract.externalProfiles, 'externalProfiles');
if (
  externalProfiles.runtimeCertification !== 'conditional' ||
  externalProfiles.configurationValidated !== true
) {
  fail('external profiles must remain conditional on real providers');
}

for (const path of [
  'scripts/phase12-certify.sh',
  'scripts/phase12-host-audit.ts',
  'scripts/phase12-dmr-test.ts',
  'scripts/phase12-public-edge-test.ts',
  'scripts/phase12-load-test.ts',
  'scripts/phase12-observability-drill.ts',
  'scripts/phase12-resource-monitor.ts',
  'scripts/phase12-resource-profile.sh',
  'docs/phase-12-certification-plan.md',
  'docs/phase-12-local-evidence.md',
  'docs/phase-12-local-resource-sizing.md',
  'docs/phase-12-operations-runbook.md',
  'docs/phase-12-white-label-rollout.md',
  'deploy/phase-12-evidence.example.json',
]) {
  if (!existsSync(path)) fail(`missing Phase 12 artifact ${path}`);
}
if ((statSync('scripts/phase12-certify.sh').mode & 0o111) === 0) {
  fail('scripts/phase12-certify.sh must be executable');
}
if ((statSync('scripts/phase12-resource-profile.sh').mode & 0o111) === 0) {
  fail('scripts/phase12-resource-profile.sh must be executable');
}
requireText('scripts/phase12-certify.sh', [
  'PHASE12_ALLOW_DESTRUCTIVE',
  'integration-minimal',
  'integration-recommended',
  'production-runtime',
]);
requireText('scripts/phase12-resource-monitor.ts', [
  'local-resource-measurement',
  'macos-arm64-orbstack',
  'maximumTotalCpuPercent',
]);
requireText('scripts/phase12-resource-profile.sh', [
  'PHASE12_ALLOW_DESTRUCTIVE',
  '--exclude-service model_runner_stub',
  '--include-name docker-model-runner',
]);
requireText('docs/release.md', [
  'Faza 12: Certyfikacja instancji klienta',
  'minimal',
  'recommended',
  'wykonanie per klient',
  'local-measured-provisional',
]);

console.log(
  'Phase 12 policy OK: provisional sizing, per-client Ubuntu validation, two Compose profiles, conditional external providers and evidence-gated completion are defined.',
);
