import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const baseUrl = process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:11335';
const origin = baseUrl.replace('127.0.0.1', 'localhost');
const password = 'Phase0!Pass123';
const imageBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPgqrjzH4QZYAwATqAJdcbiRDcAAAAASUVORK5CYII=';
const image = Buffer.from(imageBase64, 'base64');
const imageChecksum = createHash('sha256').update(image).digest('hex');

type JsonRecord = Record<string, unknown>;
type FallbackReason = 'timeout' | 'disabled' | 'unavailable' | 'invalid_response';

interface RequestOptions {
  method?: string;
  body?: JsonRecord;
  headers?: Readonly<Record<string, string>>;
  jar?: CookieJar;
  expected?: number | readonly number[];
  redirect?: RequestRedirect;
}

interface RequestResult {
  response: Response;
  payload: unknown;
}

interface InitiatedUpload {
  headers: Record<string, string>;
  method: 'PUT';
  uploadId: string;
  uploadUrl: string;
}

interface VerificationMessage {
  email: string;
  url: string;
}

interface ClassificationResult {
  classification: 'municipal' | 'emergency' | 'unknown';
  serviceKey: string;
  modelAvailable: boolean;
  source: 'model' | 'fallback';
  reason: FallbackReason | null;
}

interface CreatedIncident {
  id_zgloszenia: string;
  mail_zglaszajacego: string;
  reporter_user_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface IncidentImageRef {
  id: string;
  kind: 'report' | 'resolution';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  url: string;
  originalObjectKey: string;
  originalMimeType: string;
  originalSizeBytes: number;
  originalChecksumSha256: string;
}

interface CreateIncidentResult {
  success: true;
  incydent: CreatedIncident;
  classification: ClassificationResult;
}

interface ListedIncident {
  id_zgloszenia: string;
  revision: number | null;
  status_incydentu: string;
  latitude: number | null;
  longitude: number | null;
  zdjecie_incydentu_zglaszanego: IncidentImageRef | null;
  zdjecie_incydentu_rozwiazanego: IncidentImageRef | null;
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

function expectArray(value: unknown, path: string): unknown[] {
  assert.ok(Array.isArray(value), `${path} array`);
  return value;
}

function expectString(value: unknown, path: string): string {
  assert.equal(typeof value, 'string', `${path} string`);
  return value as string;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return expectString(value, path);
}

function expectBoolean(value: unknown, path: string): boolean {
  assert.equal(typeof value, 'boolean', `${path} boolean`);
  return value as boolean;
}

function expectNumber(value: unknown, path: string): number {
  assert.equal(typeof value, 'number', `${path} number`);
  return value as number;
}

function expectNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  return expectNumber(value, path);
}

function parseIncidentImageRef(value: unknown, path: string): IncidentImageRef {
  const record = expectRecord(value, path);
  const original = expectRecord(record.original, `${path}.original`);
  const kind = expectString(record.kind, `${path}.kind`);
  const status = expectString(record.status, `${path}.status`);
  assert.ok(['report', 'resolution'].includes(kind));
  assert.ok(['pending', 'processing', 'ready', 'failed'].includes(status));
  return {
    id: expectString(record.id, `${path}.id`),
    kind: kind as IncidentImageRef['kind'],
    status: status as IncidentImageRef['status'],
    url: expectString(record.url, `${path}.url`),
    originalObjectKey: expectString(original.objectKey, `${path}.original.objectKey`),
    originalMimeType: expectString(original.mimeType, `${path}.original.mimeType`),
    originalSizeBytes: expectNumber(original.sizeBytes, `${path}.original.sizeBytes`),
    originalChecksumSha256: expectString(
      original.checksumSha256,
      `${path}.original.checksumSha256`,
    ),
  };
}

function parseNullableIncidentImageRef(value: unknown, path: string): IncidentImageRef | null {
  if (value === null) return null;
  return parseIncidentImageRef(value, path);
}

function parseClassification(value: unknown): ClassificationResult {
  const record = expectRecord(value, 'classification');
  const classification = expectString(record.classification, 'classification.classification');
  const source = expectString(record.source, 'classification.source');
  const reason = expectNullableString(record.reason, 'classification.reason');
  assert.ok(['municipal', 'emergency', 'unknown'].includes(classification));
  assert.ok(['model', 'fallback'].includes(source));
  assert.ok(
    reason === null || ['timeout', 'disabled', 'unavailable', 'invalid_response'].includes(reason),
  );
  return {
    classification: classification as ClassificationResult['classification'],
    serviceKey: expectString(record.serviceKey, 'classification.serviceKey'),
    modelAvailable: expectBoolean(record.modelAvailable, 'classification.modelAvailable'),
    source: source as ClassificationResult['source'],
    reason: reason as FallbackReason | null,
  };
}

function parseCreatedIncident(value: unknown): CreatedIncident {
  const record = expectRecord(value, 'incident');
  return {
    id_zgloszenia: expectString(record.id_zgloszenia, 'incident.id_zgloszenia'),
    mail_zglaszajacego: expectString(record.mail_zglaszajacego, 'incident.mail_zglaszajacego'),
    reporter_user_id: expectNullableString(record.reporter_user_id, 'incident.reporter_user_id'),
    latitude: expectNullableNumber(record.latitude, 'incident.latitude'),
    longitude: expectNullableNumber(record.longitude, 'incident.longitude'),
  };
}

function parseCreateIncidentResult(value: unknown): CreateIncidentResult {
  const record = expectRecord(value, 'createIncident');
  assert.equal(record.success, true);
  return {
    success: true,
    incydent: parseCreatedIncident(record.incydent),
    classification: parseClassification(record.classification),
  };
}

function parseListedIncident(value: unknown, path: string): ListedIncident {
  const record = expectRecord(value, path);
  return {
    id_zgloszenia: expectString(record.id_zgloszenia, `${path}.id_zgloszenia`),
    revision: Object.hasOwn(record, 'revision')
      ? expectNumber(record.revision, `${path}.revision`)
      : null,
    status_incydentu: expectString(record.status_incydentu, `${path}.status_incydentu`),
    latitude: expectNullableNumber(record.latitude, `${path}.latitude`),
    longitude: expectNullableNumber(record.longitude, `${path}.longitude`),
    zdjecie_incydentu_zglaszanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_zglaszanego,
      `${path}.zdjecie_incydentu_zglaszanego`,
    ),
    zdjecie_incydentu_rozwiazanego: parseNullableIncidentImageRef(
      record.zdjecie_incydentu_rozwiazanego,
      `${path}.zdjecie_incydentu_rozwiazanego`,
    ),
  };
}

function parseIncidentList(value: unknown): ListedIncident[] {
  return expectArray(value, 'incidents').map((item, index) =>
    parseListedIncident(item, `incidents[${index}]`),
  );
}

function parsePublicIncidentIds(value: unknown): string[] {
  return expectArray(value, 'publicIncidents').map((item, index) => {
    const record = expectRecord(item, `publicIncidents[${index}]`);
    return expectString(record.id_zgloszenia, `publicIncidents[${index}].id_zgloszenia`);
  });
}

function parseVerificationMessage(value: unknown): VerificationMessage {
  const record = expectRecord(value, 'verificationMessage');
  return {
    email: expectString(record.email, 'verificationMessage.email'),
    url: expectString(record.url, 'verificationMessage.url'),
  };
}

function parseAuthEmail(value: unknown): string {
  const payload = expectRecord(value, 'authResponse');
  const user = expectRecord(payload.user, 'authResponse.user');
  return expectString(user.email, 'authResponse.user.email');
}

function parseInitiatedUpload(value: unknown): InitiatedUpload {
  const payload = expectRecord(value, 'initiatedUpload');
  const rawHeaders = expectRecord(payload.headers, 'initiatedUpload.headers');
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).map(([name, headerValue]) => [
      name,
      expectString(headerValue, `initiatedUpload.headers.${name}`),
    ]),
  );
  assert.equal(payload.method, 'PUT');
  return {
    headers,
    method: 'PUT',
    uploadId: expectString(payload.uploadId, 'initiatedUpload.uploadId'),
    uploadUrl: expectString(payload.uploadUrl, 'initiatedUpload.uploadUrl'),
  };
}

function parseUpdatedStatus(value: unknown): { revision: number; status: string } {
  const payload = expectRecord(value, 'updateStatusResponse');
  const incident = expectRecord(payload.incydent, 'updateStatusResponse.incydent');
  return {
    revision: expectNumber(payload.revision, 'updateStatusResponse.revision'),
    status: expectString(
      incident.status_incydentu,
      'updateStatusResponse.incydent.status_incydentu',
    ),
  };
}

async function request(path: string, options: RequestOptions = {}): Promise<RequestResult> {
  const method = options.method ?? 'GET';
  const expected = options.expected ?? 200;
  const headers = new Headers({ Origin: origin, ...options.headers });
  const cookie = options.jar?.header() ?? '';
  if (cookie) headers.set('Cookie', cookie);

  const init: RequestInit = {
    method,
    headers,
    redirect: options.redirect ?? 'follow',
  };
  if (options.body !== null && options.body != null) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path.startsWith('http') ? path : `${baseUrl}${path}`, init);
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

async function requestImage(
  path: string,
  jar: CookieJar | null,
  expected = 200,
): Promise<{ bytes: Uint8Array; response: Response }> {
  const headers = new Headers({ Origin: origin });
  const cookie = jar?.header() ?? '';
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${baseUrl}${path}`, { headers });
  assert.equal(response.status, expected, `GET ${path} status`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), response };
}

async function signUp(email: string): Promise<CookieJar> {
  const jar = new CookieJar();
  const { payload } = await request('/api/auth/sign-up/email', {
    method: 'POST',
    jar,
    body: {
      name: email.split('@')[0] ?? email,
      email,
      password,
      callbackURL: `${origin}/`,
    },
  });
  assert.equal(parseAuthEmail(payload), email);
  return jar;
}

async function signIn(email: string): Promise<CookieJar> {
  const jar = new CookieJar();
  const { payload } = await request('/api/auth/sign-in/email', {
    method: 'POST',
    jar,
    body: { email, password },
  });
  assert.equal(parseAuthEmail(payload), email);
  assert.ok(jar.header().includes('better-auth.session_token='));
  return jar;
}

interface CreateIncidentOptions {
  description: string;
  email: string;
  serviceKey?: string;
  jar?: CookieJar;
  coordinates?: { latitude: number; longitude: number } | null;
}

async function createIncident(options: CreateIncidentOptions): Promise<CreateIncidentResult> {
  const imageUploadId = await uploadImage('/api/mieszkaniec/obrazy/uploads', options.jar);
  const { payload } = await request('/api/mieszkaniec/incydenty', {
    method: 'POST',
    ...(options.jar == null ? {} : { jar: options.jar }),
    expected: 201,
    body: {
      opis_zgloszenia: options.description,
      mail_zglaszajacego: options.email,
      adres_zgloszenia: 'ul. Integracyjna 1',
      latitude: options.coordinates?.latitude ?? null,
      longitude: options.coordinates?.longitude ?? null,
      typ_sluzby: options.serviceKey ?? 'roads',
      zdjecie_incydentu_zglaszanego_upload_id: imageUploadId,
    },
  });
  return parseCreateIncidentResult(payload);
}

async function uploadImage(path: string, jar?: CookieJar): Promise<string> {
  const initiated = await request(path, {
    method: 'POST',
    ...(jar == null ? {} : { jar }),
    expected: 201,
    body: {
      checksumSha256: imageChecksum,
      mimeType: 'image/png',
      sizeBytes: image.byteLength,
    },
  });
  const upload = parseInitiatedUpload(initiated.payload);
  const response = await fetch(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers,
    body: image,
  });
  assert.ok(response.ok, `presigned PUT returned ${response.status}: ${await response.text()}`);
  return upload.uploadId;
}

async function waitForVerificationMessage(email: string): Promise<VerificationMessage> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    // Polling must remain sequential because the message is created asynchronously.
    // oxlint-disable-next-line no-await-in-loop
    const result = await request(
      `/api/auth/__test__/verification-email?email=${encodeURIComponent(email)}`,
      { expected: [200, 404] },
    );
    if (result.response.status === 200) return parseVerificationMessage(result.payload);
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Verification message for ${email} was not created`);
}

async function run(): Promise<void> {
  const expectedRedisStatus = process.env.INTEGRATION_EXPECTED_REDIS_STATUS ?? 'disabled';
  const residentEmail = 'phase0.resident@example.com';
  const serviceEmail = 'phase0.service@example.com';
  const adminEmail = 'phase0.admin@example.com';

  console.log('[integration] backend White-Label readiness');
  const backendReadinessResult = await request('/api/health/ready');
  const backendReadiness = expectRecord(backendReadinessResult.payload, 'backendReadiness');
  assert.equal(backendReadiness.status, 'ok');
  assert.equal(backendReadiness.database, 'up');
  assert.equal(backendReadiness.objectStorage, 'up');
  assert.equal(backendReadiness.redis, expectedRedisStatus);
  const backendConfigReadiness = expectRecord(backendReadiness.config, 'backendReadiness.config');
  assert.equal(backendConfigReadiness.status, 'valid');
  assert.match(
    expectString(backendConfigReadiness.checksum, 'backendReadiness.config.checksum'),
    /^[0-9a-f]{64}$/,
  );

  console.log('[integration] public White-Label config and HTTP cache validation');
  const publicConfigResult = await request('/api/config/public');
  const publicConfigResponse = expectRecord(publicConfigResult.payload, 'publicConfigResponse');
  const publicConfig = expectRecord(publicConfigResponse.config, 'publicConfigResponse.config');
  const checksum = expectString(publicConfigResponse.checksum, 'publicConfigResponse.checksum');
  assert.match(checksum, /^[0-9a-f]{64}$/);
  assert.equal(backendConfigReadiness.checksum, checksum);
  assert.equal(
    expectString(publicConfigResponse.configVersion, 'publicConfigResponse.configVersion'),
    expectString(publicConfig.configVersion, 'publicConfigResponse.config.configVersion'),
  );
  const publicRouting = expectRecord(publicConfig.routing, 'publicConfig.routing');
  assert.equal(
    expectString(publicRouting.fallbackServiceKey, 'publicConfig.routing.fallbackServiceKey'),
    'other',
  );
  for (const [index, service] of expectArray(
    publicConfig.services,
    'publicConfig.services',
  ).entries()) {
    assert.equal(expectRecord(service, `publicConfig.services[${index}]`).enabled, true);
  }
  const etag = publicConfigResult.response.headers.get('etag');
  assert.ok(etag);
  assert.equal(
    publicConfigResult.response.headers.get('cache-control'),
    'public, max-age=60, must-revalidate',
  );
  const notModified = await request('/api/config/public', {
    expected: 304,
    headers: { 'If-None-Match': etag },
  });
  assert.equal(notModified.payload, null);

  console.log('[integration] unauthenticated access and anonymous report');
  await request('/api/mieszkaniec/incydenty?email=phase0.resident@example.com', {
    expected: 401,
  });
  const anonymous = await createIncident({
    description: '[municipal] Dziura w jezdni',
    email: '  PHASE0.RESIDENT@EXAMPLE.COM ',
    coordinates: { latitude: 54.352, longitude: 18.6466 },
  });
  assert.equal(anonymous.incydent.mail_zglaszajacego, residentEmail);
  assert.equal(anonymous.incydent.reporter_user_id, null);
  assert.equal(anonymous.incydent.latitude, 54.352);
  assert.equal(anonymous.incydent.longitude, 18.6466);
  assert.deepEqual(anonymous.classification, {
    classification: 'municipal',
    serviceKey: 'roads',
    modelAvailable: true,
    source: 'model',
    reason: null,
  });

  await request('/api/mieszkaniec/incydenty', {
    method: 'POST',
    expected: 400,
    body: {
      opis_zgloszenia: 'Niepełna lokalizacja',
      mail_zglaszajacego: 'location-invalid@example.com',
      adres_zgloszenia: 'ul. Integracyjna 3',
      latitude: 54.352,
      longitude: null,
    },
  });
  await request('/api/mieszkaniec/incydenty', {
    method: 'POST',
    expected: 400,
    body: {
      opis_zgloszenia: 'Lokalizacja poza zakresem',
      mail_zglaszajacego: 'location-invalid@example.com',
      adres_zgloszenia: 'ul. Integracyjna 3',
      latitude: 54.352,
      longitude: 180.01,
    },
  });

  console.log('[integration] registration, email verification and history claim');
  const unverifiedJar = await signUp(residentEmail);
  const beforeVerification = await request('/api/mieszkaniec/incydenty', {
    jar: unverifiedJar,
  });
  assert.deepEqual(parseIncidentList(beforeVerification.payload), []);

  const verificationMessage = await waitForVerificationMessage(residentEmail);
  assert.equal(verificationMessage.email, residentEmail);
  await request(verificationMessage.url, {
    jar: unverifiedJar,
    redirect: 'manual',
    expected: [200, 302],
  });

  const residentJar = await signIn(residentEmail);
  const claimedResponse = await request('/api/mieszkaniec/incydenty', { jar: residentJar });
  const claimed = parseIncidentList(claimedResponse.payload);
  assert.equal(claimed.length, 1);
  const claimedIncident = claimed[0];
  assert.ok(claimedIncident);
  assert.equal(claimedIncident.id_zgloszenia, anonymous.incydent.id_zgloszenia);
  assert.equal(claimedIncident.latitude, 54.352);
  assert.equal(claimedIncident.longitude, 18.6466);
  const reportImage = claimedIncident.zdjecie_incydentu_zglaszanego;
  assert.ok(reportImage);
  assert.equal(reportImage.kind, 'report');
  assert.equal(reportImage.status, 'pending');
  assert.equal(reportImage.originalMimeType, 'image/png');
  assert.match(reportImage.originalObjectKey, /^staging\/report\/[0-9a-f-]+\/original\.png$/u);
  assert.match(reportImage.originalChecksumSha256, /^[0-9a-f]{64}$/);
  await requestImage(reportImage.url, null, 401);
  const privateImage = await requestImage(reportImage.url, residentJar);
  assert.equal(privateImage.response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(privateImage.bytes), image);

  await request('/api/mieszkaniec/incydenty', {
    method: 'POST',
    jar: residentJar,
    expected: 400,
    body: {
      opis_zgloszenia: 'Błędny autor',
      mail_zglaszajacego: 'other@example.com',
      adres_zgloszenia: 'ul. Integracyjna 2',
    },
  });

  console.log('[integration] deterministic LLM model and fallback variants');
  const emergency = await createIncident({
    description: '[emergency] Bezpośrednie zagrożenie życia',
    email: residentEmail,
    jar: residentJar,
  });
  assert.ok(emergency.incydent.reporter_user_id);
  assert.equal(emergency.classification.classification, 'emergency');
  assert.equal(emergency.classification.source, 'model');

  const fallbackCases: readonly (readonly [string, FallbackReason])[] = [
    ['[timeout] Model odpowiada za długo', 'timeout'],
    ['[unavailable] Model jest niedostępny', 'unavailable'],
    ['[invalid] Model zwraca zły kontrakt', 'invalid_response'],
  ];
  const fallbackIncidents: CreatedIncident[] = [];
  for (const [description, reason] of fallbackCases) {
    // Keep persistence assertions isolated and deterministic.
    // oxlint-disable-next-line no-await-in-loop
    const result = await createIncident({
      description,
      email: residentEmail,
      serviceKey: 'roads',
      jar: residentJar,
    });
    assert.deepEqual(result.classification, {
      classification: 'unknown',
      serviceKey: 'other',
      modelAvailable: false,
      source: 'fallback',
      reason,
    });
    fallbackIncidents.push(result.incydent);
  }

  console.log('[integration] admin and service roles');
  await signUp(adminEmail);
  await signUp(serviceEmail);
  await request('/api/auth/__test__/role', {
    method: 'POST',
    body: { email: adminEmail, role: 'admin' },
  });
  const adminJar = await signIn(adminEmail);

  await request('/api/admin/incydenty', { jar: residentJar, expected: 403 });
  const adminResponse = await request('/api/admin/incydenty', { jar: adminJar });
  assert.equal(parseIncidentList(adminResponse.payload).length, 5);
  await request('/api/admin/statystyki', { jar: adminJar });

  await request('/api/admin/uzytkownicy/service-key', {
    method: 'PATCH',
    jar: adminJar,
    expected: 400,
    body: {
      email: serviceEmail,
      uprawnienia: 'sluzby',
      serviceKey: 'not-configured',
    },
  });
  await request('/api/admin/uzytkownicy/service-key', {
    method: 'PATCH',
    jar: adminJar,
    body: {
      email: serviceEmail,
      uprawnienia: 'sluzby',
      serviceKey: 'roads',
    },
  });
  const serviceJar = await signIn(serviceEmail);
  await request('/api/sluzby/incydenty', { jar: residentJar, expected: 403 });
  const serviceResponse = await request('/api/sluzby/incydenty', { jar: serviceJar });
  const serviceIncidents = parseIncidentList(serviceResponse.payload);
  assert.equal(serviceIncidents.length, 2);

  console.log('[integration] status codes, service isolation and photos');
  const incidentId = anonymous.incydent.id_zgloszenia;
  const serviceIncident = serviceIncidents.find(
    (incident) => incident.id_zgloszenia === incidentId,
  );
  assert.ok(serviceIncident);
  assert.equal(typeof serviceIncident.revision, 'number');
  const incidentRevision = serviceIncident.revision;
  await request(`/api/sluzby/incydenty/${incidentId}/status`, {
    method: 'PATCH',
    jar: serviceJar,
    expected: 400,
    headers: { 'If-Match': `"incident-${incidentRevision}"` },
    body: { status_incydentu: 'w_trakcie' },
  });
  const inProgress = await request(`/api/sluzby/incydenty/${incidentId}/status`, {
    method: 'PATCH',
    jar: serviceJar,
    headers: { 'If-Match': `"incident-${incidentRevision}"` },
    body: { status_incydentu: 'in_progress' },
  });
  const inProgressMutation = parseUpdatedStatus(inProgress.payload);
  assert.equal(inProgressMutation.status, 'in_progress');

  const firstResolutionUploadId = await uploadImage(
    `/api/sluzby/incydenty/${incidentId}/obrazy/uploads`,
    serviceJar,
  );
  await request(`/api/sluzby/incydenty/${incidentId}/zdjecie_rozwiazane`, {
    method: 'POST',
    jar: serviceJar,
    body: { uploadId: firstResolutionUploadId },
  });
  const secondResolutionUploadId = await uploadImage(
    `/api/sluzby/incydenty/${incidentId}/obrazy/uploads`,
    serviceJar,
  );
  await request(`/api/sluzby/incydenty/${incidentId}/zdjecie_rozwiazane`, {
    method: 'POST',
    jar: serviceJar,
    body: { uploadId: secondResolutionUploadId },
  });
  const resolved = await request(`/api/sluzby/incydenty/${incidentId}/status`, {
    method: 'PATCH',
    jar: serviceJar,
    headers: { 'If-Match': `"incident-${inProgressMutation.revision}"` },
    body: { status_incydentu: 'resolved' },
  });
  assert.equal(parseUpdatedStatus(resolved.payload).status, 'resolved');

  const fallbackIncident = fallbackIncidents[0];
  assert.ok(fallbackIncident);
  await request(`/api/sluzby/incydenty/${fallbackIncident.id_zgloszenia}/status`, {
    method: 'PATCH',
    jar: serviceJar,
    expected: 404,
    headers: { 'If-Match': '"incident-1"' },
    body: { status_incydentu: 'resolved' },
  });

  const serviceAfterUpdateResponse = await request('/api/sluzby/incydenty', {
    jar: serviceJar,
  });
  const serviceAfterUpdate = parseIncidentList(serviceAfterUpdateResponse.payload);
  const updatedIncident = serviceAfterUpdate.find(
    (incident) => incident.id_zgloszenia === incidentId,
  );
  assert.ok(updatedIncident);
  assert.equal(updatedIncident.status_incydentu, 'resolved');
  const resolutionImage = updatedIncident.zdjecie_incydentu_rozwiazanego;
  assert.ok(resolutionImage);
  assert.equal(resolutionImage.kind, 'resolution');
  const publicImage = await requestImage(resolutionImage.url, null);
  assert.equal(publicImage.response.headers.get('content-type'), 'image/png');
  assert.equal(
    publicImage.response.headers.get('cache-control'),
    'public, max-age=300, must-revalidate',
  );
  assert.deepEqual(Buffer.from(publicImage.bytes), image);

  const homepageResponse = await request('/api/mieszkaniec/incydenty/glowna');
  const homepageIds = parsePublicIncidentIds(homepageResponse.payload);
  assert.ok(homepageIds.includes(incidentId));
  assert.match(homepageResponse.response.headers.get('x-cache-status') ?? '', /^(HIT|MISS)$/u);
  assert.equal(
    homepageResponse.response.headers.get('cache-control'),
    'public, max-age=0, must-revalidate',
  );
  assert.equal(homepageResponse.response.headers.get('x-accel-expires'), null);

  const cachedHomepageResponse = await request('/api/mieszkaniec/incydenty/glowna');
  assert.equal(cachedHomepageResponse.response.headers.get('x-cache-status'), 'HIT');
  assert.deepEqual(cachedHomepageResponse.payload, homepageResponse.payload);

  await request(`/api/admin/incydenty/${emergency.incydent.id_zgloszenia}/sprawdzenie`, {
    method: 'PATCH',
    jar: adminJar,
    body: { sprawdzenie_incydentu: true },
  });

  const residentFinalResponse = await request('/api/mieszkaniec/incydenty', {
    jar: residentJar,
  });
  const residentFinal = parseIncidentList(residentFinalResponse.payload);
  assert.equal(residentFinal.length, 5);
  assert.deepEqual(
    new Set(residentFinal.map((incident) => incident.status_incydentu)),
    new Set(['reported', 'resolved']),
  );

  console.log('[integration] PASS: all Phase 0 business contracts are covered');
}

run().catch((error: unknown) => {
  console.error('[integration] FAIL');
  console.error(error);
  process.exitCode = 1;
});
