import { writeFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

const endpoint = (process.env.DOCKER_MODEL_RUNNER_URL ?? 'http://127.0.0.1:12434').replace(
  /\/+$/u,
  '',
);
const engine = process.env.DOCKER_MODEL_RUNNER_ENGINE ?? 'llama.cpp';
const model = process.env.DOCKER_MODEL_RUNNER_MODEL ?? 'ai/gemma3-qat:1B-Q4_K_M';
const sampleCount = Number.parseInt(process.env.PHASE12_LLM_SAMPLES ?? '5', 10);
const requestTimeoutMs = 5_000;

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function normalizeModelId(value: string): string {
  return value.replace(/^docker\.io\//u, '').replace(/^ai\//u, '');
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`${url} returned ${String(response.status)}`);
  return response.json() as Promise<unknown>;
}

const modelsPayload = record(await fetchJson(`${endpoint}/engines/${engine}/v1/models`), 'models');
if (
  !Array.isArray(modelsPayload.data) ||
  !modelsPayload.data.some((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const id = (entry as JsonRecord).id;
    return typeof id === 'string' && normalizeModelId(id) === normalizeModelId(model);
  })
) {
  throw new Error(`Docker Model Runner does not expose ${model}`);
}

const durations: number[] = [];
for (let index = 0; index < sampleCount; index += 1) {
  const startedAt = performance.now();
  const payload = record(
    // oxlint-disable-next-line no-await-in-loop -- Sequential samples measure one DMR worker.
    await fetchJson(`${endpoint}/engines/${engine}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 64,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Odpowiedz wyłącznie JSON: {"classification":"municipal"|"emergency","confidence":0..1}.',
          },
          {
            role: 'user',
            content:
              index % 2 === 0
                ? 'Na chodniku znajduje się niewielka dziura.'
                : 'Pali się mieszkanie i ludzie są w środku.',
          },
        ],
      }),
    }),
    `completion[${String(index)}]`,
  );
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error(`completion[${String(index)}] has no choices`);
  }
  durations.push(performance.now() - startedAt);
}

const sorted = [...durations].sort((left: number, right: number) => left - right);
const percentileIndex = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
const report = {
  schemaVersion: 1,
  phase: '12',
  model,
  engine,
  sampleCount,
  timeoutMs: requestTimeoutMs,
  p95Ms: Math.round(sorted[percentileIndex] ?? 0),
  maximumMs: Math.round(sorted.at(-1) ?? 0),
  passed: durations.every((duration: number) => duration <= requestTimeoutMs),
  capturedAt: new Date().toISOString(),
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.PHASE12_EVIDENCE_FILE) {
  writeFileSync(process.env.PHASE12_EVIDENCE_FILE, serialized, { mode: 0o600 });
}
process.stdout.write(serialized);
if (!report.passed) process.exitCode = 1;
