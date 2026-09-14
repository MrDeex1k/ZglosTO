import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? '.');
for (const [workspace, react, typescript] of [
  ['frontend', '19.2.8', '7.0.2'],
  ['Mobile', '19.2.3', '6.0.3'],
]) {
  const require = createRequire(join(root, workspace, 'package.json'));
  assert.equal(require('react/package.json').version, react);
  assert.equal(require('typescript/package.json').version, typescript);
  assert.equal(require('@babel/core/package.json').version, '7.29.7');
  // Complete each workspace check before reporting its result.
  // eslint-disable-next-line no-await-in-loop
  await Promise.all(
    ['@zglosto/contracts', '@zglosto/i18n'].map(
      (name) => import(pathToFileURL(require.resolve(name)).href),
    ),
  );
  console.log(JSON.stringify({ workspace, react, typescript, status: 'PASS' }));
}
let checks = 0;
for (const directory of readdirSync(join(root, 'node_modules/.bun'))) {
  for (const [parent, child, version] of [
    ['query-string', 'decode-uri-component', '0.5.0'],
    ['xcode', 'uuid', '11.1.1'],
    ['xmlbuilder2', 'js-yaml', '4.3.1'],
  ]) {
    const manifest = join(
      root,
      'node_modules/.bun',
      directory,
      'node_modules',
      parent,
      'package.json',
    );
    if (!existsSync(manifest)) continue;
    const require = createRequire(realpathSync(manifest));
    let folder = dirname(require.resolve(child));
    let found = false;
    while (dirname(folder) !== folder) {
      const file = join(folder, 'package.json');
      if (existsSync(file)) {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        if (data.name === child) {
          assert.equal(data.version, version);
          found = true;
          checks++;
          break;
        }
      }
      folder = dirname(folder);
    }
    assert.ok(found, parent + ' -> ' + child);
  }
}
assert.ok(checks >= 3);
console.log(JSON.stringify({ probe: 'nested-overrides', checks, status: 'PASS' }));
