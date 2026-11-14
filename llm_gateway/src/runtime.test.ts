import { afterEach, expect, test, vi } from 'vitest';
import type { LlmGatewayEnvironment } from './environment.ts';
import { DockerModelRunnerRuntime, OpenAiCompatibleRuntime } from './runtime.ts';

afterEach(() => vi.unstubAllGlobals());

const request = { description: 'Dziura w drodze', address: null, city: 'Warszawa' } as const;
const providerApiKeyFile = new URL('../../tests/fixtures/llm/api-key', import.meta.url).pathname;

function dockerEnvironment(url: string): LlmGatewayEnvironment {
  return {
    port: 8130,
    tlsCaPath: '/tmp/ca.crt',
    tlsCertificatePath: '/tmp/server.crt',
    tlsPrivateKeyPath: '/tmp/server.key',
    backendIdentity: 'spiffe://zglosto.local/workload/backend',
    kedaIdentity: 'spiffe://zglosto.local/workload/keda-http-interceptor',
    nginxIdentity: 'spiffe://zglosto.local/workload/nginx',
    healthcheckIdentity: 'spiffe://zglosto.local/workload/llm-gateway-healthcheck',
    hmacKeyFile: '/tmp/hmac-key',
    hmacKeyId: 'backend-v1',
    authClockSkewSeconds: 30,
    authReplayMaxEntries: 100,
    maxBodyBytes: 32768,
    maxConcurrentClassifications: 4,
    runtime: 'docker-model-runner',
    upstreamTimeoutMs: 100,
    dockerModelRunnerUrl: url,
    dockerModelRunnerModel: 'zglosto/basal-2.0-mini:q5_k_m',
    dockerModelRunnerEngine: 'llama.cpp',
    openAiCompatibleUrl: 'https://provider.example.invalid/v1',
    openAiCompatibleModel: 'municipal-classifier',
    openAiCompatibleApiKeyFile: providerApiKeyFile,
    openAiCompatibleTemperature: 0.1,
    openAiCompatibleMaxTokens: 64,
  };
}

test('reads Basal option logprobs from Docker Model Runner raw completions', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      choices: [{ text: 'A', logprobs: { top_logprobs: [{ A: -3, B: -1 }] } }],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const environment = dockerEnvironment('http://model-runner:12434');

  await expect(new DockerModelRunnerRuntime(environment).classify(request)).resolves.toMatchObject({
    classification: 'emergency',
    serviceKey: null,
    confidence: null,
    modelAvailable: true,
    source: 'model',
    reason: null,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://model-runner:12434/engines/llama.cpp/v1/completions',
    expect.objectContaining({ body: expect.any(String) }),
  );
  const init = fetchMock.mock.calls[0]?.[1];
  const body: unknown = JSON.parse(String(init?.body));
  expect(body).toEqual({
    model: environment.dockerModelRunnerModel,
    temperature: 1,
    top_k: 0,
    top_p: 1,
    min_p: 0,
    max_tokens: 1,
    stream: false,
    logprobs: 100,
    prompt: expect.stringMatching(/^<\|im_start\|>system\n/),
  });
});

test('uses the Compose-injected OpenAI base URL and accepts a canonical Docker model id', async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      object: 'list',
      data: [{ id: 'docker.io/zglosto/basal-2.0-mini:q5_k_m', object: 'model' }],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const environment = dockerEnvironment('http://model-runner:12434/v1/');

  await expect(new DockerModelRunnerRuntime(environment).health()).resolves.toMatchObject({
    enabled: true,
    loaded: true,
    error: null,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://model-runner:12434/v1/models',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

test('rejects generated text without option logits instead of guessing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ choices: [{ message: { content: 'probably municipal' } }] })),
  );
  const environment = dockerEnvironment('http://model-runner:12434');

  await expect(new DockerModelRunnerRuntime(environment).classify(request)).resolves.toMatchObject({
    classification: 'unknown',
    source: 'fallback',
    reason: 'invalid_response',
  });
});

test('uses an injected v1 URL and supports the DMR chat-style logprobs layout', async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      choices: [
        {
          logprobs: {
            content: [
              {
                top_logprobs: [
                  { token: 'A', logprob: -1 },
                  { token: 'B', logprob: -3 },
                ],
              },
            ],
          },
        },
      ],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const environment = dockerEnvironment('http://model-runner:12434/v1/');

  await expect(new DockerModelRunnerRuntime(environment).classify(request)).resolves.toMatchObject({
    classification: 'municipal',
    confidence: null,
    source: 'model',
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://model-runner:12434/v1/completions',
    expect.objectContaining({ redirect: 'error' }),
  );
});

test('authenticates to an external OpenAI-compatible provider using a mounted secret', async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      choices: [{ message: { content: '{"classification":"municipal","confidence":0.91}' } }],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const environment: LlmGatewayEnvironment = {
    ...dockerEnvironment('http://model-runner:12434'),
    runtime: 'openai-compatible',
  };

  await expect(new OpenAiCompatibleRuntime(environment).classify(request)).resolves.toMatchObject({
    classification: 'municipal',
    confidence: 0.91,
    source: 'model',
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://provider.example.invalid/v1/chat/completions',
    expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer test-provider-key',
      }),
    }),
  );
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(body).toMatchObject({
    model: environment.openAiCompatibleModel,
    temperature: environment.openAiCompatibleTemperature,
    max_tokens: environment.openAiCompatibleMaxTokens,
    stream: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: expect.stringContaining('classification oraz confidence') },
      { role: 'user', content: request.description },
    ],
  });
  expect(body).not.toHaveProperty('prompt');
  expect(body).not.toHaveProperty('logprobs');
});

test('keeps the upstream deadline active while consuming the response body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init: RequestInit) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Timed out', 'AbortError')),
          );
        }),
    })),
  );
  const environment = dockerEnvironment('http://model-runner:12434');
  environment.upstreamTimeoutMs = 10;
  await expect(new DockerModelRunnerRuntime(environment).classify(request)).resolves.toMatchObject({
    classification: 'unknown',
    source: 'fallback',
    reason: 'timeout',
  });
});

test('disallows redirects and sends no address or city to the external provider', async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      choices: [{ message: { content: '{"classification":"municipal","confidence":0.9}' } }],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await new OpenAiCompatibleRuntime({
    ...dockerEnvironment('http://model-runner:12434'),
    runtime: 'openai-compatible',
  }).classify({ ...request, address: 'Private address', city: 'Private city' });
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  expect(init?.redirect).toBe('error');
  expect(String(init?.body)).not.toContain('Private address');
  expect(String(init?.body)).not.toContain('Private city');
});

test('sends only description to local Basal and preserves a prefixed v1 endpoint', async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ choices: [{ logprobs: { top_logprobs: [{ A: -1, B: -3 }] } }] }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await new DockerModelRunnerRuntime(
    dockerEnvironment('http://model-runner:12434/local/v1///'),
  ).classify({ ...request, address: 'Private address', city: 'Private city' });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://model-runner:12434/local/v1/completions',
    expect.objectContaining({ redirect: 'error' }),
  );
  const init = fetchMock.mock.calls[0]?.[1];
  expect(String(init?.body)).toContain(request.description);
  expect(String(init?.body)).not.toContain('Private address');
  expect(String(init?.body)).not.toContain('Private city');
});

test.each([
  { choices: [{ logprobs: { top_logprobs: [{ A: -1 }] } }] },
  { choices: [{ logprobs: { top_logprobs: [{ A: -1, B: null }] } }] },
  { choices: [{ message: { content: '{"classification":"municipal","confidence":0.99}' } }] },
])('returns invalid_response for unusable Basal logits: %j', async (payload) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(payload)),
  );
  await expect(
    new DockerModelRunnerRuntime(dockerEnvironment('http://model-runner:12434')).classify(request),
  ).resolves.toMatchObject({
    classification: 'unknown',
    modelAvailable: false,
    confidence: null,
    reason: 'invalid_response',
  });
});

test('returns invalid_response for a non-JSON provider response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('broken json')),
  );
  await expect(
    new DockerModelRunnerRuntime(dockerEnvironment('http://model-runner:12434')).classify(request),
  ).resolves.toMatchObject({ reason: 'invalid_response' });
});

test('reports a missing configured model without considering another model healthy', async () => {
  const fetchMock = vi.fn(async () => Response.json({ data: [{ id: 'ai/other-model' }] }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    new DockerModelRunnerRuntime(dockerEnvironment('http://model-runner:12434')).health(),
  ).resolves.toMatchObject({ enabled: true, loaded: false, error: 'model_unavailable' });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://model-runner:12434/engines/llama.cpp/v1/models',
    expect.objectContaining({ redirect: 'error' }),
  );
});

test('maps provider network failures to unavailable classification and health', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Network unavailable');
    }),
  );
  const runtime = new DockerModelRunnerRuntime(dockerEnvironment('http://model-runner:12434'));
  await expect(runtime.classify(request)).resolves.toMatchObject({ reason: 'unavailable' });
  await expect(runtime.health()).resolves.toMatchObject({
    enabled: false,
    loaded: false,
    error: 'model_unavailable',
  });
});

test('continues accepting JSON markdown fences from an external provider', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: '```json\n{"classification":"municipal","confidence":0.95}\n```',
            },
          },
        ],
      }),
    ),
  );
  await expect(
    new OpenAiCompatibleRuntime({
      ...dockerEnvironment('http://model-runner:12434'),
      runtime: 'openai-compatible',
    }).classify(request),
  ).resolves.toMatchObject({ classification: 'municipal', confidence: 0.95 });
});
