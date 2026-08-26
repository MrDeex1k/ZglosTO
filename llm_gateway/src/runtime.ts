import { readFileSync } from 'node:fs';
import {
  isRecord,
  parseLlmClassificationResponse,
  type LlmClassificationRequest,
  type LlmClassificationResponse,
  type LlmFallbackReason,
  type LlmHealthResponse,
} from '@zglosto/contracts';
import type { LlmGatewayEnvironment } from './environment.ts';

export interface ModelRuntime {
  readonly name: string;
  classify(request: LlmClassificationRequest): Promise<LlmClassificationResponse>;
  health(): Promise<LlmHealthResponse>;
}

function fallback(reason: LlmFallbackReason): LlmClassificationResponse {
  return {
    classification: 'unknown',
    serviceKey: null,
    confidence: null,
    reason,
    modelAvailable: false,
    source: 'fallback',
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function timeoutReason(error: unknown): LlmFallbackReason {
  return error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unavailable';
}

function readDockerModelRunnerContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error('Docker Model Runner response has no choices');
  }
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
    throw new Error('Docker Model Runner response has no message content');
  }
  return first.message.content;
}

function parseDockerModelRunnerClassification(content: string): LlmClassificationResponse {
  const trimmed = content.trim();
  const json =
    trimmed.startsWith('```json\n') && trimmed.endsWith('\n```')
      ? trimmed.slice('```json\n'.length, -'\n```'.length).trim()
      : trimmed;
  const payload: unknown = JSON.parse(json);
  if (!isRecord(payload)) throw new Error('Model output is not an object');
  return parseLlmClassificationResponse({
    classification: payload.classification,
    serviceKey: null,
    confidence: Object.hasOwn(payload, 'confidence') ? payload.confidence : null,
    modelAvailable: true,
    source: 'model',
    reason: null,
  });
}

function modelPrompt(request: LlmClassificationRequest): {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
} {
  const systemPrompt = [
    'Odpowiedz wyłącznie poprawnym obiektem JSON z dokładnie dwoma polami: classification oraz confidence.',
    'classification ma mieć wartość municipal albo emergency.',
    'confidence ma być liczbą od 0 do 1.',
    'Emergency oznacza wyłącznie bezpośrednie zagrożenie życia, zdrowia, mienia lub bezpieczeństwa.',
    'W innych przypadkach wybierz municipal.',
  ].join(' ');
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.description },
    ],
  };
}

function dockerModelRunnerEndpoint(
  environment: LlmGatewayEnvironment,
  path: 'chat/completions' | 'models',
): string {
  const baseUrl = environment.dockerModelRunnerUrl.replace(/\/+$/, '');
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/${path}`;
  return `${baseUrl}/engines/${environment.dockerModelRunnerEngine}/v1/${path}`;
}

function normalizedModelId(model: string): string {
  return model.startsWith('docker.io/') ? model.slice('docker.io/'.length) : model;
}

export class DockerModelRunnerRuntime implements ModelRuntime {
  readonly name = 'docker-model-runner';

  constructor(private readonly environment: LlmGatewayEnvironment) {}

  async classify(request: LlmClassificationRequest): Promise<LlmClassificationResponse> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        dockerModelRunnerEndpoint(this.environment, 'chat/completions'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: this.environment.dockerModelRunnerModel,
            temperature: this.environment.dockerModelRunnerTemperature,
            max_tokens: this.environment.dockerModelRunnerMaxTokens,
            stream: false,
            response_format: { type: 'json_object' },
            ...modelPrompt(request),
          }),
        },
        this.environment.upstreamTimeoutMs,
      );
    } catch (error) {
      return fallback(timeoutReason(error));
    }
    if (!response.ok) return fallback('unavailable');
    try {
      return parseDockerModelRunnerClassification(
        readDockerModelRunnerContent(await response.json()),
      );
    } catch {
      return fallback('invalid_response');
    }
  }

  async health(): Promise<LlmHealthResponse> {
    try {
      const response = await fetchWithTimeout(
        dockerModelRunnerEndpoint(this.environment, 'models'),
        {},
        this.environment.upstreamTimeoutMs,
      );
      if (!response.ok) throw new Error('Docker Model Runner is unavailable');
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error('Docker Model Runner model list is invalid');
      }
      const modelAvailable = payload.data.some(
        (model) =>
          isRecord(model) &&
          typeof model.id === 'string' &&
          normalizedModelId(model.id) ===
            normalizedModelId(this.environment.dockerModelRunnerModel),
      );
      return {
        status: 'ok',
        service: 'llm_gateway',
        model: this.environment.dockerModelRunnerModel,
        enabled: true,
        loaded: modelAvailable,
        error: modelAvailable ? null : 'model_unavailable',
      };
    } catch {
      return unavailableHealth(this.environment.dockerModelRunnerModel);
    }
  }
}

function openAiCompatibleEndpoint(
  environment: LlmGatewayEnvironment,
  path: 'chat/completions' | 'models',
): string {
  return `${environment.openAiCompatibleUrl.replace(/\/+$/u, '')}/${path}`;
}

function externalAuthorizationHeader(environment: LlmGatewayEnvironment): string {
  const apiKey = readFileSync(environment.openAiCompatibleApiKeyFile, 'utf8').trim();
  if (apiKey.length === 0) throw new Error('OpenAI-compatible API key file is empty');
  return `Bearer ${apiKey}`;
}

export class OpenAiCompatibleRuntime implements ModelRuntime {
  readonly name = 'openai-compatible';
  private readonly authorizationHeader: string;

  constructor(private readonly environment: LlmGatewayEnvironment) {
    this.authorizationHeader = externalAuthorizationHeader(environment);
  }

  async classify(request: LlmClassificationRequest): Promise<LlmClassificationResponse> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        openAiCompatibleEndpoint(this.environment, 'chat/completions'),
        {
          method: 'POST',
          headers: {
            authorization: this.authorizationHeader,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.environment.openAiCompatibleModel,
            temperature: this.environment.openAiCompatibleTemperature,
            max_tokens: this.environment.openAiCompatibleMaxTokens,
            stream: false,
            response_format: { type: 'json_object' },
            ...modelPrompt(request),
          }),
        },
        this.environment.upstreamTimeoutMs,
      );
    } catch (error) {
      return fallback(timeoutReason(error));
    }
    if (!response.ok) return fallback('unavailable');
    try {
      return parseDockerModelRunnerClassification(
        readDockerModelRunnerContent(await response.json()),
      );
    } catch {
      return fallback('invalid_response');
    }
  }

  async health(): Promise<LlmHealthResponse> {
    try {
      const response = await fetchWithTimeout(
        openAiCompatibleEndpoint(this.environment, 'models'),
        {
          headers: {
            authorization: this.authorizationHeader,
          },
        },
        this.environment.upstreamTimeoutMs,
      );
      if (!response.ok) throw new Error('OpenAI-compatible provider is unavailable');
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error('OpenAI-compatible model list is invalid');
      }
      const modelAvailable = payload.data.some(
        (model) =>
          isRecord(model) &&
          typeof model.id === 'string' &&
          model.id === this.environment.openAiCompatibleModel,
      );
      return {
        status: 'ok',
        service: 'llm_gateway',
        model: this.environment.openAiCompatibleModel,
        enabled: true,
        loaded: modelAvailable,
        error: modelAvailable ? null : 'model_unavailable',
      };
    } catch {
      return unavailableHealth(this.environment.openAiCompatibleModel);
    }
  }
}

function unavailableHealth(model: string): LlmHealthResponse {
  return {
    status: 'ok',
    service: 'llm_gateway',
    model,
    enabled: false,
    loaded: false,
    error: 'model_unavailable',
  };
}

export class DisabledRuntime implements ModelRuntime {
  readonly name = 'disabled';

  async classify(): Promise<LlmClassificationResponse> {
    return fallback('disabled');
  }

  async health(): Promise<LlmHealthResponse> {
    return {
      status: 'ok',
      service: 'llm_gateway',
      model: 'disabled',
      enabled: false,
      loaded: false,
      error: 'model_disabled',
    };
  }
}

export function createRuntime(environment: LlmGatewayEnvironment): ModelRuntime {
  if (environment.runtime === 'docker-model-runner') {
    return new DockerModelRunnerRuntime(environment);
  }
  if (environment.runtime === 'openai-compatible') {
    return new OpenAiCompatibleRuntime(environment);
  }
  return new DisabledRuntime();
}
