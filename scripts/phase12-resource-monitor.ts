import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

type StatsRow = Readonly<{
  ID: string;
  Name: string;
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
  PIDs: string;
}>;

type ContainerPeak = {
  id: string;
  name: string;
  service: string;
  maximumCpuPercent: number;
  maximumMemoryBytes: number;
  maximumMemoryPercent: number;
  maximumPids: number;
  samples: number;
};

function fail(message: string): never {
  throw new Error(`Phase 12 resource monitor failed: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fail(`missing ${name}`);
  const value = process.argv[index + 1];
  if (typeof value !== 'string' || value.length === 0) return fail(`missing value for ${name}`);
  return value;
}

function optionalNumberArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const raw = process.argv[index + 1];
  const value = typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return fail(`${name} must be a positive number`);
  return value;
}

function repeatedArguments(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (typeof value !== 'string' || value.length === 0) return fail(`missing value for ${name}`);
    values.push(value);
  }
  return values;
}

function docker(args: readonly string[]): string {
  return execFileSync('docker', [...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parsePercent(value: string, path: string): number {
  const parsed = Number(value.replace(/%$/u, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return fail(`invalid ${path}: ${value}`);
  return parsed;
}

function parseBytes(value: string): number {
  const match = /^([0-9]+(?:\.[0-9]+)?)(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB)$/u.exec(value.trim());
  if (match === null) return fail(`unsupported Docker memory value: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2];
  const factors: Readonly<Record<string, number>> = {
    B: 1,
    kB: 1_000,
    MB: 1_000_000,
    GB: 1_000_000_000,
    TB: 1_000_000_000_000,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
  };
  const factor = typeof unit === 'string' ? factors[unit] : null;
  if (typeof factor !== 'number') return fail(`unsupported Docker memory unit: ${String(unit)}`);
  return amount * factor;
}

function parseStats(payload: string): StatsRow[] {
  if (payload.length === 0) return [];
  return payload.split('\n').map((line, index) => {
    const value = record(JSON.parse(line) as unknown, `stats[${String(index)}]`);
    for (const key of ['ID', 'Name', 'CPUPerc', 'MemUsage', 'MemPerc', 'PIDs'] as const) {
      if (typeof value[key] !== 'string')
        return fail(`stats[${String(index)}].${key} must be text`);
    }
    return {
      ID: String(value.ID),
      Name: String(value.Name),
      CPUPerc: String(value.CPUPerc),
      MemUsage: String(value.MemUsage),
      MemPerc: String(value.MemPerc),
      PIDs: String(value.PIDs),
    };
  });
}

function containerService(id: string, fallback: string): string {
  const service = docker([
    'inspect',
    '--format',
    '{{ index .Config.Labels "com.docker.compose.service" }}',
    id,
  ]);
  return service.length > 0 && service !== '<no value>' ? service : fallback;
}

function projectContainerIds(project: string): string[] {
  const payload = docker([
    'ps',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.ID}}',
  ]);
  return payload.length === 0 ? [] : payload.split('\n').filter((value) => value.length > 0);
}

function namedContainerId(name: string): string | null {
  const payload = docker(['ps', '--filter', `name=^/${name}$`, '--format', '{{.ID}}']);
  const id = payload.split('\n').find((value) => value.length > 0);
  return typeof id === 'string' ? id : null;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

const project = requiredArgument('--project');
const profile = requiredArgument('--profile');
const output = resolve(requiredArgument('--output'));
const durationSeconds = optionalNumberArgument('--duration-seconds', 900);
const intervalMilliseconds = optionalNumberArgument('--interval-ms', 250);
const includedNames = repeatedArguments('--include-name');
const excludedServices = new Set(repeatedArguments('--exclude-service'));
const engine = record(JSON.parse(docker(['info', '--format', '{{json .}}'])) as unknown, 'engine');
const engineCpuCount = engine.NCPU;
const engineMemoryBytes = engine.MemTotal;
if (typeof engineCpuCount !== 'number' || typeof engineMemoryBytes !== 'number') {
  fail('Docker engine did not report numeric NCPU and MemTotal');
}

const startedAt = new Date();
const deadline = startedAt.getTime() + durationSeconds * 1000;
const peaks = new Map<string, ContainerPeak>();
const serviceCache = new Map<string, string>();
let stopRequested = false;
let samples = 0;
let failedSamples = 0;
let maximumTotalCpuPercent = 0;
let maximumTotalMemoryBytes = 0;
let maximumObservedContainers = 0;
let cpuPeakAt: string | null = null;
let memoryPeakAt: string | null = null;

process.once('SIGINT', () => {
  stopRequested = true;
});
process.once('SIGTERM', () => {
  stopRequested = true;
});

// The signal handlers above update this condition asynchronously.
// eslint-disable-next-line no-unmodified-loop-condition
while (!stopRequested && Date.now() < deadline) {
  try {
    const ids = new Set(projectContainerIds(project));
    for (const name of includedNames) {
      const id = namedContainerId(name);
      if (id !== null) ids.add(id);
    }
    if (ids.size === 0) {
      // Sampling is intentionally sequential to keep observations ordered.
      // eslint-disable-next-line no-await-in-loop
      await sleep(intervalMilliseconds);
      continue;
    }

    const rows = parseStats(
      docker(['stats', '--no-stream', '--format', '{{json .}}', ...Array.from(ids)]),
    );
    let totalCpuPercent = 0;
    let totalMemoryBytes = 0;
    let observedContainers = 0;
    const sampledAt = new Date().toISOString();

    for (const row of rows) {
      let service = serviceCache.get(row.ID);
      if (typeof service !== 'string') {
        service = containerService(row.ID, row.Name);
        serviceCache.set(row.ID, service);
      }
      if (excludedServices.has(service)) continue;

      const cpuPercent = parsePercent(row.CPUPerc, `${row.Name}.CPUPerc`);
      const memoryBytes = parseBytes(row.MemUsage.split('/')[0] ?? '');
      const memoryPercent = parsePercent(row.MemPerc, `${row.Name}.MemPerc`);
      const pids = Number(row.PIDs);
      if (!Number.isFinite(pids) || pids < 0) fail(`invalid ${row.Name}.PIDs`);

      totalCpuPercent += cpuPercent;
      totalMemoryBytes += memoryBytes;
      observedContainers += 1;

      const previous = peaks.get(row.Name);
      peaks.set(row.Name, {
        id: row.ID,
        name: row.Name,
        service,
        maximumCpuPercent: Math.max(previous?.maximumCpuPercent ?? 0, cpuPercent),
        maximumMemoryBytes: Math.max(previous?.maximumMemoryBytes ?? 0, memoryBytes),
        maximumMemoryPercent: Math.max(previous?.maximumMemoryPercent ?? 0, memoryPercent),
        maximumPids: Math.max(previous?.maximumPids ?? 0, pids),
        samples: (previous?.samples ?? 0) + 1,
      });
    }

    samples += 1;
    maximumObservedContainers = Math.max(maximumObservedContainers, observedContainers);
    if (totalCpuPercent > maximumTotalCpuPercent) {
      maximumTotalCpuPercent = totalCpuPercent;
      cpuPeakAt = sampledAt;
    }
    if (totalMemoryBytes > maximumTotalMemoryBytes) {
      maximumTotalMemoryBytes = totalMemoryBytes;
      memoryPeakAt = sampledAt;
    }
  } catch (error: unknown) {
    failedSamples += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[phase-12-resource] sample failed: ${message}`);
  }
  // Sampling is intentionally sequential to avoid overlapping Docker stats calls.
  // eslint-disable-next-line no-await-in-loop
  await sleep(intervalMilliseconds);
}

if (samples === 0) fail(`no running containers were sampled for project ${project}`);

const finishedAt = new Date();
const result = {
  schemaVersion: 1,
  phase: '12',
  kind: 'local-resource-measurement',
  profile,
  project,
  hostClassification: 'macos-arm64-orbstack',
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationSeconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
  requestedDurationSeconds: durationSeconds,
  intervalMilliseconds,
  samples,
  failedSamples,
  excludedServices: Array.from(excludedServices).sort(),
  includedContainerNames: includedNames,
  engine: {
    operatingSystem: engine.OperatingSystem,
    architecture: engine.Architecture,
    logicalCpu: engineCpuCount,
    memoryBytes: engineMemoryBytes,
    memoryGiB: engineMemoryBytes / 1024 ** 3,
  },
  totalPeak: {
    cpuPercent: maximumTotalCpuPercent,
    cpuCores: maximumTotalCpuPercent / 100,
    cpuPeakAt,
    memoryBytes: maximumTotalMemoryBytes,
    memoryMiB: maximumTotalMemoryBytes / 1024 ** 2,
    engineMemoryPercent: (maximumTotalMemoryBytes / engineMemoryBytes) * 100,
    memoryPeakAt,
    maximumObservedContainers,
  },
  containers: Array.from(peaks.values())
    .map((peak) => {
      return {
        id: peak.id,
        name: peak.name,
        service: peak.service,
        maximumCpuPercent: peak.maximumCpuPercent,
        maximumCpuCores: peak.maximumCpuPercent / 100,
        maximumMemoryBytes: peak.maximumMemoryBytes,
        maximumMemoryMiB: peak.maximumMemoryBytes / 1024 ** 2,
        maximumMemoryPercent: peak.maximumMemoryPercent,
        maximumPids: peak.maximumPids,
        samples: peak.samples,
      };
    })
    .sort((left, right) => right.maximumMemoryBytes - left.maximumMemoryBytes),
  limitations: [
    'Container peaks are sampled and can miss spikes shorter than one Docker stats interval.',
    'The result excludes Docker daemon, filesystem cache and macOS host overhead.',
    'OrbStack arm64 measurements are sizing evidence, not Ubuntu amd64 production certification.',
  ],
};

mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(
  `[phase-12-resource] ${profile}: CPU ${maximumTotalCpuPercent.toFixed(2)}% (${(maximumTotalCpuPercent / 100).toFixed(2)} cores), memory ${(maximumTotalMemoryBytes / 1024 ** 2).toFixed(2)} MiB; report ${output}`,
);
