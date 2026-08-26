import { existsSync, readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

const expectedArtifacts: Readonly<Record<string, readonly string[]>> = {
  authorization: ['authorization'],
  backend: ['backend', 'media_worker'],
  database: ['database'],
  frontend: ['frontend'],
  llm_gateway: ['llm_gateway'],
  nginx: ['nginx'],
  pgbouncer: ['pgbouncer'],
  rabbitmq: ['rabbitmq'],
};

function fail(message: string): never {
  throw new Error(`Production source-build policy failed: ${message}`);
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

function asBoolean(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : fail(`${path} must be a boolean`);
}

function asPositiveInteger(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : fail(`${path} must be a positive safe integer`);
}

function asNonNegativeInteger(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail(`${path} must be a non-negative safe integer`);
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return fail(`${path} must be an array`);
  return value.map((entry: unknown, index: number) => asString(entry, `${path}[${index}]`));
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left: string, right: string) => left.localeCompare(right));
}

function expectSame(actual: Iterable<string>, expected: Iterable<string>, path: string): void {
  const normalizedActual = sorted(actual);
  const normalizedExpected = sorted(expected);
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${path} differs; expected ${normalizedExpected.join(', ')}, received ${normalizedActual.join(', ')}`,
    );
  }
}

const contract = asRecord(
  JSON.parse(readFileSync('deploy/production-source-build.json', 'utf8')) as unknown,
  'contract',
);
if (
  contract.schemaVersion !== 1 ||
  contract.phase !== '11.9' ||
  contract.strategy !== 'native-source-build'
) {
  fail('contract must identify native source build for Phase 11 step 9');
}
if (contract.stateDirectory !== '.state/production-build') {
  fail('runtime build state must stay under ignored .state/production-build');
}

const requirements = asRecord(contract.requirements, 'contract.requirements');
if (
  requirements.operatingSystem !== 'linux' ||
  requirements.allowCrossBuild !== false ||
  requirements.allowRegistryPush !== false ||
  requirements.requireDockerComposeV2 !== true ||
  requirements.requireBuildx !== true ||
  requirements.requireCleanGitTree !== true ||
  requirements.requireExactGitTag !== true
) {
  fail('host requirements must enforce clean, exact-tagged, local native builds without push');
}
expectSame(
  asStringArray(
    requirements.supportedArchitectures,
    'contract.requirements.supportedArchitectures',
  ),
  ['amd64', 'arm64'],
  'supported architectures',
);
asPositiveInteger(requirements.minimumCpuCount, 'contract.requirements.minimumCpuCount');
asPositiveInteger(requirements.minimumMemoryBytes, 'contract.requirements.minimumMemoryBytes');
asPositiveInteger(requirements.minimumFreeDiskBytes, 'contract.requirements.minimumFreeDiskBytes');
if (
  asPositiveInteger(
    requirements.maximumTotalBuildSeconds,
    'contract.requirements.maximumTotalBuildSeconds',
  ) !== 900
) {
  fail('the full cold-build budget must remain 900 seconds');
}

if ('supplyChain' in contract) {
  fail('Trivy/SBOM supply-chain configuration must not remain in the active contract');
}
const sourceValidation = asRecord(contract.sourceValidation, 'contract.sourceValidation');
const publicRepositoryScript = asString(
  sourceValidation.publicRepositoryScript,
  'contract.sourceValidation.publicRepositoryScript',
);
if (publicRepositoryScript !== 'scripts/check-public-repository.ts') {
  fail('source validation must use the repository secret/PII policy');
}
if (!existsSync(publicRepositoryScript)) {
  fail('source validation script does not exist');
}

const retention = asRecord(contract.retention, 'contract.retention');
if (
  retention.steadyStateReleaseCount !== 1 ||
  asNonNegativeInteger(
    retention.previousReleaseCount,
    'contract.retention.previousReleaseCount',
  ) !== 0 ||
  retention.keepActiveUntilCandidateSmokePasses !== true ||
  retention.rollbackSource !== 'exact-git-tag-rebuild'
) {
  fail('retention must keep only active images after candidate promotion');
}

const defaultModules = asRecord(contract.defaultModules, 'contract.defaultModules');
if (
  defaultModules.objectStorage !== 'local' ||
  defaultModules.redis !== 'disabled' ||
  defaultModules.observability !== 'disabled' ||
  defaultModules.llm !== 'disabled'
) {
  fail('default package must contain RustFS and keep Redis, observability and LLM disabled');
}

const moduleModes = asRecord(contract.moduleModes, 'contract.moduleModes');
expectSame(
  asStringArray(moduleModes.objectStorage, 'moduleModes.objectStorage'),
  ['local', 'external'],
  'Object Storage modes',
);
for (const moduleName of ['redis', 'observability', 'llm']) {
  expectSame(
    asStringArray(moduleModes[moduleName], `moduleModes.${moduleName}`),
    ['disabled', 'external', 'local'],
    `${moduleName} modes`,
  );
}

if (!Array.isArray(contract.artifacts)) fail('contract.artifacts must be an array');
const artifactIds = new Set<string>();
for (const [index, value] of contract.artifacts.entries()) {
  const path = `contract.artifacts[${String(index)}]`;
  const artifact = asRecord(value, path);
  const id = asString(artifact.id, `${path}.id`);
  if (artifactIds.has(id)) fail(`${path}.id is duplicated`);
  artifactIds.add(id);
  const expectedServices = expectedArtifacts[id];
  if (expectedServices === undefined) fail(`${path}.id is unsupported: ${id}`);
  expectSame(
    asStringArray(artifact.services, `${path}.services`),
    expectedServices,
    `${id} services`,
  );
  const dockerfile = asString(artifact.dockerfile, `${path}.dockerfile`);
  const context = asString(artifact.context, `${path}.context`);
  const dockerfileFromRoot = context === '.' ? dockerfile : `${context}/${dockerfile}`;
  if (!existsSync(dockerfileFromRoot))
    fail(`${id} Dockerfile does not exist: ${dockerfileFromRoot}`);
  asString(artifact.repository, `${path}.repository`);
  asPositiveInteger(artifact.maximumBuildSeconds, `${path}.maximumBuildSeconds`);
  asBoolean(artifact.whiteLabel, `${path}.whiteLabel`);
}
expectSame(artifactIds, Object.keys(expectedArtifacts), 'artifact ids');

if (!Array.isArray(contract.externalComponents)) {
  fail('contract.externalComponents must be an array');
}
const externalComponents = contract.externalComponents.map((value: unknown, index: number) =>
  asRecord(value, `contract.externalComponents[${String(index)}]`),
);
const rustfs = externalComponents.find((entry: JsonRecord) => entry.id === 'rustfs');
if (
  rustfs === undefined ||
  rustfs.module !== 'objectStorage' ||
  rustfs.mode !== 'local' ||
  rustfs.includedByDefault !== true
) {
  fail('RustFS must be the default pulled Object Storage component');
}
for (const component of externalComponents) {
  asString(component.image, `external component ${String(component.id)}.image`);
}

const implementation = readFileSync('scripts/production-build.ts', 'utf8');
for (const required of [
  "'buildx'",
  "'--load'",
  "'--platform'",
  'contract.sourceValidation.publicRepositoryScript',
  'scripts/check-image-contract.ts',
  'immutable candidate tag already exists locally',
  "'manifest.json'",
  "'images.env'",
]) {
  if (!implementation.includes(required)) {
    fail(`production-build.ts lacks required implementation marker ${required}`);
  }
}
if (/trivy|sbom/iu.test(implementation)) {
  fail('production-build.ts must not invoke Trivy or generate SBOM artifacts');
}
if (implementation.includes("'push'") || implementation.includes('"push"')) {
  fail('production source build must not push images');
}
if (!existsSync('scripts/production-build.sh')) {
  fail('operator shell entrypoint scripts/production-build.sh is missing');
}
if (existsSync('.github/workflows/phase-9-deployment.yml')) {
  fail('GitHub-hosted Phase 9 workflow must not remain active');
}

console.log(
  'Production source-build policy OK: 8 native local artifacts, repository secret/PII validation, exact-tag source, current-only retention and default RustFS.',
);
