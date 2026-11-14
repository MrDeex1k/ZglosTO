import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  basalProbabilities,
  basalCompletionPrompt,
  type BasalOptionOrder,
  type BasalProbabilities,
  type BasalVariant,
} from '../llm_gateway/src/basal.ts';

type Classification = 'municipal' | 'emergency';
interface Fixture {
  id: string;
  expected: Classification;
  category: string;
  description: string;
}
interface Observation {
  order: BasalOptionOrder;
  elapsedMs: number;
  classification: Classification | null;
  rawProbabilities: BasalProbabilities | null;
  fallback: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null };
}
interface BenchmarkResult {
  id: string;
  category: string;
  expected: Classification;
  repeat: number;
  classification: Classification | null;
  correct: boolean;
  rawProbabilities: BasalProbabilities | null;
  confidence: null;
  observations: Observation[];
  orderDisagreement: boolean | null;
}

function positiveInteger(value: string | undefined, defaultValue: number): number {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('Expected a positive integer');
  return parsed;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function classify(probabilities: BasalProbabilities, order: BasalOptionOrder): Classification {
  if (probabilities.municipal === probabilities.emergency) {
    return order === 'forward' ? 'municipal' : 'emergency';
  }
  return probabilities.municipal > probabilities.emergency ? 'municipal' : 'emergency';
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(quantile * sorted.length) - 1] ?? null;
}

function parseFixtures(text: string): Fixture[] {
  const fixtures: unknown = JSON.parse(text);
  if (!Array.isArray(fixtures) || fixtures.length === 0)
    throw new Error('Fixture must be a nonempty array');
  const ids = new Set<string>();
  const descriptions = new Set<string>();
  return fixtures.map((fixture: unknown) => {
    if (
      !record(fixture) ||
      typeof fixture.id !== 'string' ||
      !fixture.id ||
      typeof fixture.description !== 'string' ||
      !fixture.description ||
      typeof fixture.category !== 'string' ||
      (fixture.expected !== 'municipal' && fixture.expected !== 'emergency') ||
      ids.has(fixture.id) ||
      descriptions.has(fixture.description)
    ) {
      throw new Error('Invalid or duplicate fixture entry');
    }
    ids.add(fixture.id);
    descriptions.add(fixture.description);
    return {
      id: fixture.id,
      description: fixture.description,
      category: fixture.category,
      expected: fixture.expected,
    };
  });
}

if (process.argv.includes('--help')) {
  console.log(`Run with bun scripts/benchmark-basal.ts. Required environment:
BASAL_BENCHMARK_MODEL: exact loaded model ID
BASAL_BENCHMARK_VARIANT: basal-2.0-4.5b or basal-omni-1.0-mini
Optional: BASAL_BENCHMARK_URL (default http://localhost:12434/v1),
BASAL_BENCHMARK_OUTPUT (JSON file), BASAL_BENCHMARK_FIXTURE (JSON file),
BASAL_BENCHMARK_TIMEOUT_MS (default 120000), BASAL_BENCHMARK_LIMIT,
BASAL_BENCHMARK_REPEATS (default 1), BASAL_BENCHMARK_MODEL_SHA256 (artifact provenance).
Uses an already running DMR or llama-server /v1/completions with automatic BOS
(add_special=true, GGUF add_bos_token=true); downloads and starts nothing.`);
  process.exit(0);
}

const model = process.env.BASAL_BENCHMARK_MODEL?.trim();
if (!model) throw new Error('BASAL_BENCHMARK_MODEL is required');
const variant = process.env.BASAL_BENCHMARK_VARIANT;
if (variant !== 'basal-2.0-4.5b' && variant !== 'basal-omni-1.0-mini') {
  throw new Error('BASAL_BENCHMARK_VARIANT must select one of the two supported templates');
}
const endpoint = new URL(process.env.BASAL_BENCHMARK_URL ?? 'http://localhost:12434/v1');
if (
  !['http:', 'https:'].includes(endpoint.protocol) ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash
) {
  throw new Error('Benchmark URL must be HTTP(S) without credentials, query or fragment');
}
endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, '')}/completions`;
const timeoutMs = positiveInteger(process.env.BASAL_BENCHMARK_TIMEOUT_MS, 120_000);
const repeats = positiveInteger(process.env.BASAL_BENCHMARK_REPEATS, 1);
const fixtureText = await readFile(
  process.env.BASAL_BENCHMARK_FIXTURE ??
    new URL('../tests/fixtures/llm/basal-classification.json', import.meta.url),
  'utf8',
);
const allFixtures = parseFixtures(fixtureText);
const fixtures = allFixtures.slice(
  0,
  positiveInteger(process.env.BASAL_BENCHMARK_LIMIT, allFixtures.length),
);

async function observe(
  fixture: Fixture,
  order: BasalOptionOrder,
  promptVariant: BasalVariant,
): Promise<Observation> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const observation: Observation = {
    order,
    elapsedMs: 0,
    classification: null,
    rawProbabilities: null,
    fallback: null,
    usage: { promptTokens: null, completionTokens: null },
  };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: basalCompletionPrompt(fixture.description, promptVariant, order),
        temperature: 1,
        top_k: 0,
        top_p: 1,
        min_p: 0,
        max_tokens: 1,
        stream: false,
        logprobs: 20,
      }),
    });
    if (!response.ok) {
      observation.fallback = `http_${response.status}`;
    } else {
      const payload: unknown = await response.json();
      if (record(payload) && record(payload.usage)) {
        observation.usage = {
          promptTokens: tokenCount(payload.usage.prompt_tokens),
          completionTokens: tokenCount(payload.usage.completion_tokens),
        };
      }
      try {
        observation.rawProbabilities = basalProbabilities(payload, order);
        observation.classification = classify(observation.rawProbabilities, order);
      } catch {
        observation.fallback = 'invalid_response';
      }
    }
  } catch (error) {
    observation.fallback = controller.signal.aborted
      ? 'timeout'
      : error instanceof SyntaxError
        ? 'invalid_response'
        : 'unavailable';
  } finally {
    clearTimeout(timer);
    observation.elapsedMs = performance.now() - started;
  }
  return observation;
}

const results: BenchmarkResult[] = [];
const startedAt = new Date().toISOString();
for (let repeat = 1; repeat <= repeats; repeat += 1) {
  for (const [index, fixture] of fixtures.entries()) {
    // Alternate which order runs first, reducing systematic cache/timing advantages.
    const orders: BasalOptionOrder[] =
      (index + repeat) % 2 === 0 ? ['reverse', 'forward'] : ['forward', 'reverse'];
    const observations: Observation[] = [];
    // Sequential inference measures one request at a time instead of queue contention.
    // eslint-disable-next-line no-await-in-loop
    for (const order of orders) observations.push(await observe(fixture, order, variant));
    const [first, second] = observations;
    const rawProbabilities =
      first?.rawProbabilities && second?.rawProbabilities
        ? {
            municipal: (first.rawProbabilities.municipal + second.rawProbabilities.municipal) / 2,
            emergency: (first.rawProbabilities.emergency + second.rawProbabilities.emergency) / 2,
          }
        : null;
    const classification = rawProbabilities ? classify(rawProbabilities, 'forward') : null;
    results.push({
      id: fixture.id,
      category: fixture.category,
      expected: fixture.expected,
      repeat,
      classification,
      correct: classification === fixture.expected,
      rawProbabilities,
      confidence: null,
      observations,
      orderDisagreement:
        first?.classification !== null && second?.classification !== null
          ? first?.classification !== second?.classification
          : null,
    });
    console.error(
      `${repeat}/${repeats} ${index + 1}/${fixtures.length} ${fixture.id}: ${classification ?? 'fallback'}`,
    );
  }
}
const observations = results.flatMap((result) => result.observations);
const successful = observations.filter((observation) => observation.fallback === null);
const perOrder = Object.fromEntries(
  (['forward', 'reverse'] as const).map((order) => {
    const entries = results.flatMap((result) =>
      result.observations
        .filter((observation) => observation.order === order)
        .map((observation) => ({
          classification: observation.classification,
          elapsedMs: observation.elapsedMs,
          fallback: observation.fallback,
          expected: result.expected,
        })),
    );
    const latencies = entries
      .filter((entry) => entry.fallback === null)
      .map((entry) => entry.elapsedMs);
    const correct = entries.filter((entry) => entry.classification === entry.expected).length;
    return [
      order,
      {
        decisions: entries.length,
        correct,
        accuracy: correct / entries.length,
        fallbacks: entries.filter((entry) => entry.fallback !== null).length,
        falseNegatives: entries.filter(
          (entry) => entry.expected === 'emergency' && entry.classification === 'municipal',
        ).length,
        falsePositives: entries.filter(
          (entry) => entry.expected === 'municipal' && entry.classification === 'emergency',
        ).length,
        latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
      },
    ];
  }),
);
const fallbackCounts: Record<string, number> = {};
for (const observation of observations) {
  if (observation.fallback)
    fallbackCounts[observation.fallback] = (fallbackCounts[observation.fallback] ?? 0) + 1;
}
const evidence = {
  schemaVersion: 1,
  startedAt,
  finishedAt: new Date().toISOString(),
  endpoint: endpoint.href,
  model,
  variant,
  modelSha256: process.env.BASAL_BENCHMARK_MODEL_SHA256 ?? null,
  fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
  calibration: 'none: custom Q4_K_M; scores are raw restricted probabilities',
  settings: {
    bos: 'server adds one BOS; request omits the template BOS',
    timeoutMs,
    repeats,
    fixtureCount: fixtures.length,
    optionOrders: 2,
    maxTokens: 1,
    logprobs: 20,
    temperature: 1,
  },
  summary: {
    decisionMethod: 'mean of two raw distributions after mapping each option order back to classes',
    perOrder,
    decisions: results.length,
    correct: results.filter((result) => result.correct).length,
    accuracy: results.filter((result) => result.correct).length / results.length,
    fallbacks: results.filter((result) => result.classification === null).length,
    fallbackCounts,
    falseNegatives: results.filter(
      (result) => result.expected === 'emergency' && result.classification === 'municipal',
    ).length,
    falsePositives: results.filter(
      (result) => result.expected === 'municipal' && result.classification === 'emergency',
    ).length,
    orderDisagreements: results.filter((result) => result.orderDisagreement === true).length,
    calls: observations.length,
    successfulCalls: successful.length,
    latencyMs: {
      firstCall: observations[0]?.elapsedMs ?? null,
      p50: percentile(
        successful.map((observation) => observation.elapsedMs),
        0.5,
      ),
      p95: percentile(
        successful.map((observation) => observation.elapsedMs),
        0.95,
      ),
      total: observations.reduce((sum, observation) => sum + observation.elapsedMs, 0),
    },
    usage: {
      promptTokens: observations.reduce(
        (sum, observation) => sum + (observation.usage.promptTokens ?? 0),
        0,
      ),
      completionTokens: observations.reduce(
        (sum, observation) => sum + (observation.usage.completionTokens ?? 0),
        0,
      ),
      callsWithUsage: observations.filter((observation) => observation.usage.promptTokens !== null)
        .length,
    },
  },
  results,
};
const json = `${JSON.stringify(evidence, null, 2)}\n`;
const output = process.env.BASAL_BENCHMARK_OUTPUT;
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json);
}
console.log(json);
