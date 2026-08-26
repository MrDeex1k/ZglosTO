import { execFileSync } from 'node:child_process';

function fail(message: string): never {
  throw new Error(`Cluster workloads/security policy failed: ${message}`);
}

function render(profile: 'kubernetes' | 'k3s'): string {
  return execFileSync('kubectl', ['kustomize', `k8s/overlays/${profile}`], {
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

function validateWorkloads(rendered: string): void {
  const expected = [
    ['Deployment', 'authorization'],
    ['Deployment', 'backend'],
    ['StatefulSet', 'database'],
    ['Deployment', 'frontend'],
    ['Deployment', 'llm-gateway'],
    ['Deployment', 'media-worker'],
    ['Deployment', 'nginx'],
    ['Deployment', 'pgbouncer'],
    ['StatefulSet', 'rabbitmq'],
  ] as const;
  for (const [kind, name] of expected) {
    const workload = resource(rendered, kind, name);
    if (
      !workload.includes(`serviceAccountName: ${name}`) ||
      !workload.includes('resources:') ||
      !workload.includes('readinessProbe:') ||
      !workload.includes('livenessProbe:')
    ) {
      fail(`${kind}/${name} lacks its ServiceAccount, resources or probes`);
    }
  }
  for (const name of [
    'authorization',
    'backend',
    'frontend',
    'llm-gateway',
    'media-worker',
    'nginx',
    'pgbouncer',
  ]) {
    const workload = resource(rendered, 'Deployment', name);
    for (const requirement of [
      'allowPrivilegeEscalation: false',
      'runAsNonRoot: true',
      'readOnlyRootFilesystem: true',
      'drop:',
      '- ALL',
    ]) {
      if (!workload.includes(requirement)) {
        fail(`Deployment/${name} lacks non-root read-only runtime hardening`);
      }
    }
  }
  const namespace = resource(rendered, 'Namespace', 'zglosto');
  if (
    !namespace.includes('pod-security.kubernetes.io/enforce: baseline') ||
    !namespace.includes('pod-security.kubernetes.io/warn: restricted')
  ) {
    fail('Namespace/zglosto must enforce PSS baseline and warn against restricted');
  }
  const mediaWorker = resource(rendered, 'Deployment', 'media-worker');
  if (
    !mediaWorker.includes('dist/nest/media-worker/main.js') ||
    !mediaWorker.includes('dist/nest/media-worker/healthcheck.js') ||
    !mediaWorker.includes('name: MEDIA_WORKER_PREFETCH') ||
    !mediaWorker.includes('value: "false"')
  ) {
    fail('media-worker does not preserve the standalone Sharp worker contract');
  }
  if (
    documents(rendered).some(
      (document: string) =>
        /^kind:\s*Service\s*$/mu.test(document) &&
        /^\s{2}name:\s*media-worker\s*$/mu.test(document),
    )
  ) {
    fail('media-worker must not expose an HTTP Service');
  }
  for (const pdb of [
    'authorization-pdb',
    'backend-pdb',
    'frontend-pdb',
    'nginx-pdb',
    'pgbouncer-pdb',
  ]) {
    resource(rendered, 'PodDisruptionBudget', pdb);
  }
}

function validateRouting(rendered: string): void {
  const nginxConfig = resource(rendered, 'ConfigMap', 'nginx-config');
  if (
    !nginxConfig.includes('proxy_pass http://frontend:8080;') ||
    !nginxConfig.includes('proxy_pass https://authorization:9956/api/auth/;') ||
    !nginxConfig.includes('proxy_ssl_verify on;') ||
    !nginxConfig.includes('proxy_pass http://backend:3000/;') ||
    !nginxConfig.includes('location = /llm/health') ||
    !nginxConfig.includes('location /llm/') ||
    !nginxConfig.includes('return 404;')
  ) {
    fail('Nginx does not preserve the same-origin /, /api, /api/auth and restricted /llm contract');
  }
  if (rendered.includes('authorization:9955') || rendered.includes('type: NodePort')) {
    fail('plaintext Authorization or NodePort exposure is forbidden');
  }
  const ingress = resource(rendered, 'Ingress', 'zglosto-ingress');
  if (
    !ingress.includes('cert-manager.io/cluster-issuer: zglosto-public-issuer') ||
    !ingress.includes('secretName: zglosto-public-tls')
  ) {
    fail('public Ingress must terminate TLS through the configured cert-manager issuer');
  }
}

function validateCertificates(rendered: string): void {
  const certificateNames = [
    'authorization-server',
    'backend-client',
    'nginx-client',
    'authorization-healthcheck-client',
    'llm-gateway-server',
    'llm-gateway-healthcheck-client',
    'keda-http-interceptor',
    'rabbitmq-server',
    'database-server',
    'pgbouncer-server',
  ];
  for (const name of certificateNames) {
    const certificate = resource(rendered, 'Certificate', name);
    if (
      !certificate.includes('rotationPolicy: Always') ||
      !certificate.includes('duration: 720h') ||
      !certificate.includes('renewBefore: 168h')
    ) {
      fail(`Certificate/${name} lacks automatic key rotation`);
    }
  }
  if (
    !resource(rendered, 'Certificate', 'backend-client').includes(
      'spiffe://zglosto.local/workload/backend',
    ) ||
    !resource(rendered, 'Certificate', 'nginx-client').includes(
      'spiffe://zglosto.local/workload/nginx',
    ) ||
    !resource(rendered, 'Certificate', 'authorization-healthcheck-client').includes(
      'spiffe://zglosto.local/workload/authorization-healthcheck',
    ) ||
    !resource(rendered, 'Certificate', 'llm-gateway-healthcheck-client').includes(
      'spiffe://zglosto.local/workload/llm-gateway-healthcheck',
    ) ||
    !resource(rendered, 'Certificate', 'keda-http-interceptor').includes(
      'spiffe://zglosto.local/workload/keda-http-interceptor',
    ) ||
    !resource(rendered, 'Certificate', 'llm-gateway-server').includes('- llm-gateway.zglosto') ||
    !resource(rendered, 'Certificate', 'authorization-server').includes('- authorization') ||
    !resource(rendered, 'Certificate', 'pgbouncer-server').includes('- pgbouncer') ||
    !resource(rendered, 'Certificate', 'database-server').includes('- database')
  ) {
    fail('certificate SAN identities differ from the accepted mTLS/TLS contract');
  }
  if (
    !resource(rendered, 'Issuer', 'zglosto-service-ca').includes(
      'secretName: zglosto-service-ca-key-pair',
    ) ||
    !resource(rendered, 'Issuer', 'zglosto-database-ca').includes(
      'secretName: zglosto-database-ca-key-pair',
    )
  ) {
    fail('Service CA and Database CA are not separated');
  }
  if (
    !resource(rendered, 'Certificate', 'zglosto-service-ca').includes('rotationPolicy: Never') ||
    !resource(rendered, 'Certificate', 'zglosto-database-ca').includes('rotationPolicy: Never')
  ) {
    fail('root CA rotation must remain an explicit maintenance operation');
  }
  for (const workload of [
    ['Deployment', 'authorization'],
    ['Deployment', 'backend'],
    ['StatefulSet', 'database'],
    ['Deployment', 'nginx'],
    ['Deployment', 'pgbouncer'],
    ['StatefulSet', 'rabbitmq'],
  ] as const) {
    if (
      !resource(rendered, workload[0], workload[1]).includes('secret.reloader.stakater.com/reload')
    ) {
      fail(`${workload[0]}/${workload[1]} lacks certificate rotation rollout`);
    }
  }
}

function validateNetworkPolicy(rendered: string): void {
  resource(rendered, 'NetworkPolicy', 'default-deny-all');
  resource(rendered, 'NetworkPolicy', 'allow-dns');
  const pgbouncer = resource(rendered, 'NetworkPolicy', 'allow-pgbouncer');
  const database = resource(rendered, 'NetworkPolicy', 'allow-database-from-pgbouncer');
  const rabbitmq = resource(rendered, 'NetworkPolicy', 'allow-rabbitmq');
  const nginxEgress = resource(rendered, 'NetworkPolicy', 'allow-nginx-egress');
  const frontendIngress = resource(rendered, 'NetworkPolicy', 'allow-frontend-from-nginx');
  if (
    !pgbouncer.includes('app: backend') ||
    !pgbouncer.includes('app: authorization') ||
    !pgbouncer.includes('app: media-worker') ||
    pgbouncer.includes('namespaceSelector:')
  ) {
    fail('PgBouncer ingress is not restricted to its three application consumers');
  }
  if (pgbouncer.includes('app: frontend')) {
    fail('an unauthorized frontend pod may not connect to PgBouncer');
  }
  if (!database.includes('app: pgbouncer') || database.includes('app: backend')) {
    fail('PostgreSQL must reject direct application traffic');
  }
  if (rabbitmq.includes('port: 15672') || !rabbitmq.includes('port: 5671')) {
    fail('RabbitMQ NetworkPolicy must expose only AMQPS');
  }
  if (
    !/port:\s*8080(?:\s|$)/u.test(nginxEgress) ||
    !/port:\s*8080(?:\s|$)/u.test(frontendIngress)
  ) {
    fail('Nginx and frontend NetworkPolicies must allow the frontend pod port 8080');
  }
}

function validate(rendered: string): void {
  validateWorkloads(rendered);
  validateRouting(rendered);
  validateCertificates(rendered);
  validateNetworkPolicy(rendered);
}

function expectRejected(label: string, rendered: string): void {
  try {
    validate(rendered);
  } catch {
    return;
  }
  fail(`negative fixture was accepted: ${label}`);
}

for (const profile of ['kubernetes', 'k3s'] as const) {
  const rendered = render(profile);
  validate(rendered);
  expectRejected(
    `${profile}: root stateless runtime`,
    rendered.replace('runAsNonRoot: true', 'runAsNonRoot: false'),
  );
  expectRejected(
    `${profile}: plaintext Authorization`,
    rendered.replace(
      'proxy_pass https://authorization:9956',
      'proxy_pass http://authorization:9955',
    ),
  );
  expectRejected(
    `${profile}: missing key rotation`,
    rendered.replace('rotationPolicy: Always', 'rotationPolicy: Never'),
  );
  expectRejected(
    `${profile}: wrong backend SPIFFE SAN`,
    rendered.replaceAll(
      'spiffe://zglosto.local/workload/backend',
      'spiffe://foreign/workload/backend',
    ),
  );
  expectRejected(
    `${profile}: foreign Service CA`,
    rendered.replaceAll('zglosto-service-ca-key-pair', 'foreign-service-ca-key-pair'),
  );
  expectRejected(
    `${profile}: unauthorized pod to PgBouncer`,
    rendered.replace(
      '    - podSelector:\n        matchLabels:\n          app: media-worker\n    ports:\n    - port: 6432',
      '    - podSelector:\n        matchLabels:\n          app: frontend\n    ports:\n    - port: 6432',
    ),
  );
  expectRejected(
    `${profile}: missing default deny`,
    rendered.replace('name: default-deny-all', 'name: default-deny-disabled'),
  );
}

console.log(
  'Cluster workloads/security policy OK: complete workloads, same-origin routing, cert-manager PKI rotation, mTLS identities and default-deny allowlists pass positive and negative fixtures.',
);
