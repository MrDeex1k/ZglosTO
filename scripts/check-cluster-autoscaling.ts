import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Cluster autoscaling policy failed: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${path} must be a finite number`);
  }
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${path} must be a non-empty string`);
  }
  return value;
}

function render(overlay: string): string {
  return execFileSync('kubectl', ['kustomize', overlay], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function documents(rendered: string): string[] {
  return rendered.split(/^---\s*$/mu);
}

function resource(rendered: string, kind: string, name: string): string {
  return (
    documents(rendered).find(
      (document: string) =>
        new RegExp(`^kind:\\s*${kind}\\s*$`, 'mu').test(document) &&
        new RegExp(`^\\s{2}name:\\s*${name}\\s*$`, 'mu').test(document),
    ) ?? fail(`${kind}/${name} was not rendered`)
  );
}

function includesAll(document: string, fragments: string[], label: string): void {
  for (const fragment of fragments) {
    if (!document.includes(fragment)) fail(`${label} lacks ${JSON.stringify(fragment)}`);
  }
}

function expectedMediaReplicas(backlog: number): number {
  return Math.min(Math.floor(backlog / 4) + 1, 4);
}

function validateMediaWorker(rendered: string, contract: JsonRecord): void {
  const scaledObject = resource(rendered, 'ScaledObject', 'media-worker');
  const authentication = resource(rendered, 'TriggerAuthentication', 'media-worker-rabbitmq');
  const deployment = resource(rendered, 'Deployment', 'media-worker');
  const formula = string(contract.formula, 'mediaWorker.formula');

  includesAll(
    scaledObject,
    [
      'envSourceContainerName: media-worker',
      `formula: ${formula}`,
      'metricType: Value',
      `minReplicaCount: ${number(contract.minimumReplicas, 'mediaWorker.minimumReplicas')}`,
      `maxReplicaCount: ${number(contract.maximumReplicas, 'mediaWorker.maximumReplicas')}`,
      `pollingInterval: ${number(
        contract.pollingIntervalSeconds,
        'mediaWorker.pollingIntervalSeconds',
      )}`,
      `stabilizationWindowSeconds: ${number(
        contract.scaleDownStabilizationSeconds,
        'mediaWorker.scaleDownStabilizationSeconds',
      )}`,
      `queueName: ${string(contract.queue, 'mediaWorker.queue')}`,
      'type: rabbitmq',
      'name: media-worker-rabbitmq',
      'failureThreshold: 3',
      `replicas: ${number(contract.fallbackReplicas, 'mediaWorker.fallbackReplicas')}`,
    ],
    'ScaledObject/media-worker',
  );
  includesAll(
    authentication,
    [
      'name: KEDA_RABBITMQ_TLS',
      'parameter: tls',
      'key: RABBITMQ_URL',
      'name: zglosto-rabbitmq-credentials',
      'parameter: host',
      'key: ca.crt',
      'name: zglosto-rabbitmq-tls',
      'parameter: ca',
    ],
    'TriggerAuthentication/media-worker-rabbitmq',
  );
  includesAll(
    deployment,
    [
      'name: KEDA_RABBITMQ_TLS',
      'value: enable',
      'name: MEDIA_WORKER_PREFETCH',
      'name: MEDIA_SHARP_CONCURRENCY',
    ],
    'Deployment/media-worker',
  );

  const boundaries = record(contract.boundaryExamples, 'mediaWorker.boundaryExamples');
  for (const [backlogText, replicasValue] of Object.entries(boundaries)) {
    const backlog = Number(backlogText);
    const expected = number(replicasValue, `mediaWorker.boundaryExamples.${backlogText}`);
    if (!Number.isSafeInteger(backlog) || backlog < 0) {
      fail(`invalid backlog boundary ${backlogText}`);
    }
    if (expectedMediaReplicas(backlog) !== expected) {
      fail(`backlog ${backlog} maps to ${expectedMediaReplicas(backlog)}, expected ${expected}`);
    }
  }
}

function validateLlmGateway(rendered: string, contract: JsonRecord): void {
  const route = resource(rendered, 'InterceptorRoute', 'llm-gateway');
  const scaledObject = resource(rendered, 'ScaledObject', 'llm-gateway');
  const proxy = resource(rendered, 'Service', 'llm-gateway-proxy');
  const runtimeConfig =
    documents(rendered).find(
      (document: string) =>
        /^kind:\s*ConfigMap\s*$/mu.test(document) &&
        /^\s{2}name:\s*zglosto-config-[a-z0-9]+\s*$/mu.test(document),
    ) ?? fail('generated ConfigMap/zglosto-config was not rendered');

  includesAll(
    route,
    [
      'apiVersion: http.keda.sh/v1beta1',
      'service: llm-gateway',
      'portName: https',
      'value: /',
      `targetValue: ${number(contract.concurrencyPerReplica, 'llmGateway.concurrencyPerReplica')}`,
      `readiness: ${number(
        contract.interceptorReadinessTimeoutSeconds,
        'llmGateway.interceptorReadinessTimeoutSeconds',
      )}s`,
      `request: ${number(
        contract.interceptorRequestTimeoutSeconds,
        'llmGateway.interceptorRequestTimeoutSeconds',
      )}s`,
      `responseHeader: ${number(
        contract.interceptorResponseHeaderTimeoutSeconds,
        'llmGateway.interceptorResponseHeaderTimeoutSeconds',
      )}s`,
    ],
    'InterceptorRoute/llm-gateway',
  );
  includesAll(
    scaledObject,
    [
      `minReplicaCount: ${number(contract.minimumReplicas, 'llmGateway.minimumReplicas')}`,
      `maxReplicaCount: ${number(contract.maximumReplicas, 'llmGateway.maximumReplicas')}`,
      `pollingInterval: ${number(
        contract.pollingIntervalSeconds,
        'llmGateway.pollingIntervalSeconds',
      )}`,
      `cooldownPeriod: ${number(contract.idleScaleDownSeconds, 'llmGateway.idleScaleDownSeconds')}`,
      'type: external-push',
      'interceptorRoute: llm-gateway',
      'scalerAddress: keda-add-ons-http-external-scaler.keda.svc.cluster.local:9090',
    ],
    'ScaledObject/llm-gateway',
  );
  includesAll(
    proxy,
    [
      'type: ExternalName',
      'externalName: keda-add-ons-http-interceptor-proxy.keda.svc.cluster.local',
      'port: 8443',
    ],
    'Service/llm-gateway-proxy',
  );
  if (
    !runtimeConfig.includes('LLM_GATEWAY_URL: https://llm-gateway-proxy:8443') ||
    !runtimeConfig.includes('LLM_GATEWAY_HMAC_KEY_FILE: /run/secrets/llm-auth/hmac-key') ||
    rendered.includes('kind: HTTPScaledObject')
  ) {
    fail('backend traffic must use InterceptorRoute through llm-gateway-proxy');
  }
}

function validateNetworkIsolation(rendered: string): void {
  const backend = resource(rendered, 'NetworkPolicy', 'allow-backend');
  const rabbitmq = resource(rendered, 'NetworkPolicy', 'allow-rabbitmq');
  const llmGateway = resource(rendered, 'NetworkPolicy', 'allow-llm-gateway');

  includesAll(
    backend,
    ['kubernetes.io/metadata.name: keda', 'port: 8443'],
    'NetworkPolicy/allow-backend',
  );
  if (backend.includes('port: 8130')) {
    fail('backend bypasses the KEDA HTTP interceptor');
  }
  includesAll(
    rabbitmq,
    ['kubernetes.io/metadata.name: keda', 'port: 5671'],
    'NetworkPolicy/allow-rabbitmq',
  );
  includesAll(
    llmGateway,
    ['kubernetes.io/metadata.name: keda', 'port: 8130'],
    'NetworkPolicy/allow-llm-gateway',
  );
  if (llmGateway.includes('app: backend')) {
    fail('llm-gateway ingress allows the backend to bypass the KEDA HTTP interceptor');
  }
}

function validateOrder(rendered: string): void {
  const triggerIndex = rendered.indexOf('kind: TriggerAuthentication');
  const routeIndex = rendered.indexOf('kind: InterceptorRoute');
  const firstScaledObjectIndex = rendered.indexOf('kind: ScaledObject');
  if (triggerIndex < 0 || routeIndex < 0 || firstScaledObjectIndex < 0) {
    fail('autoscaling resources are missing');
  }
  if (triggerIndex > firstScaledObjectIndex || routeIndex > firstScaledObjectIndex) {
    fail('dependencies must render before ScaledObjects');
  }
}

const contract = record(
  JSON.parse(readFileSync('deploy/cluster-autoscaling-contract.json', 'utf8')) as unknown,
  'contract',
);
if (contract.phase !== '9.9-9.10') fail('contract must identify Phase 9 steps 9-10');
const controllers = record(contract.controllers, 'controllers');
const httpAddOn = record(controllers.httpAddOn, 'controllers.httpAddOn');
if (
  httpAddOn.version !== '0.15.0' ||
  httpAddOn.apiVersion !== 'http.keda.sh/v1beta1' ||
  httpAddOn.apiMaturity !== 'v1beta1' ||
  httpAddOn.releaseLine !== 'pre-1.0' ||
  httpAddOn.productionCertificationPhase !== 12
) {
  fail('KEDA HTTP Add-on API/release gate differs from the accepted decision');
}

const overlays = [
  'k8s/overlays/kubernetes',
  'k8s/overlays/kubernetes-rustfs',
  'k8s/overlays/kubernetes-observability-external',
  'k8s/overlays/kubernetes-observability-local',
  'k8s/overlays/kubernetes-rustfs-observability-external',
  'k8s/overlays/kubernetes-rustfs-observability-local',
  'k8s/overlays/k3s',
  'k8s/overlays/k3s-rustfs',
  'k8s/overlays/k3s-observability-external',
  'k8s/overlays/k3s-observability-local',
  'k8s/overlays/k3s-rustfs-observability-external',
  'k8s/overlays/k3s-rustfs-observability-local',
] as const;

for (const overlay of overlays) {
  const rendered = render(overlay);
  validateMediaWorker(rendered, record(contract.mediaWorker, 'mediaWorker'));
  validateLlmGateway(rendered, record(contract.llmGateway, 'llmGateway'));
  validateNetworkIsolation(rendered);
  validateOrder(rendered);
}

const composeFiles = [
  'docker-compose.yml',
  'docker-compose.production.yml',
  'docker-compose.llm.yml',
  'docker-compose.no-rustfs.yml',
  'docker-compose.rustfs.yml',
];
for (const file of composeFiles) {
  const source = readFileSync(file, 'utf8');
  if (
    source.includes('ScaledObject') ||
    source.includes('InterceptorRoute') ||
    source.includes('KEDA_')
  ) {
    fail(`${file} must not emulate cluster autoscaling`);
  }
}

console.log(
  'Cluster autoscaling policy OK: media backlog boundaries and LLM scale-to-zero are deterministic across all Kubernetes/K3s profiles; Compose remains static.',
);
