import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { changedPackages, validateRelease, assertCleanAudit } from './lib/dependency-policy.ts';
const now = Date.parse('2026-09-12T12:00:00Z');
const metadata = (date: unknown) => ({ time: { '1.0.0': date }, versions: { '1.0.0': {} } });
test('release policy accepts the 24h boundary and fails closed on missing, invalid and future dates', () => {
  validateRelease(metadata(new Date(now - 86400000).toISOString()), 'fixture', '1.0.0', now);
  for (const date of [
    null,
    '',
    'invalid',
    new Date(now - 86399999).toISOString(),
    new Date(now + 1).toISOString(),
  ])
    assert.throws(() => validateRelease(metadata(date), 'fixture', '1.0.0', now));
  assert.throws(() =>
    validateRelease(
      { ...metadata(new Date(0).toISOString()), versions: { '1.0.0': { deprecated: 'unsafe' } } },
      'fixture',
      '1.0.0',
      now,
    ),
  );
});
test('lock comparison covers transitive and scoped releases plus integrity changes', () => {
  const previous = {
    packages: { a: ['a@1.0.0', '', {}, 'sha512-old'], w: ['w@workspace:packages/w'] },
  };
  const candidate = {
    packages: {
      ...previous.packages,
      a: ['a@1.0.0', '', {}, 'sha512-new'],
      'a/@scope/b': ['@scope/b@2.0.0', '', {}, 'sha512-b'],
    },
  };
  assert.deepEqual(
    [...changedPackages(previous, candidate)].map(([name, versions]) => [name, [...versions]]),
    [
      ['a', ['1.0.0']],
      ['@scope/b', ['2.0.0']],
    ],
  );
  assert.equal(changedPackages(previous, previous).size, 0);
  assert.throws(() => changedPackages(previous, { packages: { a: ['a@git:unreviewed'] } }));
});
test('audit accepts only successful empty registry object', () => {
  assertCleanAudit(0, '{}');
  for (const [status, output] of [
    [1, '{}'],
    [null, '{}'],
    [0, ''],
    [0, '[]'],
    [0, '{"error":"offline"}'],
    [0, '{"vulnerable":[{}]}'],
  ] as const)
    assert.throws(() => assertCleanAudit(status, output));
});

test('dependency CLI rejects bypass flags without modifying repository manifests', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const files = ['package.json', 'Mobile/package.json', 'bun.lock'];
  const before = files.map((file) => readFileSync(file, 'utf8'));
  for (const argument of ['--force', '--no-save', '--registry', 'fixture@file:../local']) {
    const result = spawnSync('bun', ['scripts/dependencies.ts', 'add', argument], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported argument/);
  }
  assert.deepEqual(
    files.map((file) => readFileSync(file, 'utf8')),
    before,
  );
});
