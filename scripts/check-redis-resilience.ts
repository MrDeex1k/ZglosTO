import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Redis resilience policy failed: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((entry: unknown) => typeof entry === 'string')) {
    return fail(`${path} must be a string array`);
  }
  return value;
}

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

const contract = record(
  JSON.parse(source('deploy/redis-resilience-contract.json')) as unknown,
  'contract',
);
if (
  contract.schemaVersion !== 1 ||
  contract.phase !== '10.10' ||
  contract.status !== 'implemented'
) {
  fail('contract must identify implemented Phase 10 step 10');
}

const healthContract = source('packages/contracts/src/health.ts');
for (const fragment of [
  "z.literal('degraded')",
  "redis: z.literal('down')",
  'AuthorizationReadinessDegradedResponseSchema',
  'BackendReadinessDegradedResponseSchema',
]) {
  if (!healthContract.includes(fragment)) fail(`health contract lacks ${fragment}`);
}

const backendHealth = source('backend/nest/health/health.service.ts');
const authorizationHealth = source('authorization/src/app.ts');
for (const [service, implementation] of [
  ['backend', backendHealth],
  ['authorization', authorizationHealth],
] as const) {
  if (!implementation.includes("redis === 'down' ? 'degraded' : 'ok'")) {
    fail(`${service} does not expose degraded Redis readiness`);
  }
}

const instrumentation = [
  source('backend/nest/platform/transient-store.service.ts'),
  source('authorization/src/distributed-rate-limit.ts'),
].join('\n');
for (const metric of strings(contract.metrics, 'contract.metrics')) {
  if (!instrumentation.includes(metric)) fail(`instrumentation lacks ${metric}`);
}

const composeRules = source('observability/prometheus-rules.yaml');
const clusterRules = source('k8s/components/observability-local/resources.yaml');
for (const alert of strings(contract.alerts, 'contract.alerts')) {
  if (!composeRules.includes(`alert: ${alert}`)) fail(`Compose rules lack ${alert}`);
  if (!clusterRules.includes(`alert: ${alert}`)) fail(`cluster rules lack ${alert}`);
}

const failureTest = source('scripts/test-phase0-integration.sh');
for (const fragment of [
  'compose stop redis',
  'backend degraded down',
  'authorization degraded down',
  'applications did not recover their Redis connections',
  'compose exec -T backend',
  'http://127.0.0.1:3000/mieszkaniec/incydenty/glowna',
]) {
  if (!failureTest.includes(fragment)) fail(`failure test lacks ${fragment}`);
}

for (const [path, fragment] of [
  ['authorization/src/distributed-rate-limit.test.ts', 'local limiter remains active'],
  [
    'backend/nest/modules/residents/distributed-incident-rate-limiter.test.ts',
    'mandatory local limiter',
  ],
  [
    'backend/nest/modules/incidents/public-resolved-incident-cache.test.ts',
    'falls back to PostgreSQL',
  ],
] as const) {
  if (!source(path).includes(fragment)) fail(`${path} lacks the Redis fallback test`);
}

console.log(
  'Redis resilience policy OK: degraded readiness, telemetry, alerts and outage recovery tests are present.',
);
