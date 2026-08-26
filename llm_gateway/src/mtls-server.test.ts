import { expect, test } from 'vitest';
import type { LlmGatewayEnvironment } from './environment.ts';
import { permittedGatewayPath } from './mtls-server.ts';

const environment = {
  backendIdentity: 'spiffe://zglosto.local/workload/backend',
  healthcheckIdentity: 'spiffe://zglosto.local/workload/llm-gateway-healthcheck',
  kedaIdentity: 'spiffe://zglosto.local/workload/keda-http-interceptor',
  nginxIdentity: 'spiffe://zglosto.local/workload/nginx',
} as LlmGatewayEnvironment;

test('limits each workload identity to its required gateway paths', () => {
  expect(permittedGatewayPath(environment.backendIdentity, '/classify-incident', environment)).toBe(
    true,
  );
  expect(permittedGatewayPath(environment.backendIdentity, '/health', environment)).toBe(false);
  expect(permittedGatewayPath(environment.kedaIdentity, '/classify-incident', environment)).toBe(
    true,
  );
  expect(permittedGatewayPath(environment.nginxIdentity, '/classify-incident', environment)).toBe(
    false,
  );
  expect(permittedGatewayPath(environment.nginxIdentity, '/health', environment)).toBe(true);
});
