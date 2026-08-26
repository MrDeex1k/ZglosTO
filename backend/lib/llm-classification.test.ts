import { expect, test } from 'vitest';
import {
  LLM_CLASSIFICATION_CONTENT_TYPE,
  LLM_CLASSIFICATION_HTTP_METHOD,
  LLM_CLASSIFICATION_PATH,
} from '@zglosto/contracts';
import {
  classifyIncident,
  fallbackClassification,
  normalizeLlmResponse,
} from './llm-classification.ts';

test('normalizes a model classification', () => {
  expect(
    normalizeLlmResponse(
      {
        classification: 'emergency',
        serviceKey: null,
        confidence: 0.9,
        modelAvailable: true,
        source: 'model',
        reason: null,
      },
      'roads',
      'manual_review',
    ),
  ).toEqual({
    classification: 'emergency',
    serviceKey: 'roads',
    modelAvailable: true,
    source: 'model',
    reason: null,
  });
});

test('routes an invalid model response through the fallback service', () => {
  expect(normalizeLlmResponse({ response: 'perhaps' }, 'roads', 'manual_review')).toEqual(
    fallbackClassification('invalid_response', 'manual_review'),
  );
});

test('rejects an unknown response without a supported fallback reason', () => {
  expect(
    normalizeLlmResponse(
      {
        classification: 'unknown',
        serviceKey: null,
        confidence: null,
        modelAvailable: false,
        source: 'fallback',
        reason: null,
      },
      'roads',
      'manual_review',
    ),
  ).toEqual(fallbackClassification('invalid_response', 'manual_review'));
});

test('does not allow the model response to override configured fallback routing', () => {
  expect(
    normalizeLlmResponse(
      {
        classification: 'unknown',
        serviceKey: 'model_selected_fallback',
        confidence: null,
        modelAvailable: false,
        source: 'fallback',
        reason: 'disabled',
      },
      'roads',
      'manual_review',
    ),
  ).toEqual(fallbackClassification('disabled', 'manual_review'));
});

test('sends classification input through the QUERY contract', async () => {
  const requests: Array<{ input: string | URL | Request; options: RequestInit }> = [];
  const fetchImpl: typeof fetch = (input, options) => {
    requests.push({ input, options: options ?? {} });
    return Promise.resolve(
      Response.json({
        classification: 'municipal',
        serviceKey: null,
        confidence: 0.9,
        modelAvailable: true,
        source: 'model',
        reason: null,
      }),
    );
  };

  const result = await classifyIncident('description', 'roads', {
    fetchImpl,
    gatewayUrl: 'https://llm-gateway:8130',
    fallbackServiceKey: 'manual_review',
    timeoutMs: 100,
  });

  const captured = requests[0];
  if (!captured) throw new Error('Classification request was not captured');
  expect(captured.input).toBe(`https://llm-gateway:8130${LLM_CLASSIFICATION_PATH}`);
  expect(captured.options.method).toBe(LLM_CLASSIFICATION_HTTP_METHOD);
  expect(new Headers(captured.options.headers).get('content-type')).toBe(
    LLM_CLASSIFICATION_CONTENT_TYPE,
  );
  expect(captured.options.body).toBe(
    JSON.stringify({ description: 'description', address: null, city: null }),
  );
  expect(result.serviceKey).toBe('roads');
});

test('returns timeout fallback without throwing', async () => {
  const fetchImpl: typeof fetch = (_input, options = {}) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = options.signal ?? null;
      if (signal === null) {
        reject(new Error('Missing abort signal'));
        return;
      }
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

  const result = await classifyIncident('description', 'roads', {
    fetchImpl,
    gatewayUrl: 'https://llm-gateway:8130',
    fallbackServiceKey: 'manual_review',
    timeoutMs: 5,
  });

  expect(result).toEqual(fallbackClassification('timeout', 'manual_review'));
});
