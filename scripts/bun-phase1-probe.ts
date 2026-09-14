import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

// Run from the repository root with Bun. No production secrets or services are used.
const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), 'zglosto-bun-runtime-'));
const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);
function openssl(...args: string[]) {
  const result = spawnSync('openssl', args, { cwd: scratch, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
function certificate(name: string, san: string, ca = 'ca', days = '1') {
  openssl(
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    name + '.key',
    '-out',
    name + '.csr',
    '-subj',
    '/CN=' + name,
  );
  writeFileSync(join(scratch, name + '.ext'), 'subjectAltName=' + san + '\n');
  if (days === '-1') {
    writeFileSync(join(scratch, 'index.txt'), '');
    writeFileSync(join(scratch, 'serial'), '0100\n');
    writeFileSync(
      join(scratch, 'ca.conf'),
      `[ca]\ndefault_ca=fixture\n[fixture]\ndatabase=index.txt\nserial=serial\nnew_certs_dir=.\ncertificate=${ca}.crt\nprivate_key=${ca}.key\ndefault_md=sha256\npolicy=policy\n[policy]\ncommonName=supplied\n`,
    );
    openssl(
      'ca',
      '-batch',
      '-config',
      'ca.conf',
      '-in',
      name + '.csr',
      '-out',
      name + '.crt',
      '-startdate',
      '200101000000Z',
      '-enddate',
      '200102000000Z',
      '-notext',
      '-extfile',
      name + '.ext',
    );
    return;
  }
  openssl(
    'x509',
    '-req',
    '-in',
    name + '.csr',
    '-CA',
    ca + '.crt',
    '-CAkey',
    ca + '.key',
    '-CAcreateserial',
    '-out',
    name + '.crt',
    '-days',
    days,
    '-extfile',
    name + '.ext',
  );
}
const file = (name: string) => join(scratch, name);
const identity = (name: string) => 'spiffe://zglosto.local/workload/' + name;
async function checkServer(kind: 'authorization' | 'gateway') {
  const shared = {
    port: 0,
    backendIdentity: identity('backend'),
    nginxIdentity: identity('nginx'),
    healthcheckIdentity: identity('healthcheck'),
    kedaIdentity: identity('keda'),
  };
  const app = () => new Response('ok');
  const server =
    kind === 'authorization'
      ? (await load('authorization/src/mtls-server.ts')).startMtlsAuthorizationServer(app, {
          ...shared,
          caPath: file('ca.crt'),
          certificatePath: file('server.crt'),
          privateKeyPath: file('server.key'),
        })
      : (await load('llm_gateway/src/mtls-server.ts')).startMtlsGatewayServer(app, {
          ...shared,
          tlsCaPath: file('ca.crt'),
          tlsCertificatePath: file('server.crt'),
          tlsPrivateKeyPath: file('server.key'),
        });
  try {
    if (process.argv.includes('--diagnostic'))
      server.prependListener('request', (incoming: any) => {
        const socket = incoming.socket;
        const raw = socket.getPeerCertificate?.()?.raw;
        console.log(
          JSON.stringify({
            probe: 'mtls-socket-diagnostic',
            instance: socket instanceof TLSSocket,
            authorized: socket.authorized,
            raw: Boolean(raw),
            san: raw ? new X509Certificate(raw).subjectAltName : null,
          }),
        );
      });
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const call = (
      client: string | null,
      path: string,
      protocol: 'TLSv1.3' | 'TLSv1.2' = 'TLSv1.3',
    ): Promise<number> =>
      new Promise((done, fail) => {
        const req = request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path,
            ca: readFileSync(file('ca.crt')),
            minVersion: protocol,
            maxVersion: protocol,
            agent: false,
            ...(client
              ? {
                  cert: readFileSync(file(client + '.crt')),
                  key: readFileSync(file(client + '.key')),
                }
              : {}),
          },
          (response) => {
            response.resume();
            response.on('end', () => done(response.statusCode ?? 0));
          },
        );
        req.setTimeout(3000, () => req.destroy(new Error('timeout')));
        req.on('error', fail);
        req.end();
      });
    const allowed = kind === 'authorization' ? '/api/verify-session' : '/classify-incident';
    assert.equal(await call('backend', allowed), 200);
    assert.equal(await call('backend', '/forbidden'), 403);
    assert.equal(await call('wrong', allowed), 403);
    assert.equal(await call('multiple', allowed), 403);
    assert.equal(await call('no-uri', allowed), 403);
    assert.equal(await call('healthcheck', '/health/ready'), 200);
    assert.equal(await call('healthcheck', allowed), 403);
    assert.equal(
      await call('nginx', kind === 'authorization' ? '/api/auth/session' : '/health'),
      200,
    );
    assert.equal(await call('nginx', allowed), 403);
    await assert.rejects(call(null, allowed));
    await assert.rejects(call('foreign', allowed));
    await assert.rejects(call('expired', allowed));
    await assert.rejects(call('backend', allowed, 'TLSv1.2'));
    console.log(JSON.stringify({ probe: kind + '-mtls', status: 'PASS', cases: 13 }));
  } finally {
    if (server.listening) {
      await new Promise<void>((done, fail) =>
        server.close((error?: Error) => (error ? fail(error) : done())),
      );
    }
  }
}
try {
  console.log(
    JSON.stringify({ runtime: process.versions, platform: process.platform, arch: process.arch }),
  );
  for (const ca of ['ca', 'foreign-ca']) {
    openssl(
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      ca + '.key',
      '-out',
      ca + '.crt',
      '-days',
      '1',
      '-subj',
      '/CN=' + ca,
    );
  }
  certificate('server', 'IP:127.0.0.1');
  certificate('backend', 'URI:' + identity('backend'));
  certificate('wrong', 'URI:' + identity('wrong'));
  certificate('multiple', 'URI:' + identity('backend') + ',URI:' + identity('nginx'));
  certificate('foreign', 'URI:' + identity('backend'), 'foreign-ca');
  certificate('expired', 'URI:' + identity('backend'), 'ca', '-1');
  certificate('no-uri', 'DNS:client.local');
  certificate('healthcheck', 'URI:' + identity('healthcheck'));
  certificate('nginx', 'URI:' + identity('nginx'));
  const failures: string[] = [];
  for (const kind of ['authorization', 'gateway'] as const) {
    try {
      // Each server uses the same certificate fixtures; keep diagnostics in service order.
      // eslint-disable-next-line no-await-in-loop
      await checkServer(kind);
    } catch (error) {
      failures.push(kind);
      console.error(
        JSON.stringify({ probe: kind + '-mtls', status: 'FAIL', error: String(error) }),
      );
    }
  }
  if (process.argv.includes('--mtls-only')) {
    assert.equal(failures.length, 0, failures.join(', '));
  } else {
    const requireBackend = createRequire(resolve(root, 'backend/package.json'));
    const sharp = requireBackend('sharp');
    const { SharpImageProcessor } = await load(
      'backend/nest/media-worker/sharp-image.processor.ts',
    );
    const body = await sharp({
      create: { width: 2, height: 1, channels: 4, background: { r: 220, g: 120, b: 20, alpha: 1 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const source = {
      body,
      checksumSha256,
      contentType: 'image/jpeg',
      objectKey: 'probe/original.jpg',
      sizeBytes: body.length,
    };
    const expected = {
      checksumSha256,
      mimeType: source.contentType,
      objectKey: source.objectKey,
      sizeBytes: body.length,
    };
    const result = await new SharpImageProcessor().process(source, expected, 'probe/result.webp');
    assert.equal(result.width, 1);
    assert.equal(result.height, 2);
    const metadata = await sharp(result.body).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    assert.equal(
      result.metadata.checksumSha256,
      createHash('sha256').update(result.body).digest('hex'),
    );
    console.log(
      JSON.stringify({
        probe: 'sharp-real-processor',
        status: 'PASS',
        sharp: sharp.versions.sharp,
      }),
    );
    const store = new AsyncLocalStorage<number>();
    await Promise.all(
      Array.from({ length: 100 }, (_, n) =>
        store.run(n, async () => {
          await new Promise((done) => setTimeout(done, n % 5));
          assert.equal(store.getStore(), n);
        }),
      ),
    );
    console.log(JSON.stringify({ probe: 'async-local-storage', status: 'PASS', contexts: 100 }));
    assert.equal(failures.length, 0, failures.join(', '));
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
