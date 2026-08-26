import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

if (process.env.PHASE12_ALLOW_DESTRUCTIVE !== '1') {
  throw new Error('Set PHASE12_ALLOW_DESTRUCTIVE=1 only for the isolated observability drill');
}

const projectName = process.env.PHASE12_OBSERVABILITY_PROJECT ?? 'zglosto-phase12-observability';
const httpPort = process.env.PHASE12_OBSERVABILITY_HTTP_PORT ?? '13335';
const composeFiles = [
  'docker-compose.no-rustfs.yml',
  'docker-compose.rustfs.yml',
  'docker-compose.integration.yml',
  'docker-compose.observability.local.yml',
] as const;
const environment = {
  ...process.env,
  GRAFANA_ADMIN_PASSWORD_FILE: resolve('tests/fixtures/secrets/better_auth_secret'),
  INTEGRATION_HTTP_PORT: httpPort,
  INTEGRATION_PROJECT_NAME: projectName,
};

function compose(arguments_: readonly string[], capture = false): string {
  const composeArguments = [
    'compose',
    '--project-name',
    projectName,
    '--env-file',
    'tests/integration/integration.env',
  ];
  for (const file of composeFiles) composeArguments.push('--file', file);
  composeArguments.push(...arguments_);
  return execFileSync('docker', composeArguments, {
    encoding: 'utf8',
    env: environment,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function backendQuery(url: string): unknown {
  const source = [
    `const response = await fetch(${JSON.stringify(url)});`,
    `if (!response.ok) throw new Error('query returned ' + response.status);`,
    `process.stdout.write(JSON.stringify(await response.json()));`,
  ].join(' ');
  return JSON.parse(
    compose(['exec', '-T', 'backend', 'node', '--input-type=module', '--eval', source], true),
  ) as unknown;
}

function prometheusHasBackendMetric(payload: unknown): boolean {
  const data = record(record(payload, 'prometheus').data, 'prometheus.data');
  return Array.isArray(data.result) && data.result.length > 0;
}

function lokiTraceIds(payload: unknown): Set<string> {
  const data = record(record(payload, 'loki').data, 'loki.data');
  if (!Array.isArray(data.result)) return new Set();
  const traceIds = new Set<string>();
  for (const stream of data.result) {
    const values = record(stream, 'loki.stream').values;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (!Array.isArray(value)) continue;
      const line = value[1];
      if (typeof line !== 'string') continue;
      const match = line.match(/"traceId":"([a-f0-9]{32})"/u);
      if (match?.[1]) traceIds.add(match[1]);
    }
  }
  return traceIds;
}

function tempoTraceIds(payload: unknown): Set<string> {
  const traces = record(payload, 'tempo').traces;
  if (!Array.isArray(traces)) return new Set();
  return new Set(
    traces.flatMap((trace: unknown) => {
      const traceId = record(trace, 'tempo.trace').traceID;
      return typeof traceId === 'string' ? [traceId] : [];
    }),
  );
}

let report: JsonRecord | null = null;
try {
  execFileSync('./scripts/generate-dev-certificates.sh', [], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  compose(['down', '--volumes', '--remove-orphans']);
  compose(['up', '--detach', '--build', '--wait', '--wait-timeout', '240']);

  const trafficResponses = await Promise.all(
    Array.from({ length: 20 }, () =>
      fetch(`http://127.0.0.1:${httpPort}/api/health/ready`, {
        signal: AbortSignal.timeout(5_000),
      }),
    ),
  );
  if (!trafficResponses.every(({ ok }) => ok)) {
    throw new Error('Application traffic generation failed');
  }

  await delay(20_000);
  const prometheus = backendQuery(
    `http://prometheus:9090/api/v1/query?query=${encodeURIComponent(
      'sum(zglosto_http_server_requests_total{service_name="backend"})',
    )}`,
  );
  const startNanoseconds = String((Date.now() - 10 * 60 * 1_000) * 1_000_000);
  const loki = backendQuery(
    `http://loki:3100/loki/api/v1/query_range?query=${encodeURIComponent(
      '{service_name="backend"}',
    )}&start=${startNanoseconds}&limit=200`,
  );
  const tempo = backendQuery(
    `http://tempo:3200/api/search?q=${encodeURIComponent(
      '{ resource.service.name = "backend" }',
    )}&limit=200`,
  );
  const logTraceIds = lokiTraceIds(loki);
  const traceTraceIds = tempoTraceIds(tempo);
  const correlatedTraceIds = [...logTraceIds].filter((traceId) => traceTraceIds.has(traceId));

  compose(['stop', 'otel-collector']);
  const degradedResponse = await fetch(`http://127.0.0.1:${httpPort}/api/health/ready`, {
    signal: AbortSignal.timeout(5_000),
  });
  compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'otel-collector']);

  const checks = {
    allContainersHealthy: true,
    prometheusMetric: prometheusHasBackendMetric(prometheus),
    lokiLog: logTraceIds.size > 0,
    tempoTrace: traceTraceIds.size > 0,
    metricTraceLogCorrelation: correlatedTraceIds.length > 0,
    collectorFailureDoesNotBlockProduct: degradedResponse.ok,
    collectorRecovered: true,
  };
  report = {
    schemaVersion: 1,
    phase: '12',
    mode: 'local-diagnostic',
    projectName,
    checks,
    counts: {
      logTraceIds: logTraceIds.size,
      tempoTraceIds: traceTraceIds.size,
      correlatedTraceIds: correlatedTraceIds.length,
    },
    passed: Object.values(checks).every(Boolean),
    capturedAt: new Date().toISOString(),
  };
} finally {
  try {
    compose(['down', '--volumes', '--remove-orphans']);
  } catch {
    // Cleanup must not hide the primary drill result.
  }
}

if (report === null) throw new Error('Observability drill did not produce a report');
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = process.env.PHASE12_EVIDENCE_FILE;
if (outputPath) writeFileSync(outputPath, serialized, { mode: 0o600 });
process.stdout.write(serialized);
if (report.passed !== true) process.exitCode = 1;
