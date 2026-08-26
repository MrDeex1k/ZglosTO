import { z } from 'zod';

const LlmRuntimeSchema = z.enum(['docker-model-runner', 'disabled', 'openai-compatible']);

const EnvironmentSchema = z
  .object({
    port: z.coerce.number().int().positive().max(65_535),
    tlsCaPath: z.string().trim().min(1),
    tlsCertificatePath: z.string().trim().min(1),
    tlsPrivateKeyPath: z.string().trim().min(1),
    backendIdentity: z.string().trim().url(),
    kedaIdentity: z.string().trim().url(),
    nginxIdentity: z.string().trim().url(),
    healthcheckIdentity: z.string().trim().url(),
    hmacKeyFile: z.string().trim().min(1),
    hmacKeyId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,64}$/),
    authClockSkewSeconds: z.coerce.number().int().positive().max(300),
    authReplayMaxEntries: z.coerce.number().int().positive().max(1_000_000),
    maxBodyBytes: z.coerce.number().int().positive().max(1_048_576),
    maxConcurrentClassifications: z.coerce.number().int().positive().max(1_000),
    runtime: LlmRuntimeSchema,
    upstreamTimeoutMs: z.coerce.number().int().positive(),
    dockerModelRunnerUrl: z.url(),
    dockerModelRunnerModel: z.string().trim().min(1),
    dockerModelRunnerEngine: z.string().trim().min(1),
    dockerModelRunnerTemperature: z.coerce.number().min(0).max(2),
    dockerModelRunnerMaxTokens: z.coerce.number().int().positive().max(256),
    openAiCompatibleUrl: z.url(),
    openAiCompatibleModel: z.string().trim().min(1),
    openAiCompatibleApiKeyFile: z.string().trim().min(1),
    openAiCompatibleTemperature: z.coerce.number().min(0).max(2),
    openAiCompatibleMaxTokens: z.coerce.number().int().positive().max(256),
  })
  .strict();

export type LlmGatewayEnvironment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(): LlmGatewayEnvironment {
  return EnvironmentSchema.parse({
    port: process.env.LLM_GATEWAY_PORT ?? '8130',
    tlsCaPath: process.env.LLM_GATEWAY_TLS_CA_PATH ?? '/run/secrets/service/ca.crt',
    tlsCertificatePath:
      process.env.LLM_GATEWAY_TLS_CERT_PATH ?? '/run/secrets/service/llm-gateway-server.crt',
    tlsPrivateKeyPath:
      process.env.LLM_GATEWAY_TLS_KEY_PATH ?? '/run/secrets/service/llm-gateway-server.key',
    backendIdentity:
      process.env.LLM_GATEWAY_BACKEND_IDENTITY ?? 'spiffe://zglosto.local/workload/backend',
    kedaIdentity:
      process.env.LLM_GATEWAY_KEDA_IDENTITY ??
      'spiffe://zglosto.local/workload/keda-http-interceptor',
    nginxIdentity:
      process.env.LLM_GATEWAY_NGINX_IDENTITY ?? 'spiffe://zglosto.local/workload/nginx',
    healthcheckIdentity:
      process.env.LLM_GATEWAY_HEALTHCHECK_IDENTITY ??
      'spiffe://zglosto.local/workload/llm-gateway-healthcheck',
    hmacKeyFile: process.env.LLM_GATEWAY_HMAC_KEY_FILE ?? '/run/secrets/llm-auth/hmac-key',
    hmacKeyId: process.env.LLM_GATEWAY_HMAC_KEY_ID ?? 'backend-v1',
    authClockSkewSeconds: process.env.LLM_GATEWAY_AUTH_CLOCK_SKEW_SECONDS ?? '30',
    authReplayMaxEntries: process.env.LLM_GATEWAY_AUTH_REPLAY_MAX_ENTRIES ?? '10000',
    maxBodyBytes: process.env.LLM_GATEWAY_MAX_BODY_BYTES ?? '32768',
    maxConcurrentClassifications: process.env.LLM_GATEWAY_MAX_CONCURRENT_CLASSIFICATIONS ?? '4',
    runtime: process.env.LLM_RUNTIME ?? 'disabled',
    upstreamTimeoutMs: process.env.LLM_UPSTREAM_TIMEOUT_MS ?? '5000',
    dockerModelRunnerUrl:
      process.env.DOCKER_MODEL_RUNNER_URL ?? 'http://model-runner.docker.internal:12434',
    dockerModelRunnerModel: process.env.DOCKER_MODEL_RUNNER_MODEL ?? 'ai/gemma3-qat:1B-Q4_K_M',
    dockerModelRunnerEngine: process.env.DOCKER_MODEL_RUNNER_ENGINE ?? 'llama.cpp',
    dockerModelRunnerTemperature: process.env.DOCKER_MODEL_RUNNER_TEMPERATURE ?? '0.1',
    dockerModelRunnerMaxTokens: process.env.DOCKER_MODEL_RUNNER_MAX_TOKENS ?? '64',
    openAiCompatibleUrl: process.env.OPENAI_COMPATIBLE_URL ?? 'https://llm.example.invalid/v1',
    openAiCompatibleModel: process.env.OPENAI_COMPATIBLE_MODEL ?? 'disabled',
    openAiCompatibleApiKeyFile:
      process.env.OPENAI_COMPATIBLE_API_KEY_FILE ?? '/run/secrets/llm/api-key',
    openAiCompatibleTemperature: process.env.OPENAI_COMPATIBLE_TEMPERATURE ?? '0.1',
    openAiCompatibleMaxTokens: process.env.OPENAI_COMPATIBLE_MAX_TOKENS ?? '64',
  });
}
