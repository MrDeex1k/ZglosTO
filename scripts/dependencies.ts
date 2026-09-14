// Execute dependency policy and the SFW wrapper on the pinned Bun runtime.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDependencyLock } from './lib/dependency-lock.ts';
import { changedPackages, validateRelease } from './lib/dependency-policy.ts';

declare const Bun: { version: string; JSON5: { parse(text: string): unknown } };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await withDependencyLock(root, async () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    packageManager: string;
    workspaces: string[];
  };
  if (`bun@${Bun.version}` !== manifest.packageManager)
    throw new Error(`Required ${manifest.packageManager}`);
  const sfw = join(root, 'node_modules/.bin/sfw');
  if (!existsSync(sfw))
    throw new Error('Bootstrap the reviewed lockfile with bun install --frozen-lockfile first.');
  function run(args: string[], cwd: string): void {
    const result = spawnSync('bun', [sfw, 'bun', ...args], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `Dependency command failed: ${result.error?.message ?? String(result.status)}`,
      );
  }
  const [operation, ...arguments_] = process.argv.slice(2);
  if (operation === 'install') {
    if (arguments_.length) throw new Error('deps:install takes no arguments');
    run(['install', '--frozen-lockfile'], root);
  } else {
    if (operation !== 'add' && operation !== 'update')
      throw new Error('Expected install, add or update');
    const workspaces = manifest.workspaces
      .flatMap((pattern) =>
        pattern.endsWith('/*')
          ? readdirSync(join(root, pattern.slice(0, -2)), { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => `${pattern.slice(0, -1)}${entry.name}`)
          : [pattern],
      )
      .filter((path) => existsSync(join(root, path, 'package.json')));
    let workspace = '';
    const args: string[] = [];
    for (let index = 0; index < arguments_.length; index++) {
      const value = arguments_[index]!;
      if (value === '--workspace') {
        workspace = arguments_[++index] ?? '';
        if (!workspaces.includes(workspace))
          throw new Error('Use an existing workspace path with --workspace');
      } else if (
        operation === 'add' &&
        (value === '--dev' ||
          value === '--optional' ||
          (!value.startsWith('-') &&
            /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(@[a-zA-Z0-9.*^~+<>=|-]+)?$/.test(value)))
      )
        args.push(value);
      else throw new Error(`Unsupported argument: ${value}`);
    }
    if (operation === 'add' && !args.some((value) => !value.startsWith('--')))
      throw new Error('Specify a registry package to add');
    const staging = mkdtempSync(join(tmpdir(), 'zglosto-dependencies-'));
    const paths = [
      'package.json',
      'bun.lock',
      'bunfig.toml',
      ...workspaces.map((path) => `${path}/package.json`),
    ];
    const originals = new Map(paths.map((path) => [path, readFileSync(join(root, path))]));
    try {
      for (const path of paths) {
        mkdirSync(dirname(join(staging, path)), { recursive: true });
        copyFileSync(join(root, path), join(staging, path));
      }
      run(
        [
          operation,
          ...(operation === 'update' ? ['--latest', ...(workspace ? [] : ['--recursive'])] : args),
          '--exact',
          '--lockfile-only',
          '--ignore-scripts',
        ],
        join(staging, workspace),
      );
      const changed = changedPackages(
        Bun.JSON5.parse(originals.get('bun.lock')!.toString()),
        Bun.JSON5.parse(readFileSync(join(staging, 'bun.lock'), 'utf8')),
      );
      const queue = [...changed];
      await Promise.all(
        Array.from({ length: Math.min(8, queue.length) }, async () => {
          while (queue.length) {
            const [name, versions] = queue.shift()!;
            // Bound registry concurrency to eight requests; fail before committing any files.
            // eslint-disable-next-line no-await-in-loop
            const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
              signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok)
              throw new Error(`Registry metadata unavailable: ${name} (${response.status})`);
            // eslint-disable-next-line no-await-in-loop
            const metadata: unknown = await response.json();
            for (const version of versions) validateRelease(metadata, name, version);
          }
        }),
      );
      for (const [path, original] of originals)
        if (!readFileSync(join(root, path)).equals(original))
          throw new Error(`Concurrent dependency edit: ${path}`);
      // No repository mutation or lifecycle execution occurs before every new transitive release passes.
      for (const path of paths) copyFileSync(join(staging, path), join(root, path));
      run(['install', '--frozen-lockfile'], root);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
});
