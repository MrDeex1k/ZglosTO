import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { withDependencyLock } from './lib/dependency-lock.ts';

const scripts = resolve('scripts');
function put(root: string, path: string, value: unknown): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
}
function run(script: string, cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [join(scripts, script), ...args], { cwd, encoding: 'utf8' });
}
test('dependency lock excludes another process, preserves its owner and releases after errors', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bun-lock-test-'));
  try {
    await withDependencyLock(root, async () => {
      const child = spawnSync(
        process.execPath,
        [
          '--eval',
          `import { withDependencyLock } from ${JSON.stringify(pathToFileURL(join(scripts, 'lib/dependency-lock.ts')).href)}; await withDependencyLock(${JSON.stringify(root)}, async () => {});`,
        ],
        { encoding: 'utf8' },
      );
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /Dependency operation locked/);
      assert.ok(existsSync(join(root, '.state/dependency-operation.lock')));
    });
    await assert.rejects(
      withDependencyLock(root, async () => {
        throw new Error('fixture failure');
      }),
      /fixture failure/,
    );
    await withDependencyLock(root, async () => {});
    assert.ok(!existsSync(join(root, '.state/dependency-operation.lock')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('production staging follows transitive optional workspaces and verification rejects broken installed optionals', () => {
  const root = mkdtempSync(join(tmpdir(), 'bun-stage-test-'));
  try {
    put(root, 'package.json', { private: true, workspaces: ['backend', 'packages/*'] });
    put(root, 'bun.lock', '{}');
    put(root, 'bunfig.toml', '');
    put(root, 'backend/package.json', {
      name: 'backend',
      optionalDependencies: { '@fixture/one': 'workspace:*', absent: '1.0.0' },
    });
    put(root, 'backend/dist/index.js', '');
    put(root, 'packages/one/package.json', {
      name: '@fixture/one',
      main: 'dist/index.js',
      optionalDependencies: { '@fixture/two': 'workspace:*' },
    });
    put(root, 'packages/one/dist/index.js', 'module.exports = {};');
    put(root, 'packages/two/package.json', { name: '@fixture/two', main: 'dist/index.js' });
    put(root, 'packages/two/dist/index.js', 'module.exports = {};');
    const target = join(root, 'staged');
    const staged = run('stage-production.ts', root, ['backend', target]);
    assert.equal(staged.status, 0, staged.stderr);
    assert.ok(existsSync(join(target, 'packages/two/dist/index.js')));
    mkdirSync(join(target, 'node_modules/@fixture'), { recursive: true });
    for (const name of ['one', 'two'])
      symlinkSync(join(target, 'packages', name), join(target, 'node_modules/@fixture', name));
    const verified = run('verify-production-install.ts', root, [target, 'backend']);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /2 runtime imports/);
    put(target, 'packages/two/dist/index.js', "throw new Error('broken optional initialization');");
    const broken = run('verify-production-install.ts', root, [target, 'backend']);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /broken optional initialization/);
    put(target, 'packages/two/package.json', { name: '@fixture/two', main: 'missing.js' });
    assert.notEqual(run('verify-production-install.ts', root, [target, 'backend']).status, 0);
    put(root, 'packages/one/package.json', {
      name: '@fixture/one',
      optionalDependencies: { '@fixture/missing': 'workspace:*' },
    });
    const missing = run('stage-production.ts', root, ['backend', join(root, 'missing-stage')]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing workspace dependency/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
