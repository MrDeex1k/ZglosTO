import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import { TLSSocket } from 'node:tls';
import { getRequestListener } from '@hono/node-server';
import type { LlmGatewayEnvironment } from './environment.ts';

type GatewayFetch = Parameters<typeof getRequestListener>[0];

function certificateIdentity(request: IncomingMessage): string | null {
  const socket = request.socket;
  if (!(socket instanceof TLSSocket) || !socket.authorized) return null;
  const peerCertificate = socket.getPeerCertificate();
  if (!peerCertificate.raw) return null;
  const identities = (new X509Certificate(peerCertificate.raw).subjectAltName || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.startsWith('URI:'))
    .map((value) => value.slice('URI:'.length));
  return identities.length === 1 ? (identities[0] ?? null) : null;
}

export function permittedGatewayPath(
  identity: string,
  path: string,
  environment: LlmGatewayEnvironment,
): boolean {
  if (identity === environment.backendIdentity || identity === environment.kedaIdentity) {
    return path === '/classify-incident';
  }
  if (identity === environment.nginxIdentity || identity === environment.healthcheckIdentity) {
    return path === '/health' || path === '/health/live' || path === '/health/ready';
  }
  return false;
}

function rejectIdentity(response: ServerResponse): void {
  const body = JSON.stringify({ error: 'forbidden_workload_identity' });
  response.writeHead(403, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body).toString(),
    'content-type': 'application/json; charset=UTF-8',
  });
  response.end(body);
}

export function startMtlsGatewayServer(
  fetch: GatewayFetch,
  environment: LlmGatewayEnvironment,
): ReturnType<typeof createServer> {
  const requestListener = getRequestListener(fetch);
  const server = createServer(
    {
      ca: readFileSync(environment.tlsCaPath),
      cert: readFileSync(environment.tlsCertificatePath),
      key: readFileSync(environment.tlsPrivateKeyPath),
      minVersion: 'TLSv1.3',
      rejectUnauthorized: true,
      requestCert: true,
    },
    (request, response) => {
      const identity = certificateIdentity(request);
      const path = new URL(request.url ?? '/', 'https://llm-gateway').pathname;
      if (identity === null || !permittedGatewayPath(identity, path, environment)) {
        rejectIdentity(response);
        return;
      }
      void requestListener(request, response);
    },
  );
  server.listen(environment.port, '0.0.0.0');
  return server;
}
