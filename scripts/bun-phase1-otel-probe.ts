import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';

// Compare: bun scripts/bun-phase1-otel-probe.ts; node scripts/bun-phase1-otel-probe.ts
const root = process.cwd();
if (process.argv.includes('--child')) {
  const register = await import(
    pathToFileURL(resolve(root, 'packages/observability/dist/register.js')).href
  );
  const api = await import(
    pathToFileURL(resolve(root, 'packages/observability/dist/index.js')).href
  );
  const incomingTraceId = '11111111111111111111111111111111';
  const serverResponse = await api.withHttpServerSpan(
    new Request('http://probe.invalid/work', {
      headers: { traceparent: `00-${incomingTraceId}-2222222222222222-01` },
    }),
    async () => {
      await Promise.resolve();
      assert.equal(api.activeTraceIdentifiers().traceId, incomingTraceId);
      return new Response('unavailable', { status: 503 });
    },
  );
  assert.equal(serverResponse.status, 503);
  const require = createRequire(import.meta.url);
  const http = require('node:http');
  await api.withSpan(
    'bun-phase1-manual',
    {},
    () =>
      new Promise<void>((done, fail) => {
        http
          .get(process.env.PROBE_ENDPOINT + '/work', (response: any) => {
            response.resume();
            response.on('end', done);
          })
          .on('error', fail);
      }),
  );
  api.addCounter('bun_phase1_counter');
  api.emitTelemetryLog({ body: 'bun-phase1-log', severity: 'info' });
  if (process.argv.includes('--sigterm')) {
    const keepAlive = setInterval(() => {}, 1000);
    const signal = once(process, 'SIGTERM');
    process.stdout.write('ready-for-sigterm\n');
    await signal;
    clearInterval(keepAlive);
  }
  await register.shutdownObservability();
} else {
  const payloads: Record<string, Buffer[]> = {};
  let traceparent: string | undefined;
  const server = createServer((request, response) => {
    if (request.url === '/work') {
      traceparent = request.headers.traceparent as string | undefined;
      response.end('ok');
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (data) => chunks.push(data));
    request.on('end', () => {
      (payloads[request.url ?? ''] ??= []).push(Buffer.concat(chunks));
      response.writeHead(200, { 'content-type': 'application/x-protobuf' });
      response.end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const child = spawn(
      process.execPath,
      [process.argv[1], '--child', ...(process.argv.includes('--sigterm') ? ['--sigterm'] : [])],
      {
        env: {
          ...process.env,
          OBSERVABILITY_MODE: 'local',
          OTEL_SERVICE_NAME: 'bun-phase1',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:' + address.port,
          PROBE_ENDPOINT: 'http://127.0.0.1:' + address.port,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    let signalled = false;
    child.stdout.on('data', (data) => {
      output += data;
      if (!signalled && output.includes('ready-for-sigterm')) {
        signalled = true;
        child.kill('SIGTERM');
      }
    });
    child.stderr.on('data', (data) => (output += data));
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    const [code] = await once(child, 'exit');
    clearTimeout(timer);
    const has = (path: string, marker: string) =>
      (payloads[path] ?? []).some((b) => b.includes(marker));
    const result = {
      runtime: process.versions.bun ?? process.version,
      code,
      traces: has('/v1/traces', 'bun-phase1-manual'),
      metrics: has('/v1/metrics', 'bun_phase1_counter'),
      logs: has('/v1/logs', 'bun-phase1-log'),
      autoHttpPropagation: Boolean(traceparent),
      sigterm: signalled,
      output,
    };
    console.log(JSON.stringify(result));
    assert.equal(code, 0);
    assert.ok(result.traces && result.metrics && result.logs && result.autoHttpPropagation);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
}
