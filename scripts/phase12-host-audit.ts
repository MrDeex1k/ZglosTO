import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';

type HostKind = 'local-development' | 'ubuntu-production' | 'windows-wsl2-compatibility';
type Check = { name: string; passed: boolean; actual: string; expected: string };

function commandOutput(command: string, arguments_: readonly string[]): string {
  return execFileSync(command, arguments_, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gibibytes(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 100) / 100;
}

function parseHostKind(value: string | undefined): HostKind {
  if (
    value === 'local-development' ||
    value === 'ubuntu-production' ||
    value === 'windows-wsl2-compatibility'
  ) {
    return value;
  }
  throw new Error(
    'PHASE12_HOST_KIND must be local-development, ubuntu-production or windows-wsl2-compatibility',
  );
}

function operatingSystemId(): string {
  if (!existsSync('/etc/os-release')) return platform();
  const match = readFileSync('/etc/os-release', 'utf8').match(/^ID=(?:"([^"]+)"|([^\n]+))$/mu);
  return match?.[1] ?? match?.[2] ?? 'unknown';
}

function isWsl(): boolean {
  if (!existsSync('/proc/version')) return false;
  return /microsoft|wsl/iu.test(readFileSync('/proc/version', 'utf8'));
}

const hostKind = parseHostKind(process.env.PHASE12_HOST_KIND ?? 'local-development');
const filesystem = statfsSync(process.cwd());
const diskTotalGiB = gibibytes(filesystem.blocks * filesystem.bsize);
const memoryGiB = gibibytes(totalmem());
const logicalCpu = cpus().length;
const osId = operatingSystemId();
const wsl = isWsl();
const checks: Check[] = [
  {
    name: 'architecture',
    passed: arch() === 'x64',
    actual: arch(),
    expected: 'x64/amd64 (32-bit x86 is unsupported)',
  },
  {
    name: 'logical-cpu',
    passed: logicalCpu >= 6,
    actual: String(logicalCpu),
    expected: 'at least 6',
  },
  {
    name: 'memory',
    passed: memoryGiB >= 15.5,
    actual: `${String(memoryGiB)} GiB`,
    expected: 'at least 16 GiB nominal',
  },
  {
    name: 'disk',
    passed: diskTotalGiB >= 100,
    actual: `${String(diskTotalGiB)} GiB`,
    expected: 'at least 100 GiB',
  },
];

if (hostKind === 'ubuntu-production') {
  checks.push(
    {
      name: 'native-ubuntu',
      passed: platform() === 'linux' && osId === 'ubuntu' && !wsl,
      actual: `${platform()}/${osId}; wsl=${String(wsl)}`,
      expected: 'native Ubuntu Server, not WSL',
    },
    {
      name: 'systemd',
      passed: existsSync('/run/systemd/system'),
      actual: String(existsSync('/run/systemd/system')),
      expected: 'systemd active',
    },
  );
  try {
    commandOutput('nft', ['--version']);
    checks.push({ name: 'nftables', passed: true, actual: 'installed', expected: 'installed' });
  } catch {
    checks.push({ name: 'nftables', passed: false, actual: 'missing', expected: 'installed' });
  }
}

if (hostKind === 'windows-wsl2-compatibility') {
  checks.push({
    name: 'windows-wsl2',
    passed: platform() === 'win32' || wsl,
    actual: `${platform()}; wsl=${String(wsl)}`,
    expected: 'Windows or WSL2',
  });
}

let dockerServerVersion = 'unavailable';
let composeVersion = 'unavailable';
let modelRunner = 'unavailable';
try {
  dockerServerVersion = commandOutput('docker', ['info', '--format', '{{.ServerVersion}}']);
  checks.push({
    name: 'docker-engine',
    passed: dockerServerVersion.length > 0,
    actual: dockerServerVersion,
    expected: 'running',
  });
} catch {
  checks.push({
    name: 'docker-engine',
    passed: false,
    actual: 'unavailable',
    expected: 'running',
  });
}
try {
  composeVersion = commandOutput('docker', ['compose', 'version', '--short']);
  checks.push({
    name: 'docker-compose',
    passed: composeVersion.length > 0,
    actual: composeVersion,
    expected: 'Compose v2 with models support',
  });
} catch {
  checks.push({
    name: 'docker-compose',
    passed: false,
    actual: 'unavailable',
    expected: 'Compose v2 with models support',
  });
}
try {
  modelRunner = commandOutput('docker', ['model', 'status']);
  checks.push({
    name: 'docker-model-runner',
    passed: modelRunner.includes('Docker Model Runner is running'),
    actual: modelRunner.split('\n')[0] ?? 'unknown',
    expected: 'running for the minimal profile',
  });
} catch {
  checks.push({
    name: 'docker-model-runner',
    passed: false,
    actual: 'unavailable',
    expected: 'running for the minimal profile',
  });
}

const report = {
  schemaVersion: 1,
  phase: '12',
  hostKind,
  capturedAt: new Date().toISOString(),
  platform: {
    nodePlatform: platform(),
    architecture: arch(),
    release: release(),
    osId,
    wsl,
    logicalCpu,
    memoryGiB,
    diskTotalGiB,
  },
  runtime: { dockerServerVersion, composeVersion, modelRunner: modelRunner.split('\n')[0] },
  checks,
  passed: checks.every(({ passed }: Check) => passed),
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = process.env.PHASE12_EVIDENCE_FILE;
if (outputPath) writeFileSync(outputPath, serialized, { mode: 0o600 });
process.stdout.write(serialized);
if (!report.passed && hostKind !== 'local-development') process.exitCode = 1;
