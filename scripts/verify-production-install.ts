import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [directory, service] = process.argv.slice(2);
if (!directory || !service) throw new Error('Expected staging directory and service');
const root = realpathSync(resolve(directory));
function inspect(path: string): void {
  for (const name of readdirSync(path)) {
    const file = join(path, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink())
      assert.ok(realpathSync(file).startsWith(root + sep), `External symlink: ${file}`);
    else if (stat.isDirectory()) inspect(file);
  }
}
inspect(root);
const workspaces = [
  service,
  ...readdirSync(join(root, 'packages')).map((name) => `packages/${name}`),
];
let imports = 0;
for (const workspace of ['', ...workspaces]) {
  for (const forbidden of ['typescript', 'vitest', 'expo', 'sfw', 'turbo', 'oxlint', 'oxfmt'])
    assert.equal(
      existsSync(join(root, workspace, 'node_modules', forbidden)),
      false,
      `Unexpected development package: ${forbidden}`,
    );
  if (!workspace) continue;
  const manifestPath = join(root, workspace, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const local = createRequire(manifestPath);
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    // Keep failures attributable to a single dependency and its initialization.
    // eslint-disable-next-line no-await-in-loop
    await import(pathToFileURL(local.resolve(name)).href);
    imports++;
  }
}
console.log(
  `Production install verified: ${imports} runtime imports, closed symlinks, no development tools`,
);
