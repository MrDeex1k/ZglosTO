import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const manifestPath = 'docs/release-1.0.0-file-manifest.txt';
const keep = process.argv.includes('--keep');

function fail(message: string): never {
  throw new Error(`Isolated release-source verification failed: ${message}`);
}

function run(command: string, arguments_: string[], cwd: string): void {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.error !== undefined) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0)
    fail(`${command} ${arguments_.join(' ')} exited with ${String(result.status)}`);
}

if (!existsSync(manifestPath)) fail(`missing ${manifestPath}; run pnpm release:manifest first`);
const paths = readFileSync(manifestPath, 'utf8')
  .split('\n')
  .filter((path: string) => path.length > 0);
if (paths.length === 0 || new Set(paths).size !== paths.length) {
  fail('manifest must contain unique paths');
}

const candidate = mkdtempSync(join(tmpdir(), 'zglosto-release-1.0.0-'));
try {
  for (const path of paths) {
    const source = resolve(root, path);
    if (!existsSync(source)) fail(`manifest references a missing file: ${path}`);
    const destination = join(candidate, path);
    mkdirSync(dirname(destination), { recursive: true });
    const sourceStat = lstatSync(source);
    if (sourceStat.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), destination);
    } else if (sourceStat.isFile()) {
      copyFileSync(source, destination);
      chmodSync(destination, sourceStat.mode);
    } else {
      fail(`manifest contains unsupported entry: ${path}`);
    }
  }

  run('git', ['init', '--quiet'], candidate);
  run('git', ['add', '--all'], candidate);
  run(
    'git',
    [
      '-c',
      'user.name=ZglosTO Release Verification',
      '-c',
      'user.email=release-verification@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'chore(repo): verify 1.0.0 source candidate',
    ],
    candidate,
  );

  const packageManagerEntrypoint = process.env.npm_execpath;
  const executable = packageManagerEntrypoint === undefined ? 'pnpm' : process.execPath;
  const prefix = packageManagerEntrypoint === undefined ? [] : [packageManagerEntrypoint];
  run(executable, [...prefix, 'install', '--offline', '--frozen-lockfile'], candidate);
  run(executable, [...prefix, 'check'], candidate);
  run(executable, [...prefix, 'audit:release'], candidate);
  process.stdout.write(
    `[isolated-release] PASS: ${String(paths.length)} manifest files verified in a clean Git repository at ${candidate}.\n`,
  );
} finally {
  if (!keep) rmSync(candidate, { recursive: true, force: true });
  else process.stdout.write(`[isolated-release] kept candidate at ${candidate}.\n`);
}
