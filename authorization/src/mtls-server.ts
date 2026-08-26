import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TLSSocket } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { getRequestListener } from '@hono/node-server';

import type { MtlsEnvironment } from './env.ts';

type AuthorizationFetch = Parameters<typeof getRequestListener>[0];

function certificateIdentity(request: IncomingMessage): string | null {
  const socket = request.socket;
  if (!(socket instanceof TLSSocket) || !socket.authorized) return null;

  const peerCertificate = socket.getPeerCertificate();
  if (!peerCertificate.raw) return null;

  const subjectAlternativeName = new X509Certificate(peerCertificate.raw).subjectAltName || '';
  const identities = subjectAlternativeName
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.startsWith('URI:'))
    .map((value) => value.slice('URI:'.length));

  return identities.length === 1 ? (identities[0] ?? null) : null;
}

function permittedPath(identity: string, path: string, environment: MtlsEnvironment): boolean {
  if (identity === environment.backendIdentity) {
    return (
      path === '/api/verify-session' ||
      path === '/health' ||
      path === '/health/live' ||
      path === '/health/ready'
    );
  }

  if (identity === environment.healthcheckIdentity) {
    return path === '/health' || path === '/health/live' || path === '/health/ready';
  }

  if (identity === environment.nginxIdentity) {
    return path === '/api/auth' || path.startsWith('/api/auth/');
  }

  return false;
}

function rejectIdentity(response: ServerResponse): void {
  const body = JSON.stringify({ error: 'Forbidden workload identity' });
  response.writeHead(403, {
    'content-type': 'application/json; charset=UTF-8',
    'content-length': Buffer.byteLength(body).toString(),
    'cache-control': 'no-store',
  });
  response.end(body);
}

export function startMtlsAuthorizationServer(
  fetch: AuthorizationFetch,
  environment: MtlsEnvironment,
): ReturnType<typeof createServer> {
  const requestListener = getRequestListener(fetch);
  const server = createServer(
    {
      key: readFileSync(environment.privateKeyPath),
      cert: readFileSync(environment.certificatePath),
      ca: readFileSync(environment.caPath),
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
    },
    (request, response) => {
      const identity = certificateIdentity(request);
      const path = new URL(request.url ?? '/', 'https://authorization').pathname;
      if (identity === null || !permittedPath(identity, path, environment)) {
        rejectIdentity(response);
        return;
      }

      void requestListener(request, response);
    },
  );

  server.listen(environment.port, '0.0.0.0', () => {
    process.stdout.write(
      `${JSON.stringify({
        event: 'authorization.mtls.started',
        level: 'info',
        port: environment.port,
        service: 'authorization',
        timestamp: new Date().toISOString(),
      })}\n`,
    );
  });
  return server;
}
