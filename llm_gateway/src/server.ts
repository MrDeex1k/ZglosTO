import { readFileSync } from 'node:fs';
import { shutdownObservability } from '@zglosto/observability/register';
import { decodeWorkloadKey, WorkloadReplayCache } from '@zglosto/workload-auth';
import { createApp } from './app.ts';
import { validateEnvironment } from './environment.ts';
import { startMtlsGatewayServer } from './mtls-server.ts';
import { createRuntime } from './runtime.ts';

const environment = validateEnvironment();
const runtime = createRuntime(environment);
const hmacKey = decodeWorkloadKey(readFileSync(environment.hmacKeyFile, 'utf8'));
const app = createApp(runtime, {
  authClockSkewSeconds: environment.authClockSkewSeconds,
  hmacKey,
  hmacKeyId: environment.hmacKeyId,
  maxBodyBytes: environment.maxBodyBytes,
  maxConcurrentClassifications: environment.maxConcurrentClassifications,
  replayCache: new WorkloadReplayCache(environment.authReplayMaxEntries),
});
const server = startMtlsGatewayServer(app.fetch, environment);

console.info(
  JSON.stringify({ event: 'llm_gateway.started', port: environment.port, runtime: runtime.name }),
);

const shutdown = (): void => {
  server.close(() => {
    void shutdownObservability();
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
