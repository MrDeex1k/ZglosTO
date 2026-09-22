import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const site = fileURLToPath(new URL('../', import.meta.url));
const compiler = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zglosto-typecheck-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: site,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

test('TS7 accepts valid TypeScript and rejects a semantic error', async (t) => {
  assert.equal(require('typescript/package.json').version, '7.0.2');
  assert.match(run(['run', '--bun', 'tsc', '--version']).output, /Version 7\.0\.2/);
  const root = await fixture(t);
  const file = join(root, 'example.ts');
  const args = [compiler, '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', file];
  await writeFile(file, 'export const count: number = 1;');
  assert.equal(run(args).status, 0);
  await writeFile(file, 'export const count: number = "wrong";');
  const result = run(args);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /TS2322/);
});

test('Astro with TS6 checks template props and imported TypeScript contracts', async (t) => {
  const root = await fixture(t);
  await symlink(join(site, '../node_modules'), join(root, 'node_modules'), 'dir');
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      extends: join(site, 'tsconfig.json'),
      include: ['**/*', join(site, 'src/env.d.ts')],
    }),
  );
  await writeFile(join(root, 'contract.ts'), 'export interface CounterProps { count: number }');
  await writeFile(
    join(root, 'Counter.astro'),
    '---\nimport type { CounterProps } from "./contract";\ninterface Props extends CounterProps {}\nconst { count } = Astro.props;\n---\n<p>{count}</p>',
  );
  const page = join(root, 'Page.astro');
  const args = ['scripts/check-astro.mjs', root];
  await writeFile(page, '---\nimport Counter from "./Counter.astro";\n---\n<Counter count={1} />');
  const valid = run(args);
  assert.equal(valid.status, 0, valid.output);
  assert.match(valid.output, /TS6\.0\.3/);
  await writeFile(
    page,
    '---\nimport Counter from "./Counter.astro";\n---\n<Counter count="wrong" />',
  );
  const invalid = run(args);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.output, /not assignable to type 'number'/);
});
