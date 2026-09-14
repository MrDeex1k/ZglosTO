import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderClusterCandidate } from './render-cluster-candidate.ts';
import { evaluateBunPerformance } from './lib/bun-performance.ts';

test('candidate renderer pins every image on both platforms and enables distributed limits', () => {
  for (const profile of ['kubernetes', 'k3s']) {
    const rendered = renderClusterCandidate(profile, 'bun-acceptance-test');
    assert.ok(!rendered.includes(':phase9-baseline'));
    assert.match(rendered, /-h\s+127\.0\.0\.1\s+--raw PING/u);
    assert.ok(rendered.includes('timeoutSeconds: 5'));
    assert.ok(rendered.includes('error_page 502 504 =503 @llm_health_unavailable;'));
    assert.ok(rendered.includes('image: docker.io/zglosto/backend:bun-acceptance-test'));
    assert.ok(rendered.includes('name: REDIS_MODE\n          value: local'));
  }
  assert.throws(() => renderClusterCandidate('production', 'test'));
  assert.throws(() => renderClusterCandidate('k3s', 'latest'));
  assert.throws(() => renderClusterCandidate('k3s', 'bad\nimages:'));
});
const fixtures = () =>
  ['node', 'bun', 'node', 'bun', 'node', 'bun'].map((runtime) => ({
    runtime,
    p95Ms: 100,
    failures: 0,
    passed: true,
    rss: { backend: 100, authorization: 100, media_worker: 100, llm_gateway: 100 },
  }));
test('performance gate rejects missing evidence, errors and per-service RSS regressions', () => {
  assert.equal(evaluateBunPerformance(fixtures()).passed, true);
  assert.throws(() => evaluateBunPerformance(fixtures().slice(1)));
  const errors = fixtures();
  errors[1]!.failures = 1;
  assert.throws(() => evaluateBunPerformance(errors));
  const memory = fixtures();
  for (const row of memory.filter((sample) => sample.runtime === 'bun')) row.rss.media_worker = 111;
  assert.equal(evaluateBunPerformance(memory).passed, false);
  const latency = fixtures();
  for (const row of latency.filter((sample) => sample.runtime === 'bun')) row.p95Ms = 111;
  assert.equal(evaluateBunPerformance(latency).passed, false);
});

test('cluster smoke cannot accept another listener after its port-forward fails to bind', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-forward-test-'));
  const marker = join(directory, 'curl-called');
  try {
    writeFileSync(
      join(directory, 'kubectl'),
      `#!/bin/sh
case " $* " in
  *" port-forward "*) echo 'address already in use' >&2; exit 1 ;;
esac
exit 0
`,
    );
    writeFileSync(join(directory, 'curl'), '#!/bin/sh\ntouch "$FORWARD_TEST_MARKER"\nexit 0\n');
    chmodSync(join(directory, 'kubectl'), 0o755);
    chmodSync(join(directory, 'curl'), 0o755);
    const result = spawnSync('bash', ['scripts/smoke-cluster.sh'], {
      cwd: resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        FORWARD_TEST_MARKER: marker,
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /port-forward terminated/u);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
