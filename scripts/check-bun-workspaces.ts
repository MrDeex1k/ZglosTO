import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const bunVersion = readFileSync(join(root, '.bun-version'), 'utf8').trim();
assert.equal(manifest.packageManager, `bun@${bunVersion}`, 'Bun pins must agree');
assert.ok(existsSync(join(root, 'bun.lock')), 'bun.lock is required');
assert.ok(!existsSync(join(root, 'pnpm-workspace.yaml')), 'Use package.json workspaces');
const workspaceDirectories: string[] = manifest.workspaces.flatMap((workspace: string) =>
  workspace.endsWith('/*')
    ? readdirSync(join(root, workspace.slice(0, -2)), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(workspace.slice(0, -2), entry.name))
    : [workspace],
);
for (const workspace of ['.', ...workspaceDirectories]) {
  for (const lock of [
    'pnpm-lock.yaml',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'bun.lockb',
  ]) {
    assert.ok(!existsSync(join(root, workspace, lock)), `${workspace}: unexpected ${lock}`);
  }
  if (workspace !== '.') {
    assert.ok(
      !existsSync(join(root, workspace, 'bun.lock')),
      `${workspace}: use the root lockfile`,
    );
  }
  const file = join(root, workspace, 'package.json');
  const metadata = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(!('pnpm' in metadata), `${workspace}: obsolete pnpm configuration`);
  if (metadata.packageManager) assert.equal(metadata.packageManager, `bun@${bunVersion}`);
  for (const [name, command] of Object.entries(metadata.scripts ?? {})) {
    assert.ok(
      !/\b(?:pnpm|pnpx|npm|npx|yarn)\b/.test(String(command)),
      `${workspace}:${name}: use Bun`,
    );
  }
}
for (const [workspace, react, typescript] of [
  ['frontend', '19.3.0', '7.0.2'],
  ['Mobile', '19.2.3', '6.0.3'],
  ['docs-site', '19.3.0', '7.0.2'],
]) {
  const local = createRequire(resolve(workspace, 'package.json'));
  assert.equal(local('react/package.json').version, react);
  assert.equal(local('typescript/package.json').version, typescript);
  assert.equal(local('@babel/core/package.json').version, '7.29.7');
}
const docsRequire = createRequire(resolve('docs-site/package.json'));
assert.equal(docsRequire('typescript-astro/package.json').version, '6.0.3');
assert.equal(typeof docsRequire('typescript-astro').createProgram, 'function');
const rules = new Map([
  ['query-string', ['decode-uri-component', '0.5.0']],
  ['xcode', ['uuid', '11.1.1']],
  ['xmlbuilder2', ['js-yaml', '4.3.2']],
]);
const seen = new Set<string>();
const checked = new Set<string>();
function inspectModules(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    if (entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (entry.startsWith('@')) {
      inspectModules(path);
      continue;
    }
    const manifest = join(path, 'package.json');
    if (!existsSync(manifest)) continue;
    const real = realpathSync(manifest);
    if (seen.has(real)) continue;
    seen.add(real);
    const { name } = JSON.parse(readFileSync(real, 'utf8')) as { name: string };
    const rule = rules.get(name);
    if (rule) {
      const [child, version] = rule;
      let folder = dirname(createRequire(real).resolve(child));
      while (true) {
        const file = join(folder, 'package.json');
        const metadata = existsSync(file)
          ? (JSON.parse(readFileSync(file, 'utf8')) as { name: string; version: string })
          : null;
        if (metadata?.name === child) {
          assert.equal(metadata.version, version, `${name} > ${child}`);
          checked.add(name);
          break;
        }
        assert.notEqual(dirname(folder), folder, `Unresolved override: ${child}`);
        folder = dirname(folder);
      }
    }
    inspectModules(join(path, 'node_modules'));
  }
}
inspectModules(join(root, 'node_modules'));
for (const workspace of [
  'frontend',
  'Mobile',
  'backend',
  'authorization',
  'llm_gateway',
  'docs-site',
])
  inspectModules(join(root, workspace, 'node_modules'));
assert.equal(checked.size, rules.size);
console.log(
  'Bun workspaces: one manager/lockfile, workspace React/TypeScript versions and scoped overrides verified.',
);
