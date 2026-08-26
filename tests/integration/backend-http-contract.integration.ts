import assert from 'node:assert/strict';
import { BACKEND_HTTP_CONTRACT } from '../../backend/contracts/http-contract.ts';
import { StructuredApiErrorResponseSchema } from '../../packages/contracts/src/platform.ts';

const baseUrl = process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:11335';
const runtime = process.env.INTEGRATION_BACKEND_RUNTIME ?? 'nest';
const publicApiPrefix = process.env.INTEGRATION_PUBLIC_API_PREFIX ?? '/api';

function openApiPath(internalPath: string): string {
  return internalPath.replace(':id', '{id}');
}

async function run(): Promise<void> {
  assert.equal(BACKEND_HTTP_CONTRACT.length, 22, 'post-cutover backend route inventory');

  const contract = BACKEND_HTTP_CONTRACT;
  for (const entry of contract) {
    const headers = new Headers({ Origin: baseUrl.replace('127.0.0.1', 'localhost') });
    const init: RequestInit = { method: entry.method, headers };
    if (entry.anonymousProbe.body !== null) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(entry.anonymousProbe.body);
    }

    const path = publicApiPrefix === '/api' ? entry.anonymousProbe.path : entry.internalPath;
    // These probes intentionally run in sequence to produce a deterministic route-by-route report.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetch(`${baseUrl}${path}`, init);
    assert.equal(
      response.status,
      entry.anonymousProbe.expectedStatus,
      `${entry.method} ${entry.publicPath} anonymous contract`,
    );
    if (runtime === 'nest' && response.status >= 400) {
      // The body belongs to the sequential route probe above.
      // oxlint-disable-next-line no-await-in-loop
      const error: unknown = await response.json();
      StructuredApiErrorResponseSchema.parse(error);
    }
  }

  if (runtime === 'nest') {
    const openApiResponse = await fetch(`${baseUrl}${publicApiPrefix}/openapi.json`);
    assert.equal(openApiResponse.status, 200, 'NestJS OpenAPI JSON endpoint');
    const document = (await openApiResponse.json()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    assert.match(document.openapi, /^3\./);
    const operations = contract.reduce(
      (count, entry) =>
        count +
        (document.paths[openApiPath(entry.internalPath)]?.[entry.method.toLowerCase()] ? 1 : 0),
      0,
    );
    assert.equal(operations, contract.length, 'OpenAPI contains every preserved operation');
  }

  console.log(
    `[integration] PASS: ${contract.length} backend HTTP routes match the Phase 6 baseline on ${runtime}`,
  );
}

run().catch((error: unknown) => {
  console.error('[integration] FAIL: backend HTTP route baseline');
  console.error(error);
  process.exitCode = 1;
});
