import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

type JsonRecord = Record<string, unknown>;

type Artifact = {
  id: string;
  repository: string;
  dockerfile: string;
  context: string;
  services: string[];
  maximumBuildSeconds: number;
  whiteLabel: boolean;
};

type ExternalComponent = {
  id: string;
  image: string;
  module: string;
  mode: string;
  includedByDefault: boolean;
};

type BuildContract = {
  stateDirectory: string;
  requirements: {
    operatingSystem: string;
    supportedArchitectures: string[];
    minimumCpuCount: number;
    minimumMemoryBytes: number;
    minimumFreeDiskBytes: number;
    maximumTotalBuildSeconds: number;
    requireCleanGitTree: boolean;
    requireExactGitTag: boolean;
  };
  sourceValidation: {
    publicRepositoryScript: string;
  };
  retention: JsonRecord;
  defaultModules: JsonRecord;
  moduleModes: JsonRecord;
  artifacts: Artifact[];
  externalComponents: ExternalComponent[];
};

type CliOptions = {
  command: 'build' | 'validate';
  version: string | null;
  configPath: string;
  stateDirectory: string | null;
};

type DockerInfo = {
  Architecture: string;
  NCPU: number;
  MemTotal: number;
  OSType: string;
};

type WhiteLabelMetadata = {
  cityKey: string;
  configVersion: string;
  configChecksum: string;
  validatedConfigPath: string;
};

type BuiltArtifact = {
  id: string;
  services: string[];
  reference: string;
  imageId: string;
  sizeBytes: number;
  architecture: string;
  operatingSystem: string;
  buildDurationSeconds: number;
};

const rootDirectory = resolve(dirname(new URL(import.meta.url).pathname), '..');
const contractPath = join(rootDirectory, 'deploy/production-source-build.json');

function fail(message: string): never {
  throw new Error(`Production source build failed: ${message}`);
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

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    return fail(`${path} must be an array`);
  }
  return value.map((entry: unknown, index: number) => asString(entry, `${path}[${index}]`));
}

function parseArtifact(value: unknown, index: number): Artifact {
  const path = `contract.artifacts[${index}]`;
  const record = asRecord(value, path);
  return {
    id: asString(record.id, `${path}.id`),
    repository: asString(record.repository, `${path}.repository`),
    dockerfile: asString(record.dockerfile, `${path}.dockerfile`),
    context: asString(record.context, `${path}.context`),
    services: asStringArray(record.services, `${path}.services`),
    maximumBuildSeconds: asPositiveInteger(
      record.maximumBuildSeconds,
      `${path}.maximumBuildSeconds`,
    ),
    whiteLabel: asBoolean(record.whiteLabel, `${path}.whiteLabel`),
  };
}

function parseExternalComponent(value: unknown, index: number): ExternalComponent {
  const path = `contract.externalComponents[${index}]`;
  const record = asRecord(value, path);
  return {
    id: asString(record.id, `${path}.id`),
    image: asString(record.image, `${path}.image`),
    module: asString(record.module, `${path}.module`),
    mode: asString(record.mode, `${path}.mode`),
    includedByDefault: asBoolean(record.includedByDefault, `${path}.includedByDefault`),
  };
}

function parseContract(): BuildContract {
  const parsed = asRecord(JSON.parse(readFileSync(contractPath, 'utf8')) as unknown, 'contract');
  if (parsed.schemaVersion !== 1 || parsed.phase !== '11.9') {
    fail('contract must identify schemaVersion 1 and Phase 11 step 9');
  }

  const requirements = asRecord(parsed.requirements, 'contract.requirements');
  const sourceValidation = asRecord(parsed.sourceValidation, 'contract.sourceValidation');
  const artifacts = Array.isArray(parsed.artifacts)
    ? parsed.artifacts.map(parseArtifact)
    : fail('contract.artifacts must be an array');
  const externalComponents = Array.isArray(parsed.externalComponents)
    ? parsed.externalComponents.map(parseExternalComponent)
    : fail('contract.externalComponents must be an array');

  return {
    stateDirectory: asString(parsed.stateDirectory, 'contract.stateDirectory'),
    requirements: {
      operatingSystem: asString(
        requirements.operatingSystem,
        'contract.requirements.operatingSystem',
      ),
      supportedArchitectures: asStringArray(
        requirements.supportedArchitectures,
        'contract.requirements.supportedArchitectures',
      ),
      minimumCpuCount: asPositiveInteger(
        requirements.minimumCpuCount,
        'contract.requirements.minimumCpuCount',
      ),
      minimumMemoryBytes: asPositiveInteger(
        requirements.minimumMemoryBytes,
        'contract.requirements.minimumMemoryBytes',
      ),
      minimumFreeDiskBytes: asPositiveInteger(
        requirements.minimumFreeDiskBytes,
        'contract.requirements.minimumFreeDiskBytes',
      ),
      maximumTotalBuildSeconds: asPositiveInteger(
        requirements.maximumTotalBuildSeconds,
        'contract.requirements.maximumTotalBuildSeconds',
      ),
      requireCleanGitTree: asBoolean(
        requirements.requireCleanGitTree,
        'contract.requirements.requireCleanGitTree',
      ),
      requireExactGitTag: asBoolean(
        requirements.requireExactGitTag,
        'contract.requirements.requireExactGitTag',
      ),
    },
    sourceValidation: {
      publicRepositoryScript: asString(
        sourceValidation.publicRepositoryScript,
        'contract.sourceValidation.publicRepositoryScript',
      ),
    },
    retention: asRecord(parsed.retention, 'contract.retention'),
    defaultModules: asRecord(parsed.defaultModules, 'contract.defaultModules'),
    moduleModes: asRecord(parsed.moduleModes, 'contract.moduleModes'),
    artifacts,
    externalComponents,
  };
}

function usage(): string {
  return [
    'Usage: production-build.sh COMMAND [OPTIONS]',
    '',
    'Commands:',
    '  validate  validate source, host and Docker/BuildKit',
    '  build     build and validate all production images',
    '',
    'Options:',
    '  --version TAG       exact Git tag to build; defaults to the single tag at HEAD',
    '  --config PATH       White-Label YAML relative to the repository',
    '  --state-dir PATH    runtime state directory; defaults to the build contract',
    '  --help              show this help',
  ].join('\n');
}

function parseCli(arguments_: string[]): CliOptions {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  const [rawCommand, ...rest] = arguments_;
  if (rawCommand !== 'build' && rawCommand !== 'validate') {
    fail(`expected command build or validate\n\n${usage()}`);
  }

  let version: string | null = null;
  let configPath = 'config/white-label/zglosto.yaml';
  let stateDirectory: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    const value = rest[index + 1];
    if (option === '--version' || option === '--config' || option === '--state-dir') {
      if (value === undefined || value.startsWith('--')) {
        fail(`${option} requires a value`);
      }
      if (option === '--version') version = value;
      if (option === '--config') configPath = value;
      if (option === '--state-dir') stateDirectory = value;
      index += 1;
      continue;
    }
    fail(`unsupported option ${String(option)}`);
  }

  return { command: rawCommand, version, configPath, stateDirectory };
}

function execute(
  command: string,
  arguments_: string[],
  options: { capture?: boolean; cwd?: string } = {},
): string {
  const capture = options.capture ?? false;
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? rootDirectory,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error !== undefined) {
    fail(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = capture ? `${result.stderr ?? ''}${result.stdout ?? ''}`.trim() : '';
    fail(
      `${command} ${arguments_.join(' ')} exited with ${String(result.status)}` +
        (details.length > 0 ? `\n${details}` : ''),
    );
  }
  return capture ? (result.stdout ?? '').trim() : '';
}

function executeOptional(command: string, arguments_: string[]): string | null {
  const result = spawnSync(command, arguments_, {
    cwd: rootDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}

function normalizeArchitecture(value: string): string {
  if (value === 'x86_64' || value === 'amd64') return 'amd64';
  if (value === 'aarch64' || value === 'arm64') return 'arm64';
  return fail(`unsupported Docker architecture ${value}`);
}

function exactGitTags(): string[] {
  return execute('git', ['tag', '--points-at', 'HEAD'], { capture: true })
    .split('\n')
    .map((tag: string) => tag.trim())
    .filter((tag: string) => tag.length > 0)
    .sort();
}

function resolveReleaseVersion(requested: string | null, requireExactTag: boolean): string {
  const tags = exactGitTags();
  const version =
    requested ??
    (tags.length === 1
      ? tags[0]
      : fail(
          tags.length === 0
            ? 'HEAD has no exact Git tag; pass --version after checking out a release tag'
            : `HEAD has multiple tags (${tags.join(', ')}); pass --version`,
        ));

  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/u.test(version)) {
    fail(`release version is not a safe Docker tag component: ${version}`);
  }
  if (requireExactTag && !tags.includes(version)) {
    fail(`release version ${version} is not an exact Git tag at HEAD`);
  }
  return version;
}

function resolveRepositoryPath(path: string, label: string): string {
  const absolute = resolve(rootDirectory, path);
  const repositoryRelative = relative(rootDirectory, absolute);
  if (
    repositoryRelative === '..' ||
    repositoryRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    fail(`${label} must stay inside the repository: ${path}`);
  }
  return absolute;
}

function checkCleanTree(required: boolean): void {
  if (!required) return;
  const status = execute(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'],
    { capture: true },
  );
  if (status.length > 0) {
    fail('Git tree is not clean; production builds require an exact, reproducible checkout');
  }
}

function dockerInfo(): DockerInfo {
  const parsed = asRecord(
    JSON.parse(execute('docker', ['info', '--format', '{{json .}}'], { capture: true })) as unknown,
    'docker info',
  );
  return {
    Architecture: asString(parsed.Architecture, 'dockerInfo.Architecture'),
    NCPU: asPositiveInteger(parsed.NCPU, 'dockerInfo.NCPU'),
    MemTotal: asPositiveInteger(parsed.MemTotal, 'dockerInfo.MemTotal'),
    OSType: asString(parsed.OSType, 'dockerInfo.OSType'),
  };
}

function availableDiskBytes(path: string): number {
  mkdirSync(path, { recursive: true });
  const stats = statfsSync(path, { bigint: true });
  return Number(stats.bavail * stats.bsize);
}

function preflight(
  contract: BuildContract,
  stateDirectory: string,
): {
  architecture: string;
  docker: DockerInfo;
} {
  execute('docker', ['compose', 'version'], { capture: true });
  execute('docker', ['buildx', 'version'], { capture: true });
  const docker = dockerInfo();
  const architecture = normalizeArchitecture(docker.Architecture);

  if (docker.OSType !== contract.requirements.operatingSystem) {
    fail(
      `Docker daemon OS ${docker.OSType} differs from required ${contract.requirements.operatingSystem}`,
    );
  }
  if (!contract.requirements.supportedArchitectures.includes(architecture)) {
    fail(`architecture ${architecture} is not supported`);
  }
  if (docker.NCPU < contract.requirements.minimumCpuCount) {
    fail(
      `Docker exposes ${String(docker.NCPU)} CPUs; at least ${String(contract.requirements.minimumCpuCount)} are required`,
    );
  }
  if (docker.MemTotal < contract.requirements.minimumMemoryBytes) {
    fail(
      `Docker exposes ${String(docker.MemTotal)} bytes of memory; at least ${String(contract.requirements.minimumMemoryBytes)} are required`,
    );
  }
  const freeDisk = availableDiskBytes(stateDirectory);
  if (freeDisk < contract.requirements.minimumFreeDiskBytes) {
    fail(
      `${String(freeDisk)} free bytes are available; at least ${String(contract.requirements.minimumFreeDiskBytes)} are required`,
    );
  }

  return { architecture, docker };
}

function whiteLabelMetadata(configPath: string): WhiteLabelMetadata {
  const absoluteConfig = resolveRepositoryPath(configPath, '--config');
  if (!existsSync(absoluteConfig)) {
    fail(`White-Label configuration does not exist: ${configPath}`);
  }

  execute('pnpm', [
    '--silent',
    '--filter',
    '@zglosto/white-label-config...',
    '--if-present',
    'build',
  ]);
  const output = execute(
    'pnpm',
    ['--silent', '--filter', '@zglosto/white-label-config', 'metadata', configPath, 'fields'],
    { capture: true },
  );
  const [cityKey, configVersion, configChecksum, validatedConfigPath, ...extra] =
    output.split('\t');
  if (
    cityKey === undefined ||
    configVersion === undefined ||
    configChecksum === undefined ||
    validatedConfigPath === undefined ||
    extra.length > 0
  ) {
    fail('White-Label metadata command returned an invalid record');
  }
  return {
    cityKey,
    configVersion,
    configChecksum,
    validatedConfigPath: relativeToRoot(
      resolveRepositoryPath(validatedConfigPath, 'validated White-Label configuration'),
    ),
  };
}

function imageExists(reference: string): boolean {
  return (
    spawnSync('docker', ['image', 'inspect', reference], {
      cwd: rootDirectory,
      encoding: 'utf8',
      stdio: 'ignore',
    }).status === 0
  );
}

function inspectBuiltImage(reference: string): {
  imageId: string;
  sizeBytes: number;
  architecture: string;
  operatingSystem: string;
} {
  const parsed = JSON.parse(
    execute('docker', ['image', 'inspect', reference], { capture: true }),
  ) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    return fail(`docker image inspect returned an invalid record for ${reference}`);
  }
  const image = asRecord(parsed[0], `image ${reference}`);
  return {
    imageId: asString(image.Id, `${reference}.Id`),
    sizeBytes: asPositiveInteger(image.Size, `${reference}.Size`),
    architecture: normalizeArchitecture(asString(image.Architecture, `${reference}.Architecture`)),
    operatingSystem: asString(image.Os, `${reference}.Os`),
  };
}

function relativeToRoot(path: string): string {
  return relative(rootDirectory, path);
}

function buildArtifact(
  artifact: Artifact,
  reference: string,
  platform: string,
  configPath: string,
): number {
  const context = resolveRepositoryPath(artifact.context, `${artifact.id}.context`);
  const dockerfile = resolveRepositoryPath(
    artifact.context === '.' ? artifact.dockerfile : join(artifact.context, artifact.dockerfile),
    `${artifact.id}.dockerfile`,
  );
  const commandArguments = [
    'buildx',
    'build',
    '--load',
    '--pull',
    '--platform',
    platform,
    '--file',
    dockerfile,
    '--tag',
    reference,
  ];
  if (artifact.whiteLabel) {
    commandArguments.push('--build-arg', `WHITE_LABEL_CONFIG_FILE=${configPath}`);
  }
  commandArguments.push(context);

  const startedAt = Date.now();
  execute('docker', commandArguments);
  return Math.ceil((Date.now() - startedAt) / 1000);
}

function imageContractArguments(artifacts: BuiltArtifact[]): string[] {
  return [
    'scripts/check-image-contract.ts',
    '--inspect',
    '--mode',
    'target',
    ...artifacts.flatMap((artifact: BuiltArtifact) => [
      '--image',
      `${artifact.id}=${artifact.reference}`,
    ]),
  ];
}

function writeArtifacts(
  candidateDirectory: string,
  manifest: JsonRecord,
  artifacts: BuiltArtifact[],
): void {
  const manifestPath = join(candidateDirectory, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  const environmentNames: Readonly<Record<string, string>> = {
    authorization: 'AUTHORIZATION_IMAGE',
    backend: 'BACKEND_IMAGE',
    database: 'DATABASE_IMAGE',
    frontend: 'FRONTEND_IMAGE',
    llm_gateway: 'LLM_GATEWAY_IMAGE',
    nginx: 'NGINX_IMAGE',
    pgbouncer: 'PGBOUNCER_IMAGE',
    rabbitmq: 'RABBITMQ_IMAGE',
  };
  const lines = artifacts
    .map((artifact: BuiltArtifact) => {
      const name = environmentNames[artifact.id];
      return name === undefined
        ? fail(`missing environment mapping for ${artifact.id}`)
        : `${name}=${artifact.reference}`;
    })
    .sort();
  const environmentPath = join(candidateDirectory, 'images.env');
  writeFileSync(environmentPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  chmodSync(environmentPath, 0o600);
}

function removeFailedImages(references: string[]): void {
  if (process.env.ZTO_KEEP_FAILED_BUILD === '1') return;
  for (const reference of references.reverse()) {
    spawnSync('docker', ['image', 'rm', '--force', reference], {
      cwd: rootDirectory,
      encoding: 'utf8',
      stdio: 'ignore',
    });
  }
}

function main(): void {
  process.chdir(rootDirectory);
  const contract = parseContract();
  const options = parseCli(process.argv.slice(2));
  const configuredStateDirectory = options.stateDirectory ?? contract.stateDirectory;
  const stateDirectory = resolveRepositoryPath(configuredStateDirectory, '--state-dir');

  checkCleanTree(contract.requirements.requireCleanGitTree);
  const version = resolveReleaseVersion(options.version, contract.requirements.requireExactGitTag);
  const host = preflight(contract, stateDirectory);
  const revision = execute('git', ['rev-parse', 'HEAD'], { capture: true });
  const source =
    executeOptional('git', ['config', '--get', 'remote.origin.url']) ??
    'https://github.com/zglosto/zglosto';
  const metadata = whiteLabelMetadata(options.configPath);
  execute('node', [
    resolveRepositoryPath(
      contract.sourceValidation.publicRepositoryScript,
      'source validation script',
    ),
  ]);

  console.log(
    `Validated ${version} at ${revision.slice(0, 12)} for linux/${host.architecture}; ` +
      `${host.docker.NCPU} CPUs, ${(host.docker.MemTotal / 1_073_741_824).toFixed(1)} GiB RAM.`,
  );
  if (options.command === 'validate') return;

  const candidateDirectory = join(stateDirectory, 'candidate');
  rmSync(candidateDirectory, { force: true, recursive: true });
  mkdirSync(candidateDirectory, { recursive: true, mode: 0o700 });

  const created = new Date().toISOString();
  const tag = `${version}-${host.architecture}-${revision.slice(0, 12)}`;
  const platform = `linux/${host.architecture}`;
  const built: BuiltArtifact[] = [];
  const builtReferences: string[] = [];
  const plannedReferences = contract.artifacts.map(
    (artifact: Artifact) => `${artifact.repository}:${tag}`,
  );

  for (const reference of plannedReferences) {
    if (imageExists(reference)) {
      fail(
        `immutable candidate tag already exists locally: ${reference}; ` +
          'use a new release commit/tag or remove the unpromoted candidate explicitly',
      );
    }
  }

  try {
    for (const artifact of contract.artifacts) {
      const reference = `${artifact.repository}:${tag}`;
      console.log(`\nBuilding ${artifact.id} as ${reference}`);
      const buildDurationSeconds = buildArtifact(artifact, reference, platform, options.configPath);
      if (buildDurationSeconds > artifact.maximumBuildSeconds) {
        fail(
          `${artifact.id} build took ${String(buildDurationSeconds)} s, above its ` +
            `${String(artifact.maximumBuildSeconds)} s cold-build budget`,
        );
      }
      builtReferences.push(reference);
      const inspected = inspectBuiltImage(reference);
      if (inspected.architecture !== host.architecture || inspected.operatingSystem !== 'linux') {
        fail(`${reference} was built for ${inspected.operatingSystem}/${inspected.architecture}`);
      }
      built.push({
        id: artifact.id,
        services: artifact.services,
        reference,
        ...inspected,
        buildDurationSeconds,
      });
    }

    execute('node', imageContractArguments(built));
    const totalBuildSeconds = built.reduce(
      (total: number, artifact: BuiltArtifact) => total + artifact.buildDurationSeconds,
      0,
    );
    if (totalBuildSeconds > contract.requirements.maximumTotalBuildSeconds) {
      fail(
        `image builds took ${String(totalBuildSeconds)} s in total, above the ` +
          `${String(contract.requirements.maximumTotalBuildSeconds)} s budget`,
      );
    }

    const finished = new Date().toISOString();
    writeArtifacts(
      candidateDirectory,
      {
        schemaVersion: 1,
        phase: '11.9',
        status: 'candidate',
        release: {
          version,
          revision,
          source,
          created,
          finished,
          architecture: host.architecture,
          platform,
          whiteLabel: metadata,
        },
        toolchain: {
          node: process.version,
          docker: execute('docker', ['version', '--format', '{{.Server.Version}}'], {
            capture: true,
          }),
          compose: execute('docker', ['compose', 'version', '--short'], { capture: true }),
          buildx: execute('docker', ['buildx', 'version'], { capture: true }),
        },
        policy: {
          nativeBuild: true,
          registryPush: false,
          retention: contract.retention,
          defaultModules: contract.defaultModules,
          moduleModes: contract.moduleModes,
          maximumTotalBuildSeconds: contract.requirements.maximumTotalBuildSeconds,
          measuredTotalBuildSeconds: totalBuildSeconds,
        },
        artifacts: built,
        externalComponents: contract.externalComponents,
        sourceValidation: {
          publicRepositoryScript: contract.sourceValidation.publicRepositoryScript,
        },
      },
      built,
    );
  } catch (error: unknown) {
    removeFailedImages(builtReferences);
    throw error;
  }

  console.log(`\nProduction image candidate is ready: ${relativeToRoot(candidateDirectory)}`);
  console.log('No deployment or database migration was performed.');
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
