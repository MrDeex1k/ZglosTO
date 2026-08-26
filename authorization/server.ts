import {
  createWhiteLabelConfigReadiness,
  loadProcessWhiteLabelConfig,
} from '@zglosto/white-label-config';
import { shutdownObservability } from '@zglosto/observability/register';
import { LocalRateLimiter } from '@zglosto/rate-limiting';

import { createAuthorizationApp } from './src/app.ts';
import { closeAuthDatabase } from './src/auth.ts';
import {
  closeAuthorizationTransientStore,
  initializeAuthorizationTransientStore,
} from './src/distributed-rate-limit.ts';
import { env } from './src/env.ts';
import { logApiRequest } from './src/logger.ts';
import { startMtlsAuthorizationServer } from './src/mtls-server.ts';

const loadedWhiteLabelConfig = loadProcessWhiteLabelConfig();
const configReadiness = createWhiteLabelConfigReadiness(loadedWhiteLabelConfig);
const localRateLimiter = new LocalRateLimiter(env.localRateLimit);
await initializeAuthorizationTransientStore();
const app = createAuthorizationApp({ configReadiness, localRateLimiter });

const server = startMtlsAuthorizationServer(app.fetch, env.mtls);
void logApiRequest(
  'SERVER',
  'START',
  200,
  true,
  `Serwer autoryzacji mTLS uruchamiany na porcie ${env.mtls.port}`,
).catch(() => {
  // Brak możliwości zapisu logu nie może zatrzymać serwera.
});

let stopping = false;
const shutdown = (): void => {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    localRateLimiter.close();
    closeAuthorizationTransientStore();
    void Promise.all([closeAuthDatabase(), shutdownObservability()]);
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
