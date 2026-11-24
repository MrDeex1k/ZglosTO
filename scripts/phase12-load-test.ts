import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parseCurrentCreateIncidentResponse } from '../packages/contracts/src/incidents.ts';
import {
  LLM_CLASSIFICATION_CONTENT_TYPE,
  LLM_CLASSIFICATION_HTTP_METHOD,
  LLM_CLASSIFICATION_PATH,
  parseLlmClassificationResponse,
} from '../packages/contracts/src/llm.ts';
import { InitiateImageUploadResponseSchema } from '../packages/contracts/src/uploads.ts';

type Scenario = 'incident-write' | 'llm' | 'public-read' | 'backend-read';
type MediaTarget = { incidentId: string; imageId: string };
type Outcome = { ok: boolean; status: number; media?: MediaTarget };
type Sample = Outcome & { durationMs: number };

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
if (
  scenario !== 'public-read' &&
  scenario !== 'backend-read' &&
  scenario !== 'incident-write' &&
  scenario !== 'llm'
) {
  throw new Error('PHASE12_LOAD_SCENARIO must be public-read, backend-read, incident-write or llm');
}
const readScenario = scenario === 'public-read' || scenario === 'backend-read';
const baseUrl = (process.env.PHASE12_BASE_URL ?? 'http://127.0.0.1:11335').replace(/\/+$/u, '');
const origin = baseUrl.replace('127.0.0.1', 'localhost');
const runId = randomUUID();
// Synthetic PNG used by the integration suite. Each request uploads its own object.
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPgqrjzH4QZYAwATqAJdcbiRDcAAAAASUVORK5CYII=',
  'base64',
);
const checksumSha256 = createHash('sha256').update(image).digest('hex');
const concurrency = integerEnvironment(
  'PHASE12_LOAD_CONCURRENCY',
  readScenario ? 100 : scenario === 'incident-write' ? 4 : 1,
);
const requests = integerEnvironment(
  'PHASE12_LOAD_REQUESTS',
  readScenario ? 1_000 : scenario === 'incident-write' ? 20 : 10,
);
const durationSeconds = nonNegativeIntegerEnvironment('PHASE12_LOAD_DURATION_SECONDS', 0);
const pacingMs = nonNegativeIntegerEnvironment('PHASE12_LOAD_PACING_MS', 0);
const timeoutMs = integerEnvironment('PHASE12_LOAD_TIMEOUT_MS', scenario === 'llm' ? 7_000 : 2_000);
const p95BudgetMs = integerEnvironment('PHASE12_LOAD_P95_BUDGET_MS', readScenario ? 500 : 7_000);
const maximumErrorRate = Number.parseFloat(process.env.PHASE12_LOAD_MAX_ERROR_RATE ?? '0.01');
if (!Number.isFinite(maximumErrorRate) || maximumErrorRate < 0 || maximumErrorRate > 1) {
  throw new Error('PHASE12_LOAD_MAX_ERROR_RATE must be between 0 and 1');
}

const llm = scenario === 'llm' ? await connectLlm() : null;

async function connectLlm() {
  const { validateLlmEnvironment } = await import('../backend/config/env.ts');
  const { createLlmGatewayClient } = await import('../backend/lib/llm-gateway-client.ts');
  const environment = validateLlmEnvironment();
  return {
    client: createLlmGatewayClient(environment),
    url: new URL(LLM_CLASSIFICATION_PATH, environment.gatewayUrl),
  };
}

async function writeIncident(index: number, signal: AbortSignal): Promise<Outcome> {
  const headers = { 'content-type': 'application/json', origin };
  const initiated = await fetch(`${baseUrl}/api/mieszkaniec/obrazy/uploads`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ checksumSha256, mimeType: 'image/png', sizeBytes: image.byteLength }),
    signal,
  });
  if (initiated.status !== 201) {
    await initiated.arrayBuffer();
    return { ok: false, status: initiated.status };
  }
  const upload = InitiateImageUploadResponseSchema.parse(await initiated.json());
  const uploaded = await fetch(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers,
    body: image,
    signal,
  });
  await uploaded.arrayBuffer();
  if (!uploaded.ok) return { ok: false, status: uploaded.status };

  const response = await fetch(`${baseUrl}/api/mieszkaniec/incydenty`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      opis_zgloszenia: `Test obciążeniowy Fazy 12 nr ${String(index)}.`,
      mail_zglaszajacego: `phase12-${runId}-${String(index)}@example.com`,
      adres_zgloszenia: 'ul. Obciążeniowa 12',
      latitude: null,
      longitude: null,
      typ_sluzby: 'roads',
      zdjecie_incydentu_zglaszanego_upload_id: upload.uploadId,
    }),
    signal,
  });
  if (response.status !== 201) {
    await response.arrayBuffer();
    return { ok: false, status: response.status };
  }
  const { incydent } = parseCurrentCreateIncidentResponse(await response.json());
  const reportImage = incydent.zdjecie_incydentu_zglaszanego;
  if (reportImage === null) return { ok: false, status: response.status };
  return {
    ok: true,
    status: response.status,
    media: { incidentId: incydent.id_zgloszenia, imageId: reportImage.id },
  };
}

async function requestOutcome(index: number, signal: AbortSignal): Promise<Outcome> {
  if (scenario === 'incident-write') return writeIncident(index, signal);
  if (llm !== null) {
    const expected = index % 2 === 0 ? 'municipal' : 'emergency';
    const response = await llm.client.fetch(llm.url, {
      method: LLM_CLASSIFICATION_HTTP_METHOD,
      headers: { 'content-type': LLM_CLASSIFICATION_CONTENT_TYPE },
      body: JSON.stringify({
        description:
          expected === 'municipal'
            ? 'Na chodniku znajduje się niewielka dziura.'
            : 'Pali się mieszkanie i ludzie są w środku.',
        address: null,
        city: null,
      }),
      signal,
    });
    if (!response.ok) return { ok: false, status: response.status };
    const result = parseLlmClassificationResponse(await response.json());
    return {
      ok: result.source === 'model' && result.modelAvailable && result.classification === expected,
      status: response.status,
    };
  }
  const response = await fetch(
    `${baseUrl}${scenario === 'backend-read' ? '' : '/api'}/mieszkaniec/incydenty/glowna`,
    { signal },
  );
  await response.arrayBuffer();
  return { ok: response.ok, status: response.status };
}

async function executeRequest(index: number): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const outcome = await requestOutcome(index, AbortSignal.timeout(timeoutMs));
    return { ...outcome, durationMs: performance.now() - startedAt };
  } catch {
    return { durationMs: performance.now() - startedAt, ok: false, status: 0 };
  }
}

const samples: Sample[] = [];
let nextRequest = 0;
const startedAt = performance.now();
const deadline = startedAt + durationSeconds * 1_000;
try {
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
} finally {
  llm?.client.close();
}
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
  baseUrl: llm?.url.origin ?? baseUrl,
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
  maximumMs: Math.round(durations.reduce((maximum, value) => Math.max(maximum, value), 0)),
  failures,
  ...(scenario === 'incident-write'
    ? { mediaTargets: samples.flatMap(({ media }) => (media ? [media] : [])) }
    : {}),
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
