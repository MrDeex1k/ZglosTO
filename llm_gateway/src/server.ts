import { createTransientStoreRuntime } from '@zglosto/transient-store';
import { sharedNonceConsumer } from './replay-store.ts';
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
const redisMode = process.env.REDIS_MODE;
const transient = createTransientStoreRuntime(
  redisMode === 'local' || redisMode === 'external'
    ? {
        mode: redisMode,
        urlFile: process.env.REDIS_URL_FILE ?? '/run/secrets/redis/url',
        tlsCaPath: process.env.REDIS_TLS_CA_PATH || null,
        keyPrefix: 'zglosto:',
        commandTimeoutMs: 500,
        connectTimeoutMs: 1_000,
      }
    : {
        mode: 'disabled',
        urlFile: null,
        tlsCaPath: null,
        keyPrefix: 'zglosto:',
        commandTimeoutMs: 500,
        connectTimeoutMs: 1_000,
      },
);
if (transient.store) await transient.store.connect();
const nonceConsumer = sharedNonceConsumer(transient.store, environment.authClockSkewSeconds);
// Establish the Redis generation during startup rather than on the first resident request.
if (environment.runtime !== 'disabled') void nonceConsumer.ready().catch(() => {});
const app = createApp(runtime, {
  ...(environment.runtime === 'disabled' ? {} : { replayReady: nonceConsumer.ready }),
  consumeNonce: environment.runtime === 'disabled' ? async () => true : nonceConsumer,
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
    transient.store?.close();
    void shutdownObservability();
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
