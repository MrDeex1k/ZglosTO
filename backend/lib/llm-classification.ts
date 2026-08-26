import {
  LLM_CLASSIFICATION_CONTENT_TYPE,
  LLM_CLASSIFICATION_HTTP_METHOD,
  LLM_CLASSIFICATION_PATH,
  LLM_FALLBACK_REASONS,
  parseLlmClassificationResponse,
  type CurrentLlmClassificationResult,
  type LlmClassification,
  type LlmFallbackReason,
} from '@zglosto/contracts';

export interface ClassifyIncidentOptions {
  fetchImpl: typeof fetch;
  gatewayUrl: string;
  timeoutMs: number;
  fallbackServiceKey: string;
}

function isFallbackReason(value: unknown): value is LlmFallbackReason {
  return LLM_FALLBACK_REASONS.some((reason) => reason === value);
}

export function fallbackClassification(
  reason: unknown,
  fallbackServiceKey: string,
): CurrentLlmClassificationResult {
  return {
    classification: 'unknown',
    serviceKey: fallbackServiceKey,
    modelAvailable: false,
    source: 'fallback',
    reason: isFallbackReason(reason) ? reason : 'unavailable',
  };
}

function modelClassification(
  classification: Exclude<LlmClassification, 'unknown'>,
  requestedServiceKey: string,
): CurrentLlmClassificationResult {
  return {
    classification,
    serviceKey: requestedServiceKey,
    modelAvailable: true,
    source: 'model',
    reason: null,
  };
}

export function normalizeLlmResponse(
  payload: unknown,
  requestedServiceKey: string,
  fallbackServiceKey: string,
): CurrentLlmClassificationResult {
  try {
    const response = parseLlmClassificationResponse(payload);
    if (response.classification === 'unknown') {
      const reason = isFallbackReason(response.reason) ? response.reason : 'invalid_response';
      return fallbackClassification(reason, fallbackServiceKey);
    }
    return modelClassification(response.classification, requestedServiceKey);
  } catch {
    return fallbackClassification('invalid_response', fallbackServiceKey);
  }
}

export async function classifyIncident(
  description: string,
  requestedServiceKey: string,
  options: ClassifyIncidentOptions,
): Promise<CurrentLlmClassificationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetchImpl(`${options.gatewayUrl}${LLM_CLASSIFICATION_PATH}`, {
      method: LLM_CLASSIFICATION_HTTP_METHOD,
      headers: { 'Content-Type': LLM_CLASSIFICATION_CONTENT_TYPE },
      body: JSON.stringify({ description, address: null, city: null }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallbackClassification('unavailable', options.fallbackServiceKey);
    }

    const payload: unknown = await response.json();
    return normalizeLlmResponse(payload, requestedServiceKey, options.fallbackServiceKey);
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unavailable';
    return fallbackClassification(reason, options.fallbackServiceKey);
  } finally {
    clearTimeout(timeout);
  }
}

export function toLegacyLlmAnswer(classification: LlmClassification): string | null {
  if (classification === 'emergency') return 'SŁUŻBY RATUNKOWE';
  if (classification === 'municipal') return 'SŁUŻBY MIEJSKIE';
  return null;
}
