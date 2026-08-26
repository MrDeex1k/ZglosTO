import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;
type EnforcementMode = 'baseline' | 'target';

type ArtifactContract = {
  id: string;
  localImage: string;
  runtimeClass: string;
  runtimeAuditRoots: string[];
  runtimeAuditExcludes: string[];
  baselineSizeBytes: number;
  targetMaxSizeBytes: number;
  coldBuildMaxSeconds: number;
  warmBuildMaxSeconds: number;
  targetPrivilegePolicy: string;
  imageHealthcheckPolicy: string;
};

type ArtifactSnapshot = {
  id: string;
  sizeBytes: number;
  configuredUser: string;
  hasImageHealthcheck: boolean;
  sensitivePathCount: number;
};

type LiveImage = {
  id: string;
  reference: string;
  sizeBytes: number;
  configuredUser: string;
  hasImageHealthcheck: boolean;
  labels: Set<string>;
  files: string[];
  forbiddenRuntimePackages: string[];
};

const contractPath = 'deploy/image-production-contract.json';
const baselinePath = 'deploy/image-audit-baseline.json';
const expectedArtifactIds = [
  'authorization',
  'backend',
  'database',
  'frontend',
  'llm_gateway',
  'nginx',
  'pgbouncer',
  'rabbitmq',
];
const allowedPrivilegePolicies = new Set([
  'non-root',
  'root-init-then-postgres',
  'root-init-then-rabbitmq',
  'unprivileged-runtime',
]);
const allowedHealthcheckPolicies = new Set([
  'platform-probe-authoritative',
  'platform-probe-required-per-command',
]);

function fail(message: string): never {
  throw new Error(`Image production contract failed: ${message}`);
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }

  return value as JsonRecord;
}

function asArray(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : fail(`${path} must be an array`);
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${path} must be a non-empty string`);
  }

  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : fail(`${path} must be a boolean`);
}

function asPositiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return fail(`${path} must be a positive safe integer`);
  }

  return value;
}

function asNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail(`${path} must be a non-negative safe integer`);
  }

  return value;
}

function asStringArray(value: unknown, path: string): string[] {
  const entries = asArray(value, path);
  return entries.map((entry: unknown, index: number) => asString(entry, `${path}[${index}]`));
}

function parseJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left: string, right: string) => left.localeCompare(right));
}

function assertSameStrings(
  actual: Iterable<string>,
  expected: Iterable<string>,
  path: string,
): void {
  const normalizedActual = sorted(actual);
  const normalizedExpected = sorted(expected);
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${path} differs; expected ${normalizedExpected.join(', ')}, received ${normalizedActual.join(', ')}`,
    );
  }
}

function parseArtifactContract(value: unknown, index: number): ArtifactContract {
  const path = `contract.artifacts[${index}]`;
  const record = asRecord(value, path);
  const services = asStringArray(record.services, `${path}.services`);
  if (services.length === 0 || new Set(services).size !== services.length) {
    fail(`${path}.services must contain unique service names`);
  }

  const runtimeAuditRoots = asStringArray(record.runtimeAuditRoots, `${path}.runtimeAuditRoots`);
  if (
    runtimeAuditRoots.length === 0 ||
    runtimeAuditRoots.some((root: string) => !root.startsWith('/'))
  ) {
    fail(`${path}.runtimeAuditRoots must contain absolute paths`);
  }

  const runtimeAuditExcludes = asStringArray(
    record.runtimeAuditExcludes,
    `${path}.runtimeAuditExcludes`,
  );
  if (runtimeAuditExcludes.some((root: string) => !root.startsWith('/'))) {
    fail(`${path}.runtimeAuditExcludes must contain absolute paths`);
  }

  const targetPrivilegePolicy = asString(
    record.targetPrivilegePolicy,
    `${path}.targetPrivilegePolicy`,
  );
  if (!allowedPrivilegePolicies.has(targetPrivilegePolicy)) {
    fail(`${path}.targetPrivilegePolicy is unsupported`);
  }

  const imageHealthcheckPolicy = asString(
    record.imageHealthcheckPolicy,
    `${path}.imageHealthcheckPolicy`,
  );
  if (!allowedHealthcheckPolicies.has(imageHealthcheckPolicy)) {
    fail(`${path}.imageHealthcheckPolicy is unsupported`);
  }

  const coldBuildMaxSeconds = asPositiveInteger(
    record.coldBuildMaxSeconds,
    `${path}.coldBuildMaxSeconds`,
  );
  const warmBuildMaxSeconds = asPositiveInteger(
    record.warmBuildMaxSeconds,
    `${path}.warmBuildMaxSeconds`,
  );
  if (warmBuildMaxSeconds >= coldBuildMaxSeconds) {
    fail(`${path}.warmBuildMaxSeconds must be lower than its cold-build budget`);
  }

  return {
    id: asString(record.id, `${path}.id`),
    localImage: asString(record.localImage, `${path}.localImage`),
    runtimeClass: asString(record.runtimeClass, `${path}.runtimeClass`),
    runtimeAuditRoots,
    runtimeAuditExcludes,
    baselineSizeBytes: asPositiveInteger(record.baselineSizeBytes, `${path}.baselineSizeBytes`),
    targetMaxSizeBytes: asPositiveInteger(record.targetMaxSizeBytes, `${path}.targetMaxSizeBytes`),
    coldBuildMaxSeconds,
    warmBuildMaxSeconds,
    targetPrivilegePolicy,
    imageHealthcheckPolicy,
  };
}

function parseArtifactSnapshot(value: unknown, index: number): ArtifactSnapshot {
  const path = `baseline.artifacts[${index}]`;
  const record = asRecord(value, path);
  return {
    id: asString(record.id, `${path}.id`),
    sizeBytes: asPositiveInteger(record.sizeBytes, `${path}.sizeBytes`),
    configuredUser:
      typeof record.configuredUser === 'string'
        ? record.configuredUser
        : fail(`${path}.configuredUser must be a string`),
    hasImageHealthcheck: asBoolean(record.hasImageHealthcheck, `${path}.hasImageHealthcheck`),
    sensitivePathCount: asNonNegativeInteger(
      record.sensitivePathCount,
      `${path}.sensitivePathCount`,
    ),
  };
}

function mapUnique<T extends { id: string }>(values: T[], path: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.id)) {
      fail(`${path} contains duplicate id ${value.id}`);
    }
    result.set(value.id, value);
  }
  return result;
}

function parseMode(value: string): EnforcementMode {
  if (value === 'baseline' || value === 'target') {
    return value;
  }
  return fail(`unsupported enforcement mode ${value}`);
}

function isNonRootUser(configuredUser: string): boolean {
  const principal = configuredUser.trim().split(':')[0] ?? '';
  return principal !== '' && principal !== '0' && principal !== 'root';
}

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern: RegExp) => pattern.test(path));
}

function isExcluded(path: string, excludedRoots: string[]): boolean {
  return excludedRoots.some(
    (excluded: string) => path === excluded || path.startsWith(`${excluded}/`),
  );
}

function dockerOutput(context: string | null, args: string[]): string {
  const contextArgs = context === null ? [] : ['--context', context];
  return execFileSync('docker', [...contextArgs, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function inspectRuntimeFiles(
  context: string | null,
  reference: string,
  roots: string[],
  excludes: string[],
): string[] {
  const command = 'root=$1; shift; if [ -e "$root" ]; then find "$root" "$@"; fi';
  const pruneArguments =
    excludes.length === 0
      ? ['-type', 'f', '-print']
      : [
          '(',
          ...excludes.flatMap((exclude: string, index: number) => [
            ...(index === 0 ? [] : ['-o']),
            '-path',
            exclude,
            '-o',
            '-path',
            `${exclude}/*`,
          ]),
          ')',
          '-prune',
          '-o',
          '-type',
          'f',
          '-print',
        ];

  return roots.flatMap((root: string) => {
    const output = dockerOutput(context, [
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--entrypoint',
      '/bin/sh',
      reference,
      '-c',
      command,
      'image-contract',
      root,
      ...pruneArguments,
    ]);
    return output
      .split('\n')
      .map((entry: string) => entry.trim())
      .filter((entry: string) => entry.length > 0);
  });
}

function inspectForbiddenRuntimePackages(
  context: string | null,
  reference: string,
  packageNames: string[],
): string[] {
  if (packageNames.length === 0) return [];
  const script = [
    'const found=[];',
    'for (const name of process.argv.slice(1)) {',
    '  try { require.resolve(name); found.push(name); } catch {}',
    '}',
    'process.stdout.write(found.join("\\n"));',
  ].join('');
  const output = dockerOutput(context, [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--entrypoint',
    'node',
    reference,
    '-e',
    script,
    ...packageNames,
  ]);
  return output
    .split('\n')
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0);
}

function inspectImage(
  artifact: ArtifactContract,
  reference: string,
  context: string | null,
  forbiddenRuntimeNodePackages: string[],
): LiveImage {
  const parsed: unknown = JSON.parse(
    dockerOutput(context, ['image', 'inspect', reference]),
  ) as unknown;
  const entries = asArray(parsed, `docker image inspect ${reference}`);
  if (entries.length !== 1) {
    fail(`docker image inspect ${reference} returned ${entries.length} records`);
  }

  const image = asRecord(entries[0], `docker image inspect ${reference}[0]`);
  const config = asRecord(image.Config, `docker image inspect ${reference}[0].Config`);
  const labelsValue = config.Labels;
  const labels =
    labelsValue === null
      ? new Set<string>()
      : new Set(Object.keys(asRecord(labelsValue, `${reference}.Config.Labels`)));

  return {
    id: artifact.id,
    reference,
    sizeBytes: asPositiveInteger(image.Size, `${reference}.Size`),
    configuredUser:
      config.User === null || !Object.hasOwn(config, 'User')
        ? ''
        : typeof config.User === 'string'
          ? config.User
          : fail(`${reference}.Config.User must be a string or null`),
    hasImageHealthcheck: config.Healthcheck !== null && config.Healthcheck !== undefined,
    labels,
    files: inspectRuntimeFiles(
      context,
      reference,
      artifact.runtimeAuditRoots,
      artifact.runtimeAuditExcludes,
    ),
    forbiddenRuntimePackages:
      artifact.runtimeClass === 'node' || artifact.runtimeClass === 'node-shared'
        ? inspectForbiddenRuntimePackages(context, reference, forbiddenRuntimeNodePackages)
        : [],
  };
}

function parseImageOverrides(cliArguments: string[]): Map<string, string> {
  const overrides = new Map<string, string>();
  for (let index = 0; index < cliArguments.length; index += 1) {
    const argument = cliArguments[index];
    if (argument !== '--image') {
      continue;
    }

    const mapping = cliArguments[index + 1];
    if (typeof mapping !== 'string') {
      fail('--image requires id=reference');
    }
    const separator = mapping.indexOf('=');
    if (separator <= 0 || separator === mapping.length - 1) {
      fail(`invalid --image mapping ${mapping}; expected id=reference`);
    }
    const id = mapping.slice(0, separator);
    const reference = mapping.slice(separator + 1);
    if (overrides.has(id)) {
      fail(`duplicate --image override for ${id}`);
    }
    overrides.set(id, reference);
    index += 1;
  }
  return overrides;
}

function argumentValue(cliArguments: string[], name: string): string | null {
  const index = cliArguments.indexOf(name);
  if (index < 0) {
    return null;
  }
  const value = cliArguments[index + 1];
  return typeof value === 'string' ? value : fail(`${name} requires a value`);
}

const rawContract = asRecord(parseJsonFile(contractPath), 'contract');
if (rawContract.schemaVersion !== 1 || rawContract.phase !== '11.2') {
  fail('contract must identify schemaVersion 1 and Phase 11 step 2');
}

const measurement = asRecord(rawContract.measurement, 'contract.measurement');
const regressionPercent = asPositiveInteger(
  measurement.baselineRegressionPercent,
  'contract.measurement.baselineRegressionPercent',
);
if (regressionPercent > 10) {
  fail('baseline regression budget cannot exceed 10 percent');
}
const parallelColdMaxSeconds = asPositiveInteger(
  measurement.parallelBuildColdMaxSeconds,
  'contract.measurement.parallelBuildColdMaxSeconds',
);
const parallelWarmMaxSeconds = asPositiveInteger(
  measurement.parallelBuildWarmMaxSeconds,
  'contract.measurement.parallelBuildWarmMaxSeconds',
);
if (parallelWarmMaxSeconds >= parallelColdMaxSeconds) {
  fail('parallel warm-build budget must be lower than the cold-build budget');
}

const referenceRunner = asRecord(
  measurement.referenceRunner,
  'contract.measurement.referenceRunner',
);
asPositiveInteger(referenceRunner.cpu, 'contract.measurement.referenceRunner.cpu');
asPositiveInteger(referenceRunner.memoryGiB, 'contract.measurement.referenceRunner.memoryGiB');
asString(referenceRunner.storage, 'contract.measurement.referenceRunner.storage');

const commonTarget = asRecord(rawContract.commonTarget, 'contract.commonTarget');
if (
  commonTarget.immutableReleaseReference !== 'zglosto/repository:version-architecture-revision' ||
  commonTarget.buildStrategy !== 'native-source-build' ||
  commonTarget.registryRequired !== false
) {
  fail('contract.commonTarget must require local immutable tags from native source builds');
}
const requiredOciLabels = asStringArray(
  commonTarget.requiredOciLabels,
  'contract.commonTarget.requiredOciLabels',
);
if (new Set(requiredOciLabels).size !== requiredOciLabels.length) {
  fail('contract.commonTarget.requiredOciLabels must contain unique labels');
}
assertSameStrings(
  asStringArray(commonTarget.requiredPlatforms, 'contract.commonTarget.requiredPlatforms'),
  ['linux/amd64', 'linux/arm64'],
  'contract.commonTarget.requiredPlatforms',
);
for (const flag of [
  'secretsOutsideLayers',
  'platformHealthcheckRequired',
  'gracefulShutdownRequired',
  'readOnlyRootFilesystemWhenSupported',
]) {
  if (commonTarget[flag] !== true) {
    fail(`contract.commonTarget.${flag} must be true`);
  }
}

const sensitivePatterns = asStringArray(
  commonTarget.forbiddenSensitivePathPatterns,
  'contract.commonTarget.forbiddenSensitivePathPatterns',
).map((pattern: string) => new RegExp(pattern, 'u'));
const applicationPatterns = asStringArray(
  commonTarget.forbiddenApplicationPathPatterns,
  'contract.commonTarget.forbiddenApplicationPathPatterns',
).map((pattern: string) => new RegExp(pattern, 'u'));
const forbiddenRuntimeNodePackages = asStringArray(
  commonTarget.forbiddenRuntimeNodePackages,
  'contract.commonTarget.forbiddenRuntimeNodePackages',
);
if (
  forbiddenRuntimeNodePackages.length === 0 ||
  new Set(forbiddenRuntimeNodePackages).size !== forbiddenRuntimeNodePackages.length
) {
  fail('contract.commonTarget.forbiddenRuntimeNodePackages must contain unique packages');
}

const artifacts = asArray(rawContract.artifacts, 'contract.artifacts').map(
  (value: unknown, index: number) => parseArtifactContract(value, index),
);
const artifactById = mapUnique(artifacts, 'contract.artifacts');
assertSameStrings(artifactById.keys(), expectedArtifactIds, 'contract artifact ids');

const rawBaseline = asRecord(parseJsonFile(baselinePath), 'baseline');
if (rawBaseline.schemaVersion !== 1 || rawBaseline.phase !== '11.1') {
  fail('baseline must identify schemaVersion 1 and Phase 11 step 1');
}
if (rawBaseline.platform !== measurement.baselineArchitecture) {
  fail('baseline platform differs from the contract measurement architecture');
}
asPositiveInteger(rawBaseline.buildContextBytes, 'baseline.buildContextBytes');

const baselineArtifacts = asArray(rawBaseline.artifacts, 'baseline.artifacts').map(
  (value: unknown, index: number) => parseArtifactSnapshot(value, index),
);
const baselineById = mapUnique(baselineArtifacts, 'baseline.artifacts');
assertSameStrings(baselineById.keys(), expectedArtifactIds, 'baseline artifact ids');

for (const artifact of artifacts) {
  const baseline = baselineById.get(artifact.id);
  if (baseline === undefined) {
    fail(`missing baseline for ${artifact.id}`);
  }
  if (baseline.sizeBytes !== artifact.baselineSizeBytes) {
    fail(`${artifact.id} baseline size differs between the audit and production contract`);
  }
  if (baseline.sensitivePathCount !== 0) {
    fail(`${artifact.id} baseline contains ${baseline.sensitivePathCount} sensitive paths`);
  }
}

const cliArguments = process.argv.slice(2);
const inspect = cliArguments.includes('--inspect');
const requestedMode = argumentValue(cliArguments, '--mode');
const defaultMode = parseMode(
  asString(rawContract.defaultEnforcement, 'contract.defaultEnforcement'),
);
const mode = requestedMode === null ? defaultMode : parseMode(requestedMode);
const dockerContext = argumentValue(cliArguments, '--context');
const imageOverrides = parseImageOverrides(cliArguments);

for (const id of imageOverrides.keys()) {
  if (!artifactById.has(id)) {
    fail(`--image references unknown artifact ${id}`);
  }
}
if (mode === 'target' && !inspect) {
  fail('target enforcement requires --inspect so it validates real image metadata and contents');
}

const rows: string[] = [];
for (const artifact of artifacts) {
  const baseline = baselineById.get(artifact.id);
  if (baseline === undefined) {
    fail(`missing baseline for ${artifact.id}`);
  }
  const currentMaxSizeBytes = Math.ceil(artifact.baselineSizeBytes * (1 + regressionPercent / 100));

  if (!inspect) {
    if (baseline.sizeBytes > currentMaxSizeBytes) {
      fail(`${artifact.id} exceeds its baseline regression budget`);
    }
    rows.push(
      `${artifact.id}: ${(baseline.sizeBytes / 1_000_000).toFixed(1)} MB baseline, ` +
        `${(artifact.targetMaxSizeBytes / 1_000_000).toFixed(1)} MB target`,
    );
    continue;
  }

  const reference = imageOverrides.get(artifact.id) ?? artifact.localImage;
  const live = inspectImage(artifact, reference, dockerContext, forbiddenRuntimeNodePackages);
  const maxSizeBytes = mode === 'baseline' ? currentMaxSizeBytes : artifact.targetMaxSizeBytes;
  if (live.sizeBytes > maxSizeBytes) {
    fail(
      `${artifact.id} is ${(live.sizeBytes / 1_000_000).toFixed(1)} MB, above the ` +
        `${mode} budget ${(maxSizeBytes / 1_000_000).toFixed(1)} MB`,
    );
  }

  const auditableFiles = live.files.filter(
    (path: string) => !isExcluded(path, artifact.runtimeAuditExcludes),
  );
  const sensitiveFiles = auditableFiles.filter((path: string) =>
    matchesAny(path, sensitivePatterns),
  );
  if (sensitiveFiles.length > 0) {
    fail(`${artifact.id} contains sensitive runtime paths: ${sensitiveFiles.join(', ')}`);
  }

  if (mode === 'target') {
    if (live.forbiddenRuntimePackages.length > 0) {
      fail(
        `${artifact.id} contains forbidden runtime packages: ${live.forbiddenRuntimePackages.join(', ')}`,
      );
    }
    if (
      (artifact.targetPrivilegePolicy === 'non-root' ||
        artifact.targetPrivilegePolicy === 'unprivileged-runtime') &&
      !isNonRootUser(live.configuredUser)
    ) {
      fail(`${artifact.id} must configure a non-root runtime user`);
    }

    const missingLabels = requiredOciLabels.filter((label: string) => !live.labels.has(label));
    if (missingLabels.length > 0) {
      fail(`${artifact.id} lacks required OCI labels: ${missingLabels.join(', ')}`);
    }

    if (artifact.runtimeClass === 'node' || artifact.runtimeClass === 'node-shared') {
      const forbiddenFiles = auditableFiles.filter((path: string) =>
        matchesAny(path, applicationPatterns),
      );
      if (forbiddenFiles.length > 0) {
        fail(
          `${artifact.id} retains forbidden application files: ${forbiddenFiles.slice(0, 10).join(', ')}`,
        );
      }
    }
  }

  rows.push(
    `${artifact.id}: ${(live.sizeBytes / 1_000_000).toFixed(1)} MB / ` +
      `${(maxSizeBytes / 1_000_000).toFixed(1)} MB ${mode} max, user=` +
      `${live.configuredUser.length === 0 ? '<root-default>' : live.configuredUser}, ` +
      `healthcheck=${String(live.hasImageHealthcheck)}, image=${live.reference}`,
  );
}

console.log(`Image production contract passed in ${mode} mode for ${artifacts.length} artifacts.`);
for (const row of rows) {
  console.log(`- ${row}`);
}
