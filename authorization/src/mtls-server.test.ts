import type { IncomingMessage, ServerResponse } from 'node:http';
import { TLSSocket } from 'node:tls';
import { expect, test, vi } from 'vitest';
import type { MtlsEnvironment } from './env.ts';

const mocks = vi.hoisted(() => ({
  listener: vi.fn(),
  createServer: vi.fn(),
}));
vi.mock('node:fs', () => ({ readFileSync: () => Buffer.from('fixture') }));
vi.mock('node:crypto', () => ({
  X509Certificate: class {
    subjectAltName: string;
    constructor(raw: Buffer) {
      this.subjectAltName = raw.toString();
    }
  },
}));
vi.mock('node:http2', () => ({ createSecureServer: mocks.createServer }));
vi.mock('@hono/node-server', () => ({ getRequestListener: () => mocks.listener }));
import { startMtlsAuthorizationServer } from './mtls-server.ts';

const environment: MtlsEnvironment = {
  port: 9956,
  caPath: 'fixture-ca',
  certificatePath: 'fixture-cert',
  privateKeyPath: 'fixture-key',
  backendIdentity: 'spiffe://zglosto.local/backend',
  healthcheckIdentity: 'spiffe://zglosto.local/healthcheck',
  nginxIdentity: 'spiffe://zglosto.local/nginx',
};

function invoke(path: string, san: string, authorized = true) {
  // Capture the listener without binding a port or loading TLS material.
  mocks.createServer.mockReturnValue({ listen: vi.fn() });
  startMtlsAuthorizationServer(async () => new Response(), environment);
  const [options, listener] = mocks.createServer.mock.lastCall!;
  expect(options).toMatchObject({
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3',
  });
  const socket = Object.create(TLSSocket.prototype) as TLSSocket;
  Object.defineProperties(socket, {
    authorized: { value: authorized },
    getPeerCertificate: { value: () => ({ raw: Buffer.from(san) }) },
  });
  const response = { setHeader: vi.fn(), end: vi.fn(), statusCode: 200 };
  listener(
    { socket, url: path } as unknown as IncomingMessage,
    response as unknown as ServerResponse,
  );
  return response;
}

test('isolates backend, ingress and healthcheck identities by path', () => {
  invoke('/api/verify-session', `URI:${environment.backendIdentity}`);
  expect(mocks.listener).toHaveBeenCalledTimes(1);
  expect(invoke('/api/auth/sign-up/email', `URI:${environment.backendIdentity}`).statusCode).toBe(
    403,
  );
  expect(invoke('/api/verify-session', `URI:${environment.nginxIdentity}`).statusCode).toBe(403);
  expect(
    invoke('/api/auth/sign-up/email', `URI:${environment.healthcheckIdentity}`).statusCode,
  ).toBe(403);
  expect(invoke('/api/authentication', `URI:${environment.nginxIdentity}`).statusCode).toBe(403);
  invoke('/api/auth/get-session', `URI:${environment.nginxIdentity}`);
  invoke('/health/ready', `URI:${environment.healthcheckIdentity}`);
  expect(mocks.listener).toHaveBeenCalledTimes(3);
});

test('rejects unverified, unknown and ambiguous certificate identities', () => {
  for (const [san, authorized] of [
    [`URI:${environment.backendIdentity}`, false],
    ['URI:spiffe://zglosto.local/attacker', true],
    ['DNS:backend', true],
    [`URI:${environment.backendIdentity}, URI:${environment.nginxIdentity}`, true],
  ] as const) {
    const response = invoke('/api/verify-session', san, authorized);
    expect(response.statusCode).toBe(403);
    expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
  }
  expect(mocks.listener).not.toHaveBeenCalled();
});
