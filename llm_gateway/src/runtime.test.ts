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
    dockerModelRunnerModel: 'ai/gemma3-qat:1B-Q4_K_M',
    dockerModelRunnerEngine: 'llama.cpp',
    dockerModelRunnerTemperature: 0.1,
    dockerModelRunnerMaxTokens: 64,
    openAiCompatibleUrl: 'https://provider.example.invalid/v1',
    openAiCompatibleModel: 'municipal-classifier',
    openAiCompatibleApiKeyFile: providerApiKeyFile,
    openAiCompatibleTemperature: 0.1,
    openAiCompatibleMaxTokens: 64,
  };
}

test('accepts strict JSON from Docker Model Runner OpenAI-compatible API', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      choices: [{ message: { content: '{"classification":"emergency","confidence":0.95}' } }],
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const environment = dockerEnvironment('http://model-runner:12434');

  await expect(new DockerModelRunnerRuntime(environment).classify(request)).resolves.toEqual({
    classification: 'emergency',
    serviceKey: null,
    confidence: 0.95,
    modelAvailable: true,
    source: 'model',
    reason: null,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://model-runner:12434/engines/llama.cpp/v1/chat/completions',
    expect.objectContaining({ body: expect.any(String) }),
  );
  const init = fetchMock.mock.calls[0]?.[1];
  const body: unknown = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: 'ai/gemma3-qat:1B-Q4_K_M',
    temperature: 0.1,
    max_tokens: 64,
    stream: false,
    response_format: { type: 'json_object' },
  });
});

test('uses the Compose-injected OpenAI base URL and accepts a canonical Docker model id', async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      object: 'list',
      data: [{ id: 'docker.io/ai/gemma3-qat:1B-Q4_K_M', object: 'model' }],
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

test('rejects prose or malformed model output instead of guessing', async () => {
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

test('accepts a JSON-only markdown fence emitted by Gemma', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: '```json\n{\n  "classification": "municipal",\n  "confidence": 0.95\n}\n```',
            },
          },
        ],
      }),
    ),
  );
  const environment = dockerEnvironment('http://model-runner:12434/v1/');

  await expect(new DockerModelRunnerRuntime(environment).classify(request)).resolves.toMatchObject({
    classification: 'municipal',
    confidence: 0.95,
    source: 'model',
  });
});

test('authenticates to an external OpenAI-compatible provider using a mounted secret', async () => {
  const fetchMock = vi.fn(async () =>
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
});
