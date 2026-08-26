import { afterEach, expect, test } from 'vitest';
import { validateEnvironment } from './environment.ts';

const variableNames = [
  'LLM_GATEWAY_PORT',
  'LLM_GATEWAY_TLS_CA_PATH',
  'LLM_GATEWAY_TLS_CERT_PATH',
  'LLM_GATEWAY_TLS_KEY_PATH',
  'LLM_GATEWAY_BACKEND_IDENTITY',
  'LLM_GATEWAY_KEDA_IDENTITY',
  'LLM_GATEWAY_NGINX_IDENTITY',
  'LLM_GATEWAY_HEALTHCHECK_IDENTITY',
  'LLM_GATEWAY_HMAC_KEY_FILE',
  'LLM_GATEWAY_HMAC_KEY_ID',
  'LLM_GATEWAY_AUTH_CLOCK_SKEW_SECONDS',
  'LLM_GATEWAY_AUTH_REPLAY_MAX_ENTRIES',
  'LLM_GATEWAY_MAX_BODY_BYTES',
  'LLM_GATEWAY_MAX_CONCURRENT_CLASSIFICATIONS',
  'LLM_RUNTIME',
  'LLM_UPSTREAM_TIMEOUT_MS',
  'DOCKER_MODEL_RUNNER_URL',
  'DOCKER_MODEL_RUNNER_MODEL',
  'DOCKER_MODEL_RUNNER_ENGINE',
  'DOCKER_MODEL_RUNNER_TEMPERATURE',
  'DOCKER_MODEL_RUNNER_MAX_TOKENS',
  'OPENAI_COMPATIBLE_URL',
  'OPENAI_COMPATIBLE_MODEL',
  'OPENAI_COMPATIBLE_API_KEY_FILE',
  'OPENAI_COMPATIBLE_TEMPERATURE',
  'OPENAI_COMPATIBLE_MAX_TOKENS',
] as const;

const originalEnvironment = Object.fromEntries(
  variableNames.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of variableNames) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('uses the disabled-by-default Phase 7 configuration', () => {
  for (const name of variableNames) delete process.env[name];

  expect(validateEnvironment()).toEqual({
    port: 8130,
    tlsCaPath: '/run/secrets/service/ca.crt',
    tlsCertificatePath: '/run/secrets/service/llm-gateway-server.crt',
    tlsPrivateKeyPath: '/run/secrets/service/llm-gateway-server.key',
    backendIdentity: 'spiffe://zglosto.local/workload/backend',
    kedaIdentity: 'spiffe://zglosto.local/workload/keda-http-interceptor',
    nginxIdentity: 'spiffe://zglosto.local/workload/nginx',
    healthcheckIdentity: 'spiffe://zglosto.local/workload/llm-gateway-healthcheck',
    hmacKeyFile: '/run/secrets/llm-auth/hmac-key',
    hmacKeyId: 'backend-v1',
    authClockSkewSeconds: 30,
    authReplayMaxEntries: 10000,
    maxBodyBytes: 32768,
    maxConcurrentClassifications: 4,
    runtime: 'disabled',
    upstreamTimeoutMs: 5000,
    dockerModelRunnerUrl: 'http://model-runner.docker.internal:12434',
    dockerModelRunnerModel: 'ai/gemma3-qat:1B-Q4_K_M',
    dockerModelRunnerEngine: 'llama.cpp',
    dockerModelRunnerTemperature: 0.1,
    dockerModelRunnerMaxTokens: 64,
    openAiCompatibleUrl: 'https://llm.example.invalid/v1',
    openAiCompatibleModel: 'disabled',
    openAiCompatibleApiKeyFile: '/run/secrets/llm/api-key',
    openAiCompatibleTemperature: 0.1,
    openAiCompatibleMaxTokens: 64,
  });
});

test('accepts the external OpenAI-compatible runtime without exposing its API key', () => {
  process.env.LLM_RUNTIME = 'openai-compatible';
  process.env.OPENAI_COMPATIBLE_URL = 'https://provider.example.invalid/v1';
  process.env.OPENAI_COMPATIBLE_MODEL = 'municipal-classifier';
  process.env.OPENAI_COMPATIBLE_API_KEY_FILE = '/run/secrets/llm/api-key';

  expect(validateEnvironment()).toMatchObject({
    runtime: 'openai-compatible',
    openAiCompatibleUrl: 'https://provider.example.invalid/v1',
    openAiCompatibleModel: 'municipal-classifier',
    openAiCompatibleApiKeyFile: '/run/secrets/llm/api-key',
  });
});
