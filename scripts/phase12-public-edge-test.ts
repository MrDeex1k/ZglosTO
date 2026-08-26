import { lookup } from 'node:dns/promises';
import { writeFileSync } from 'node:fs';
import { connect } from 'node:tls';

const rawBaseUrl = process.env.PHASE12_PUBLIC_BASE_URL;
if (!rawBaseUrl) throw new Error('PHASE12_PUBLIC_BASE_URL is required');

const baseUrl = new URL(rawBaseUrl);
if (baseUrl.protocol !== 'https:') {
  throw new Error('PHASE12_PUBLIC_BASE_URL must use https');
}
if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error('PHASE12_PUBLIC_BASE_URL must not contain credentials, query or fragment');
}

const minimumCertificateDays = Number.parseInt(
  process.env.PHASE12_MINIMUM_CERTIFICATE_DAYS ?? '14',
  10,
);
if (!Number.isSafeInteger(minimumCertificateDays) || minimumCertificateDays < 1) {
  throw new Error('PHASE12_MINIMUM_CERTIFICATE_DAYS must be a positive integer');
}

const addresses = await lookup(baseUrl.hostname, { all: true });
if (addresses.length === 0) throw new Error(`DNS returned no addresses for ${baseUrl.hostname}`);

const certificate = await new Promise<{
  authorizationError: string | null;
  authorized: boolean;
  fingerprint256: string;
  issuer: string;
  subject: string;
  subjectAlternativeName: string;
  validTo: string;
}>((resolve, reject) => {
  const socket = connect({
    host: baseUrl.hostname,
    port: Number.parseInt(baseUrl.port || '443', 10),
    servername: baseUrl.hostname,
    rejectUnauthorized: true,
    timeout: 5_000,
  });
  socket.once('secureConnect', () => {
    const peer = socket.getPeerCertificate();
    resolve({
      authorizationError: socket.authorizationError?.message ?? null,
      authorized: socket.authorized,
      fingerprint256: peer.fingerprint256 ?? '',
      issuer: peer.issuer?.CN ?? 'unknown',
      subject: peer.subject?.CN ?? 'unknown',
      subjectAlternativeName: peer.subjectaltname ?? '',
      validTo: peer.valid_to,
    });
    socket.end();
  });
  socket.once('timeout', () => {
    socket.destroy(new Error('TLS handshake timed out'));
  });
  socket.once('error', reject);
});

const certificateValidTo = Date.parse(certificate.validTo);
if (!certificate.authorized || !Number.isFinite(certificateValidTo)) {
  throw new Error('Public certificate is not trusted or has an invalid expiration date');
}
const remainingCertificateDays = Math.floor(
  (certificateValidTo - Date.now()) / (24 * 60 * 60 * 1_000),
);
if (remainingCertificateDays < minimumCertificateDays) {
  throw new Error(
    `Public certificate expires in ${String(remainingCertificateDays)} days; at least ${String(minimumCertificateDays)} required`,
  );
}

const routes = ['/health', '/api/health/ready', '/api/auth/get-session', '/llm/health'] as const;
const routeResults = await Promise.all(
  routes.map(async (path) => {
    const response = await fetch(new URL(path, baseUrl), {
      redirect: 'error',
      signal: AbortSignal.timeout(7_000),
    });
    await response.arrayBuffer();
    return {
      path,
      status: response.status,
      ok: response.ok,
      strictTransportSecurity: response.headers.get('strict-transport-security'),
    };
  }),
);

const passed =
  routeResults.every(({ ok, strictTransportSecurity }) => ok && strictTransportSecurity !== null) &&
  certificate.authorized;
const report = {
  schemaVersion: 1,
  phase: '12',
  baseUrl: baseUrl.origin,
  dns: addresses.map(({ address, family }) => ({ address, family })),
  certificate: {
    ...certificate,
    remainingDays: remainingCertificateDays,
    minimumDays: minimumCertificateDays,
  },
  routes: routeResults,
  passed,
  capturedAt: new Date().toISOString(),
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = process.env.PHASE12_EVIDENCE_FILE;
if (outputPath) writeFileSync(outputPath, serialized, { mode: 0o600 });
process.stdout.write(serialized);
if (!passed) process.exitCode = 1;
