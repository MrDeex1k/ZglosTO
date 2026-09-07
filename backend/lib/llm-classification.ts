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
}

function isFallbackReason(value: unknown): value is LlmFallbackReason {
  return LLM_FALLBACK_REASONS.some((reason) => reason === value);
}

export function fallbackClassification(
  reason: unknown,
  requestedServiceKey: string,
): CurrentLlmClassificationResult {
  return {
    classification: 'unknown',
    serviceKey: requestedServiceKey,
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
): CurrentLlmClassificationResult {
  try {
    const response = parseLlmClassificationResponse(payload);
    if (response.classification === 'unknown') {
      const reason = isFallbackReason(response.reason) ? response.reason : 'invalid_response';
      return fallbackClassification(reason, requestedServiceKey);
    }
    return modelClassification(response.classification, requestedServiceKey);
  } catch {
    return fallbackClassification('invalid_response', requestedServiceKey);
  }
}

export async function classifyIncident(
  description: string,
  requestedServiceKey: string,
  options: ClassifyIncidentOptions,
): Promise<CurrentLlmClassificationResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<CurrentLlmClassificationResult>((resolve) => {
    timeout = setTimeout(() => {
      resolve(fallbackClassification('timeout', requestedServiceKey));
      controller.abort();
    }, options.timeoutMs);
  });

  const classify = async (): Promise<CurrentLlmClassificationResult> => {
    try {
      const response = await options.fetchImpl(`${options.gatewayUrl}${LLM_CLASSIFICATION_PATH}`, {
        method: LLM_CLASSIFICATION_HTTP_METHOD,
        headers: { 'Content-Type': LLM_CLASSIFICATION_CONTENT_TYPE },
        body: JSON.stringify({ description, address: null, city: null }),
        signal: controller.signal,
      });
      if (!response.ok) return fallbackClassification('unavailable', requestedServiceKey);
      const payload: unknown = await response.json();
      return normalizeLlmResponse(payload, requestedServiceKey);
    } catch (error) {
      const reason = controller.signal.aborted
        ? 'timeout'
        : error instanceof SyntaxError
          ? 'invalid_response'
          : 'unavailable';
      return fallbackClassification(reason, requestedServiceKey);
    }
  };

  try {
    // The deadline also covers a stalled body or a transport ignoring AbortSignal.
    return await Promise.race([classify(), deadline]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

export function toLegacyLlmAnswer(classification: LlmClassification): string | null {
  if (classification === 'emergency') return 'SŁUŻBY RATUNKOWE';
  if (classification === 'municipal') return 'SŁUŻBY MIEJSKIE';
  return null;
}
