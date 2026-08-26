import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';

const publicBaseUrl = process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:11335';
const authorizationBaseUrl = process.env.INTEGRATION_AUTHORIZATION_URL ?? 'https://127.0.0.1:19956';
const certificatesDirectory = resolve(
  process.env.INTEGRATION_CERTIFICATES_DIRECTORY ?? '.certs',
  'service',
);
const trustedOrigin = publicBaseUrl.replace('127.0.0.1', 'localhost');
const untrustedOrigin = 'https://untrusted.example.invalid';
const contractRunId = (process.env.INTEGRATION_AUTH_CONTRACT_RUN_ID || 'default')
  .replace(/[^a-z0-9-]/gi, '')
  .toLowerCase();
const email = `phase5.authorization-contract.${contractRunId || 'default'}@example.com`;
const password = 'Phase5!Contract123';

type JsonRecord = Record<string, unknown>;

interface RequestOptions {
  method?: string;
  body?: JsonRecord;
  headers?: Readonly<Record<string, string>>;
  jar?: CookieJar;
  expected?: number | readonly number[];
}

interface RequestResult {
  response: Response;
  payload: unknown;
}

interface ContractUser {
  id: string;
  email: string;
  emailVerified: boolean;
  uprawnienia: 'mieszkaniec' | 'sluzby' | 'admin' | null;
  serviceKey: string | null;
}

async function mtlsFetch(url: string, init: RequestInit): Promise<Response> {
  const target = new URL(url);
  const headers = Object.fromEntries(new Headers(init.headers).entries());

  return await new Promise<Response>((resolveRequest, rejectRequest) => {
    const outgoing = httpsRequest(
      {
        ca: readFileSync(resolve(certificatesDirectory, 'ca.crt')),
        cert: readFileSync(resolve(certificatesDirectory, 'backend-client.crt')),
        headers,
        hostname: target.hostname,
        key: readFileSync(resolve(certificatesDirectory, 'backend-client.key')),
        method: init.method,
        minVersion: 'TLSv1.3',
        path: `${target.pathname}${target.search}`,
        port: Number(target.port),
        rejectUnauthorized: true,
        servername: 'authorization',
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          const status = incoming.statusCode;
          if (typeof status !== 'number') {
            rejectRequest(new Error('Authorization response did not include an HTTP status'));
            return;
          }
          const responseHeaders = new Headers();
          for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
            const name = incoming.rawHeaders[index];
            const value = incoming.rawHeaders[index + 1];
            if (typeof name === 'string' && typeof value === 'string') {
              responseHeaders.append(name, value);
            }
          }
          resolveRequest(
            new Response(Buffer.concat(chunks), {
              headers: responseHeaders,
              status,
            }),
          );
        });
        incoming.on('error', rejectRequest);
      },
    );
    outgoing.on('error', rejectRequest);
    if (typeof init.body === 'string') outgoing.write(init.body);
    outgoing.end();
  });
}

class CookieJar {
  readonly #cookies = new Map<string, string>();

  capture(response: Response): void {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator === -1) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.#cookies.set(name, cookieValue);
      else this.#cookies.delete(name);
    }
  }

  header(): string {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function expectRecord(value: unknown, path: string): JsonRecord {
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value), `${path} object`);
  return value as JsonRecord;
}

function expectString(value: unknown, path: string): string {
  assert.equal(typeof value, 'string', `${path} string`);
  return value as string;
}

function expectBoolean(value: unknown, path: string): boolean {
  assert.equal(typeof value, 'boolean', `${path} boolean`);
  return value as boolean;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return expectString(value, path);
}

function parseUser(value: unknown, path: string): ContractUser {
  const user = expectRecord(value, path);
  const role = user.uprawnienia;
  assert.ok(
    role === null || role === 'mieszkaniec' || role === 'sluzby' || role === 'admin',
    `${path}.uprawnienia role`,
  );
  return {
    id: expectString(user.id, `${path}.id`),
    email: expectString(user.email, `${path}.email`),
    emailVerified: expectBoolean(user.emailVerified, `${path}.emailVerified`),
    uprawnienia: role,
    serviceKey: expectNullableString(user.serviceKey, `${path}.serviceKey`),
  };
}

async function request(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<RequestResult> {
  const method = options.method ?? 'GET';
  const expected = options.expected ?? 200;
  const headers = new Headers({ Origin: trustedOrigin, ...options.headers });
  const cookie = options.jar?.header() ?? '';
  if (cookie) headers.set('Cookie', cookie);

  const init: RequestInit = { method, headers, redirect: 'manual' };
  if (Object.hasOwn(options, 'body')) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  const target = `${baseUrl}${path}`;
  const response = baseUrl.startsWith('https:')
    ? await mtlsFetch(target, init)
    : await fetch(target, init);
  options.jar?.capture(response);
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  const expectedStatuses = typeof expected === 'number' ? [expected] : expected;
  assert.ok(
    expectedStatuses.includes(response.status),
    `${method} ${path} returned ${response.status}, expected ${expectedStatuses.join(' or ')}: ${text}`,
  );
  return { response, payload };
}

function assertError(value: unknown, message: string): void {
  assert.deepEqual(value, { error: message });
}

async function run(): Promise<void> {
  const expectedRedisStatus = process.env.INTEGRATION_EXPECTED_REDIS_STATUS ?? 'disabled';
  console.log('[auth-contract] liveness and readiness payloads');
  const liveness = await request(authorizationBaseUrl, '/health/live');
  assert.deepEqual(liveness.payload, { status: 'ok', service: 'authorization' });

  for (const path of ['/health', '/health/ready'] as const) {
    // Both paths intentionally expose the same backward-compatible readiness contract.
    // oxlint-disable-next-line no-await-in-loop
    const result = await request(authorizationBaseUrl, path);
    const readiness = expectRecord(result.payload, path);
    assert.equal(readiness.status, 'ok');
    assert.equal(readiness.service, 'authorization');
    assert.equal(readiness.database, 'up');
    assert.equal(readiness.redis, expectedRedisStatus);
    const config = expectRecord(readiness.config, `${path}.config`);
    assert.equal(config.status, 'valid');
    assert.match(expectString(config.configVersion, `${path}.config.configVersion`), /^\S+$/);
    assert.match(expectString(config.checksum, `${path}.config.checksum`), /^[0-9a-f]{64}$/);
  }

  console.log('[auth-contract] CORS allowlist and unauthenticated session behavior');
  const preflight = await request(publicBaseUrl, '/api/auth/get-session', {
    method: 'OPTIONS',
    expected: 204,
    headers: {
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.response.headers.get('access-control-allow-origin'), trustedOrigin);
  assert.equal(preflight.response.headers.get('access-control-allow-credentials'), 'true');

  const untrusted = await request(publicBaseUrl, '/api/auth/get-session', {
    headers: { Origin: untrustedOrigin },
  });
  assert.equal(untrusted.payload, null);
  assert.equal(untrusted.response.headers.get('access-control-allow-origin'), null);

  const publicAnonymousSession = await request(publicBaseUrl, '/api/auth/get-session');
  assert.equal(publicAnonymousSession.payload, null);
  const internalAnonymousSession = await request(authorizationBaseUrl, '/api/verify-session', {
    expected: 401,
  });
  assert.deepEqual(internalAnonymousSession.payload, { error: 'Unauthorized', session: null });

  console.log('[auth-contract] sign-up, Better Auth session cookie and resident role');
  const jar = new CookieJar();
  const signUp = await request(publicBaseUrl, '/api/auth/sign-up/email', {
    method: 'POST',
    jar,
    body: {
      name: 'Phase 5 Contract',
      email,
      password,
      callbackURL: `${trustedOrigin}/`,
    },
  });
  const signUpPayload = expectRecord(signUp.payload, 'signUp');
  assert.equal(
    expectString(expectRecord(signUpPayload.user, 'signUp.user').email, 'signUp.user.email'),
    email,
  );
  assert.match(jar.header(), /(?:^|; )better-auth\.session_token=/);
  assert.equal(signUp.response.headers.get('access-control-allow-origin'), trustedOrigin);
  assert.equal(signUp.response.headers.get('access-control-allow-credentials'), 'true');

  const publicSession = await request(publicBaseUrl, '/api/auth/get-session', { jar });
  const publicSessionPayload = expectRecord(publicSession.payload, 'publicSession');
  expectRecord(publicSessionPayload.session, 'publicSession.session');
  const resident = parseUser(publicSessionPayload.user, 'publicSession.user');
  assert.equal(resident.email, email);
  assert.equal(resident.uprawnienia, 'mieszkaniec');
  assert.equal(resident.serviceKey, null);

  const verified = await request(authorizationBaseUrl, '/api/verify-session', { jar });
  const verifiedPayload = expectRecord(verified.payload, 'verifiedSession');
  assert.equal(verifiedPayload.success, true);
  expectRecord(verifiedPayload.session, 'verifiedSession.session');
  assert.deepEqual(parseUser(verifiedPayload.user, 'verifiedSession.user'), resident);

  console.log('[auth-contract] test fixtures and role propagation');
  const missingVerification = await request(
    publicBaseUrl,
    '/api/auth/__test__/verification-email?email=missing@example.com',
    { expected: 404 },
  );
  assertError(missingVerification.payload, 'Verification email not found');

  const invalidRole = await request(publicBaseUrl, '/api/auth/__test__/role', {
    method: 'POST',
    expected: 400,
    body: { email, role: 'sluzby', serviceKey: null },
  });
  assertError(invalidRole.payload, 'Invalid test role fixture');

  const unknownUser = await request(publicBaseUrl, '/api/auth/__test__/role', {
    method: 'POST',
    expected: 404,
    body: { email: 'missing@example.com', role: 'admin' },
  });
  assertError(unknownUser.payload, 'User not found');

  const roleUpdate = await request(publicBaseUrl, '/api/auth/__test__/role', {
    method: 'POST',
    body: { email, role: 'sluzby', serviceKey: 'roads' },
  });
  assert.deepEqual(roleUpdate.payload, { success: true });

  const serviceSession = await request(authorizationBaseUrl, '/api/verify-session', { jar });
  const servicePayload = expectRecord(serviceSession.payload, 'serviceSession');
  const serviceUser = parseUser(servicePayload.user, 'serviceSession.user');
  assert.equal(serviceUser.uprawnienia, 'sluzby');
  assert.equal(serviceUser.serviceKey, 'roads');

  const adminRoleUpdate = await request(publicBaseUrl, '/api/auth/__test__/role', {
    method: 'POST',
    body: { email, role: 'admin', serviceKey: 'roads' },
  });
  assert.deepEqual(adminRoleUpdate.payload, { success: true });
  const adminSession = await request(authorizationBaseUrl, '/api/verify-session', { jar });
  const adminPayload = expectRecord(adminSession.payload, 'adminSession');
  const adminUser = parseUser(adminPayload.user, 'adminSession.user');
  assert.equal(adminUser.uprawnienia, 'admin');
  assert.equal(adminUser.serviceKey, null);

  console.log('[auth-contract] sign-out invalidates the same session on both boundaries');
  const signOut = await request(publicBaseUrl, '/api/auth/sign-out', {
    method: 'POST',
    jar,
  });
  assert.deepEqual(signOut.payload, { success: true });
  assert.equal(jar.header(), '');

  const publicAfterSignOut = await request(publicBaseUrl, '/api/auth/get-session', { jar });
  assert.equal(publicAfterSignOut.payload, null);
  const internalAfterSignOut = await request(authorizationBaseUrl, '/api/verify-session', {
    jar,
    expected: 401,
  });
  assert.deepEqual(internalAfterSignOut.payload, { error: 'Unauthorized', session: null });

  console.log('[auth-contract] contract passed');
}

await run();
