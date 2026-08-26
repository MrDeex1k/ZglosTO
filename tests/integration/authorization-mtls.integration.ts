import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { resolve } from 'node:path';

const port = Number(process.env.INTEGRATION_AUTHORIZATION_MTLS_PORT ?? '19956');
const certificatesDirectory = resolve(process.env.INTEGRATION_CERTIFICATES_DIRECTORY ?? '.certs');
const serviceDirectory = resolve(certificatesDirectory, 'service');
const databaseDirectory = resolve(certificatesDirectory, 'database');
const serviceCa = readFileSync(resolve(serviceDirectory, 'ca.crt'));

type ClientIdentity =
  | 'backend'
  | 'expired-backend'
  | 'healthcheck'
  | 'nginx'
  | 'unauthorized'
  | 'foreign-ca'
  | 'none';

interface MtlsResponse {
  status: number;
  payload: unknown;
}

function credentials(identity: ClientIdentity): Readonly<Record<string, Buffer>> {
  if (identity === 'none') return {};
  if (identity === 'foreign-ca') {
    return {
      cert: readFileSync(resolve(databaseDirectory, 'postgres-server.crt')),
      key: readFileSync(resolve(databaseDirectory, 'postgres-server.key')),
    };
  }

  const name =
    identity === 'expired-backend'
      ? 'expired-backend-client'
      : identity === 'backend'
        ? 'backend-client'
        : identity === 'healthcheck'
          ? 'authorization-healthcheck-client'
          : `${identity}-client`;
  return {
    cert: readFileSync(resolve(serviceDirectory, `${name}.crt`)),
    key: readFileSync(resolve(serviceDirectory, `${name}.key`)),
  };
}

interface TransportOverride {
  ca?: Buffer;
  servername?: string;
}

async function request(
  identity: ClientIdentity,
  path: string,
  override: TransportOverride = {},
): Promise<MtlsResponse> {
  return await new Promise<MtlsResponse>((resolveRequest, rejectRequest) => {
    const options: RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      servername: override.servername ?? 'authorization',
      ca: override.ca ?? serviceCa,
      minVersion: 'TLSv1.3',
      ...credentials(identity),
    };
    const outgoing = httpsRequest(options, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const payload: unknown = text ? JSON.parse(text) : null;
        resolveRequest({ status: incoming.statusCode ?? 0, payload });
      });
    });
    outgoing.on('error', rejectRequest);
    outgoing.end();
  });
}

async function expectHandshakeFailure(identity: ClientIdentity): Promise<void> {
  await assert.rejects(request(identity, '/health/live'));
}

async function expectPlaintextFailure(): Promise<void> {
  await assert.rejects(
    new Promise<void>((resolveRequest, rejectRequest) => {
      const outgoing = httpRequest(
        { hostname: '127.0.0.1', port, path: '/health/live', method: 'GET' },
        (incoming) => {
          incoming.resume();
          incoming.on('end', resolveRequest);
        },
      );
      outgoing.on('error', rejectRequest);
      outgoing.end();
    }),
  );
}

console.log('[authorization-mtls] valid workload certificates and server SAN');
const readiness = await request('backend', '/health/ready');
assert.equal(readiness.status, 200);
assert.equal((readiness.payload as Record<string, unknown>).status, 'ok');

const anonymousSession = await request('backend', '/api/verify-session');
assert.equal(anonymousSession.status, 401);
assert.deepEqual(anonymousSession.payload, { error: 'Unauthorized', session: null });

const publicSession = await request('nginx', '/api/auth/get-session');
assert.equal(publicSession.status, 200);
assert.equal(publicSession.payload, null);

const healthcheckReadiness = await request('healthcheck', '/health/ready');
assert.equal(healthcheckReadiness.status, 200);
assert.equal((await request('healthcheck', '/api/auth/get-session')).status, 403);

console.log('[authorization-mtls] endpoint policy rejects the wrong trusted workload');
assert.equal((await request('backend', '/api/auth/get-session')).status, 403);
assert.equal((await request('nginx', '/api/verify-session')).status, 403);
assert.equal((await request('unauthorized', '/health/live')).status, 403);

console.log('[authorization-mtls] TLS rejects missing and foreign client certificates');
await expectHandshakeFailure('none');
await expectHandshakeFailure('foreign-ca');
await expectHandshakeFailure('expired-backend');
await expectPlaintextFailure();

console.log('[authorization-mtls] client rejects a foreign server CA and mismatched server SAN');
await assert.rejects(
  request('backend', '/health/live', { ca: readFileSync(resolve(databaseDirectory, 'ca.crt')) }),
);
await assert.rejects(
  request('backend', '/health/live', { servername: 'wrong-authorization.invalid' }),
);

console.log('[authorization-mtls] contract passed');
