import { afterAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'zglosto-anti-slop-test-'));
const config = join(directory, 'config.json');
writeFileSync(
  config,
  JSON.stringify({
    categories: { correctness: 'off', suspicious: 'off', perf: 'off' },
    plugins: ['typescript', 'oxc'],
    jsPlugins: [{ name: 'anti-slop', specifier: resolve('tools/oxlint/anti-slop/index.ts') }],
    rules: {
      'anti-slop/no-chained-type-assertions': 'error',
      'anti-slop/no-widen-then-assert': 'error',
      'anti-slop/no-reduce-accumulator-copy': 'error',
      'anti-slop/require-safety-comment-for-type-assertion': 'error',
      'oxc/no-accumulating-spread': 'error',
    },
  }),
);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function lint(source: string) {
  const file = join(directory, 'fixture.ts');
  writeFileSync(file, source);
  return spawnSync('bun', [resolve('node_modules/.bin/oxlint'), '--config', config, file], {
    encoding: 'utf8',
  });
}

test('loads the selected plugin and accepts precise types and justified assertions', () => {
  const result = lint(
    'const value = "ready" as const;\n// SAFETY: The boundary parser checked this field.\nconst parsed = external as string;',
  );
  expect(result.status).toBe(0);
});

test.each([
  ['no-chained-type-assertions', 'const result = external as unknown as string;'],
  ['no-widen-then-assert', 'const widened: unknown = "known"; const result = widened as string;'],
  [
    'no-reduce-accumulator-copy',
    'const result = [1, 2].reduce((acc, item) => Object.assign({}, acc, { [item]: item }), {});',
  ],
  ['require-safety-comment-for-type-assertion', 'const result = external as string;'],
  ['no-accumulating-spread', 'const result = [1, 2].reduce((acc, item) => [...acc, item], []);'],
])('rejects %s through the real Oxlint CLI', (rule, source) => {
  const result = lint(source);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain(rule);
});
