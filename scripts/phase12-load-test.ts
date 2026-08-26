import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

type Scenario = 'incident-write' | 'llm' | 'public-read';
type Sample = { durationMs: number; ok: boolean; status: number };

function integerEnvironment(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeIntegerEnvironment(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function percentile(values: readonly number[], percentage: number): number {
  const sorted = [...values].sort((left: number, right: number) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1);
  return Math.round(sorted[index] ?? 0);
}

const scenario = (process.env.PHASE12_LOAD_SCENARIO ?? 'public-read') as Scenario;
if (scenario !== 'public-read' && scenario !== 'incident-write' && scenario !== 'llm') {
  throw new Error('PHASE12_LOAD_SCENARIO must be public-read, incident-write or llm');
}
const baseUrl = (process.env.PHASE12_BASE_URL ?? 'http://127.0.0.1:11335').replace(/\/+$/u, '');
const concurrency = integerEnvironment(
  'PHASE12_LOAD_CONCURRENCY',
  scenario === 'public-read' ? 100 : scenario === 'incident-write' ? 4 : 1,
);
const requests = integerEnvironment(
  'PHASE12_LOAD_REQUESTS',
  scenario === 'public-read' ? 1_000 : scenario === 'incident-write' ? 20 : 10,
);
const durationSeconds = nonNegativeIntegerEnvironment('PHASE12_LOAD_DURATION_SECONDS', 0);
const pacingMs = nonNegativeIntegerEnvironment('PHASE12_LOAD_PACING_MS', 0);
const timeoutMs = integerEnvironment('PHASE12_LOAD_TIMEOUT_MS', scenario === 'llm' ? 7_000 : 2_000);
const p95BudgetMs = integerEnvironment(
  'PHASE12_LOAD_P95_BUDGET_MS',
  scenario === 'public-read' ? 500 : 7_000,
);
const maximumErrorRate = Number.parseFloat(process.env.PHASE12_LOAD_MAX_ERROR_RATE ?? '0.01');
if (!Number.isFinite(maximumErrorRate) || maximumErrorRate < 0 || maximumErrorRate > 1) {
  throw new Error('PHASE12_LOAD_MAX_ERROR_RATE must be between 0 and 1');
}

async function executeRequest(index: number): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const response =
      scenario === 'public-read'
        ? await fetch(`${baseUrl}/api/mieszkaniec/incydenty/glowna`, {
            signal: AbortSignal.timeout(timeoutMs),
          })
        : scenario === 'incident-write'
          ? await fetch(`${baseUrl}/api/mieszkaniec/incydenty`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                opis_zgloszenia: `Test obciążeniowy Fazy 12 nr ${String(index)}.`,
                mail_zglaszajacego: `phase12-load-${String(index)}@example.com`,
                adres_zgloszenia: 'ul. Obciążeniowa 12',
                latitude: null,
                longitude: null,
                typ_sluzby: 'roads',
                zdjecie_incydentu_zglaszanego_upload_id: null,
              }),
              signal: AbortSignal.timeout(timeoutMs),
            })
          : await fetch(`${baseUrl}/llm/classify-incident`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                description:
                  index % 2 === 0
                    ? 'Uszkodzona ławka w parku.'
                    : 'Bezpośrednie zagrożenie życia po wypadku.',
              }),
              signal: AbortSignal.timeout(timeoutMs),
            });
    await response.arrayBuffer();
    return {
      durationMs: performance.now() - startedAt,
      ok: scenario === 'incident-write' ? response.status === 201 : response.ok,
      status: response.status,
    };
  } catch {
    return { durationMs: performance.now() - startedAt, ok: false, status: 0 };
  }
}

const samples: Sample[] = [];
let nextRequest = 0;
const startedAt = performance.now();
const deadline = startedAt + durationSeconds * 1_000;
await Promise.all(
  Array.from(
    { length: durationSeconds > 0 ? concurrency : Math.min(concurrency, requests) },
    async () => {
      while (durationSeconds > 0 ? performance.now() < deadline : nextRequest < requests) {
        const index = nextRequest;
        nextRequest += 1;
        // oxlint-disable-next-line no-await-in-loop -- Each virtual worker is sequential.
        samples.push(await executeRequest(index));
        if (pacingMs > 0) {
          // oxlint-disable-next-line no-await-in-loop -- Pacing is intentionally per worker.
          await delay(pacingMs);
        }
      }
    },
  ),
);
if (samples.length === 0) {
  throw new Error('Load test produced no samples');
}
const elapsedSeconds = (performance.now() - startedAt) / 1_000;
const failures = samples.filter(({ ok }: Sample) => !ok).length;
const errorRate = failures / samples.length;
const durations = samples.map(({ durationMs }: Sample) => durationMs);
const statuses = Object.fromEntries(
  [...new Set(samples.map(({ status }: Sample) => status))].map((status: number) => [
    String(status),
    samples.filter((sample: Sample) => sample.status === status).length,
  ]),
);
const p95Ms = percentile(durations, 0.95);
const report = {
  schemaVersion: 1,
  phase: '12',
  scenario,
  baseUrl,
  requests: samples.length,
  configuredRequests: durationSeconds === 0 ? requests : null,
  configuredDurationSeconds: durationSeconds,
  pacingMs,
  concurrency,
  elapsedSeconds: Math.round(elapsedSeconds * 100) / 100,
  requestsPerSecond: Math.round((samples.length / elapsedSeconds) * 100) / 100,
  p50Ms: percentile(durations, 0.5),
  p95Ms,
  p99Ms: percentile(durations, 0.99),
  maximumMs: Math.round(Math.max(...durations)),
  failures,
  errorRate,
  statuses,
  budgets: { p95Ms: p95BudgetMs, maximumErrorRate },
  passed: p95Ms <= p95BudgetMs && errorRate <= maximumErrorRate,
  capturedAt: new Date().toISOString(),
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.PHASE12_EVIDENCE_FILE) {
  writeFileSync(process.env.PHASE12_EVIDENCE_FILE, serialized, { mode: 0o600 });
}
process.stdout.write(serialized);
if (!report.passed) process.exitCode = 1;
