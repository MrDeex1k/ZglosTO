import { expect, test } from 'vitest';
import {
  LLM_CLASSIFICATION_CONTENT_TYPE,
  LLM_CLASSIFICATION_HTTP_METHOD,
  LLM_CLASSIFICATION_LEGACY_HTTP_METHOD,
  LLM_CLASSIFICATION_PATH,
} from '@zglosto/contracts';
import { createWorkloadAuthHeaders, WorkloadReplayCache } from '@zglosto/workload-auth';
import { createApp } from './app.ts';
import { DisabledRuntime, type ModelRuntime } from './runtime.ts';

const hmacKey = Buffer.alloc(32, 3);

function protection() {
  return {
    authClockSkewSeconds: 30,
    hmacKey,
    hmacKeyId: 'backend-v1',
    maxBodyBytes: 32_768,
    maxConcurrentClassifications: 4,
    replayCache: new WorkloadReplayCache(100),
  };
}

function authenticatedRequest(
  body: string,
  method:
    | typeof LLM_CLASSIFICATION_HTTP_METHOD
    | typeof LLM_CLASSIFICATION_LEGACY_HTTP_METHOD = LLM_CLASSIFICATION_HTTP_METHOD,
): RequestInit {
  const bytes = Buffer.from(body);
  return {
    method,
    headers: {
      'content-type': LLM_CLASSIFICATION_CONTENT_TYPE,
      ...createWorkloadAuthHeaders(
        {
          body: bytes,
          keyId: 'backend-v1',
          method,
          path: LLM_CLASSIFICATION_PATH,
        },
        hmacKey,
      ),
    },
    body,
  };
}

test('returns a stable fallback while the runtime is disabled', async () => {
  const body = JSON.stringify({
    description: 'Dziura w drodze',
    address: null,
    city: 'Warszawa',
  });
  const response = await createApp(new DisabledRuntime(), protection()).request(
    LLM_CLASSIFICATION_PATH,
    authenticatedRequest(body),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('accept-query')).toBe(LLM_CLASSIFICATION_CONTENT_TYPE);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    classification: 'unknown',
    serviceKey: null,
    confidence: null,
    reason: 'disabled',
    modelAvailable: false,
    source: 'fallback',
  });
});

test('rejects unauthenticated and replayed classification requests', async () => {
  const app = createApp(new DisabledRuntime(), protection());
  const body = JSON.stringify({ description: 'test', address: null, city: null });
  const unauthenticated = await app.request(LLM_CLASSIFICATION_PATH, {
    method: LLM_CLASSIFICATION_HTTP_METHOD,
    headers: { 'content-type': LLM_CLASSIFICATION_CONTENT_TYPE },
    body,
  });
  expect(unauthenticated.status).toBe(401);

  const signed = authenticatedRequest(body);
  expect((await app.request(LLM_CLASSIFICATION_PATH, signed)).status).toBe(200);
  expect((await app.request(LLM_CLASSIFICATION_PATH, signed)).status).toBe(401);
});

test('temporarily accepts the legacy POST classification contract', async () => {
  const body = JSON.stringify({ description: 'test', address: null, city: null });
  const response = await createApp(new DisabledRuntime(), protection()).request(
    LLM_CLASSIFICATION_PATH,
    authenticatedRequest(body, LLM_CLASSIFICATION_LEGACY_HTTP_METHOD),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('accept-query')).toBe(LLM_CLASSIFICATION_CONTENT_TYPE);
});

test('requires application/json for classification query content', async () => {
  const app = createApp(new DisabledRuntime(), protection());
  const body = JSON.stringify({ description: 'test', address: null, city: null });
  const missingContentType = authenticatedRequest(body);
  const missingHeaders = new Headers(missingContentType.headers);
  missingHeaders.delete('content-type');
  missingContentType.headers = missingHeaders;

  const missing = await app.request(LLM_CLASSIFICATION_PATH, missingContentType);
  expect(missing.status).toBe(415);
  expect(missing.headers.get('accept-query')).toBe(LLM_CLASSIFICATION_CONTENT_TYPE);

  const inconsistentContentType = authenticatedRequest(body);
  const inconsistentHeaders = new Headers(inconsistentContentType.headers);
  inconsistentHeaders.set('content-type', 'text/plain');
  inconsistentContentType.headers = inconsistentHeaders;
  expect((await app.request(LLM_CLASSIFICATION_PATH, inconsistentContentType)).status).toBe(415);
});

test('rejects oversized bodies before classification', async () => {
  const limited = protection();
  limited.maxBodyBytes = 8;
  const response = await createApp(new DisabledRuntime(), limited).request(
    LLM_CLASSIFICATION_PATH,
    authenticatedRequest('{"description":"too large"}'),
  );
  expect(response.status).toBe(413);
});

test('limits concurrent classifications per replica', async () => {
  let release = (): void => {
    throw new Error('Classification was not started');
  };
  let started = (): void => {
    throw new Error('Start observer was not initialized');
  };
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runtime: ModelRuntime = {
    name: 'concurrency-test',
    classify: async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        classification: 'unknown',
        serviceKey: null,
        confidence: null,
        reason: 'disabled',
        modelAvailable: false,
        source: 'fallback',
      };
    },
    health: async () => ({
      status: 'ok',
      service: 'llm_gateway',
      model: 'disabled',
      enabled: false,
      loaded: false,
      error: 'model_disabled',
    }),
  };
  const limited = protection();
  limited.maxConcurrentClassifications = 1;
  const app = createApp(runtime, limited);
  const body = JSON.stringify({ description: 'test', address: null, city: null });
  const first = app.request(LLM_CLASSIFICATION_PATH, authenticatedRequest(body));
  await startedPromise;
  const second = await app.request(LLM_CLASSIFICATION_PATH, authenticatedRequest(body));
  expect(second.status).toBe(429);
  release();
  expect((await first).status).toBe(200);
});

test('does not expose incident content in gateway logs', async () => {
  const events: string[] = [];
  const original = console.info;
  console.info = (message: unknown): void => {
    events.push(String(message));
  };
  const runtime: ModelRuntime = {
    name: 'test',
    classify: async () => ({
      classification: 'municipal',
      serviceKey: null,
      confidence: 0.9,
      reason: null,
      modelAvailable: true,
      source: 'model',
    }),
    health: async () => ({
      status: 'ok',
      service: 'llm_gateway',
      model: 'test',
      enabled: true,
      loaded: true,
      error: null,
    }),
  };
  try {
    const body = JSON.stringify({ description: 'sekretna treść', address: null, city: null });
    await createApp(runtime, protection()).request(
      LLM_CLASSIFICATION_PATH,
      authenticatedRequest(body),
    );
  } finally {
    console.info = original;
  }
  expect(events.join('\n')).not.toContain('sekretna treść');
});
