import { writeFileSync } from 'node:fs';
import { validateEnvironment } from '../llm_gateway/src/environment.ts';
import { DockerModelRunnerRuntime } from '../llm_gateway/src/runtime.ts';

const sampleCount = Number(process.env.PHASE12_LLM_SAMPLES ?? '5');
if (!Number.isSafeInteger(sampleCount) || sampleCount < 2) {
  throw new Error('PHASE12_LLM_SAMPLES must be an integer of at least 2');
}
const environment = {
  ...validateEnvironment(),
  dockerModelRunnerUrl: process.env.DOCKER_MODEL_RUNNER_URL ?? 'http://127.0.0.1:12434',
};
const runtime = new DockerModelRunnerRuntime(environment);
const health = await runtime.health();
if (!health.loaded)
  throw new Error('Docker Model Runner does not expose the configured Basal model');

const durations: number[] = [];
for (let index = 0; index < sampleCount; index += 1) {
  const expected = index % 2 === 0 ? 'municipal' : 'emergency';
  const startedAt = performance.now();
  // oxlint-disable-next-line no-await-in-loop -- Sequential samples measure one DMR worker.
  const result = await runtime.classify({
    description:
      expected === 'municipal'
        ? 'Na chodniku znajduje się niewielka dziura.'
        : 'Pali się mieszkanie i ludzie są w środku.',
    address: null,
    city: null,
  });
  if (result.source !== 'model' || result.classification !== expected) {
    throw new Error(`Basal classification failed for sample ${index}: ${JSON.stringify(result)}`);
  }
  durations.push(performance.now() - startedAt);
}
const sorted = [...durations].sort((left, right) => left - right);
const report = {
  schemaVersion: 1,
  phase: '12',
  model: environment.dockerModelRunnerModel,
  engine: environment.dockerModelRunnerEngine,
  sampleCount,
  timeoutMs: environment.upstreamTimeoutMs,
  p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0),
  maximumMs: Math.round(sorted.at(-1) ?? 0),
  passed: durations.every((duration) => duration <= environment.upstreamTimeoutMs),
  capturedAt: new Date().toISOString(),
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.PHASE12_EVIDENCE_FILE) {
  writeFileSync(process.env.PHASE12_EVIDENCE_FILE, serialized, { mode: 0o600 });
}
process.stdout.write(serialized);
if (!report.passed) process.exitCode = 1;
