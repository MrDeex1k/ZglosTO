import { readFileSync } from 'node:fs';
import { request } from 'node:https';

// Liveness must not restart a healthy process while replay protection warms up.
const ready = process.argv.includes('--ready') && process.env.LLM_RUNTIME !== 'disabled';
const outgoing = request(
  new URL(`https://127.0.0.1:8130/health/${ready ? 'ready' : 'live'}`),
  {
    ca: readFileSync(process.env.LLM_GATEWAY_TLS_CA_PATH ?? '/run/secrets/service/ca.crt'),
    cert: readFileSync(
      process.env.LLM_GATEWAY_HEALTHCHECK_CERT_PATH ??
        '/run/secrets/service/llm-gateway-healthcheck-client.crt',
    ),
    key: readFileSync(
      process.env.LLM_GATEWAY_HEALTHCHECK_KEY_PATH ??
        '/run/secrets/service/llm-gateway-healthcheck-client.key',
    ),
    minVersion: 'TLSv1.3',
    servername: process.env.LLM_GATEWAY_HEALTHCHECK_SERVER_NAME ?? 'llm-gateway',
  },
  (response) => {
    response.resume();
    response.once('end', () => process.exit(response.statusCode === 200 ? 0 : 1));
  },
);
outgoing.setTimeout(2_000, () => outgoing.destroy(new Error('Health check timed out')));
outgoing.once('error', () => process.exit(1));
outgoing.end();
