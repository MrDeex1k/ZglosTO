import {
  ContractValidationError,
  expectBoolean,
  expectNullableNumber,
  expectNullableString,
  expectRecord,
  expectString,
} from './common.js';
import { z } from 'zod';

export const LLM_CLASSIFICATION_PATH = '/classify-incident';
export const LLM_CLASSIFICATION_HTTP_METHOD = 'QUERY';
export const LLM_CLASSIFICATION_LEGACY_HTTP_METHOD = 'POST';
export const LLM_CLASSIFICATION_CONTENT_TYPE = 'application/json';

export const LLM_CLASSIFICATIONS = ['municipal', 'emergency', 'unknown'] as const;
export type LlmClassification = (typeof LLM_CLASSIFICATIONS)[number];

export const LLM_CLASSIFICATION_SOURCES = ['model', 'fallback'] as const;
export type LlmClassificationSource = (typeof LLM_CLASSIFICATION_SOURCES)[number];

export const LLM_FALLBACK_REASONS = [
  'timeout',
  'disabled',
  'unavailable',
  'invalid_response',
] as const;
export type LlmFallbackReason = (typeof LLM_FALLBACK_REASONS)[number];

export interface LlmClassificationRequest {
  description: string;
  address: string | null;
  city: string | null;
}

export interface LlmClassificationResponse {
  classification: LlmClassification;
  serviceKey: string | null;
  confidence: number | null;
  reason: LlmFallbackReason | null;
  modelAvailable: boolean;
  source: LlmClassificationSource;
}

export interface CurrentLlmClassificationResult {
  classification: LlmClassification;
  serviceKey: string;
  modelAvailable: boolean;
  source: LlmClassificationSource;
  reason: LlmFallbackReason | null;
}

export const CurrentLlmClassificationResultSchema = z
  .object({
    classification: z.enum(LLM_CLASSIFICATIONS),
    serviceKey: z.string(),
    modelAvailable: z.boolean(),
    source: z.enum(LLM_CLASSIFICATION_SOURCES),
    reason: z.enum(LLM_FALLBACK_REASONS).nullable(),
  })
  .strict();

export interface LlmHealthResponse {
  status: string;
  service: string;
  model: string;
  enabled: boolean;
  loaded: boolean;
  error: string | null;
}

export function parseLlmClassificationRequest(
  value: unknown,
  path = 'llmClassificationRequest',
): LlmClassificationRequest {
  const record = expectRecord(value, path);
  const description = expectString(record.description, `${path}.description`).trim();
  if (description.length === 0 || description.length > 10_000) {
    throw new ContractValidationError(`${path}.description`, '1..10000 characters');
  }
  return {
    description,
    address: expectNullableString(record.address, `${path}.address`),
    city: expectNullableString(record.city, `${path}.city`),
  };
}

export function parseLlmClassificationResponse(
  value: unknown,
  path = 'llmClassificationResponse',
): LlmClassificationResponse {
  const record = expectRecord(value, path);
  const response: LlmClassificationResponse = {
    classification: expectClassification(record.classification, `${path}.classification`),
    serviceKey: expectNullableString(record.serviceKey, `${path}.serviceKey`),
    confidence: expectNullableNumber(record.confidence, `${path}.confidence`),
    reason: expectReason(record.reason, `${path}.reason`),
    modelAvailable: expectBoolean(record.modelAvailable, `${path}.modelAvailable`),
    source: expectSource(record.source, `${path}.source`),
  };
  if (response.confidence !== null && (response.confidence < 0 || response.confidence > 1)) {
    throw new ContractValidationError(`${path}.confidence`, 'number from 0 to 1 or null');
  }
  if (
    (response.source === 'model' &&
      (!response.modelAvailable ||
        response.classification === 'unknown' ||
        response.reason !== null)) ||
    (response.source === 'fallback' &&
      (response.modelAvailable ||
        response.classification !== 'unknown' ||
        response.reason === null))
  ) {
    throw new ContractValidationError(path, 'consistent model or fallback result');
  }
  return response;
}

function expectClassification(value: unknown, path: string): LlmClassification {
  if (typeof value === 'string' && LLM_CLASSIFICATIONS.some((item) => item === value)) {
    return value as LlmClassification;
  }
  throw new ContractValidationError(path, LLM_CLASSIFICATIONS.join(' | '));
}

function expectSource(value: unknown, path: string): LlmClassificationSource {
  if (typeof value === 'string' && LLM_CLASSIFICATION_SOURCES.some((item) => item === value)) {
    return value as LlmClassificationSource;
  }
  throw new ContractValidationError(path, LLM_CLASSIFICATION_SOURCES.join(' | '));
}

function expectReason(value: unknown, path: string): LlmFallbackReason | null {
  if (value === null) return null;
  if (typeof value === 'string' && LLM_FALLBACK_REASONS.some((item) => item === value)) {
    return value as LlmFallbackReason;
  }
  throw new ContractValidationError(path, `${LLM_FALLBACK_REASONS.join(' | ')} | null`);
}

export function parseCurrentLlmClassificationResult(
  value: unknown,
  path = 'classification',
): CurrentLlmClassificationResult {
  const record = expectRecord(value, path);
  return {
    classification: expectClassification(record.classification, `${path}.classification`),
    serviceKey: expectString(record.serviceKey, `${path}.serviceKey`),
    modelAvailable: expectBoolean(record.modelAvailable, `${path}.modelAvailable`),
    source: expectSource(record.source, `${path}.source`),
    reason: expectReason(record.reason, `${path}.reason`),
  };
}

export function parseLlmHealthResponse(value: unknown): LlmHealthResponse {
  const record = expectRecord(value, 'llmHealth');
  const rawError = Object.hasOwn(record, 'error') ? record.error : null;
  return {
    status: expectString(record.status, 'llmHealth.status'),
    service: expectString(record.service, 'llmHealth.service'),
    model: expectString(record.model, 'llmHealth.model'),
    enabled: expectBoolean(record.enabled, 'llmHealth.enabled'),
    loaded: expectBoolean(record.loaded, 'llmHealth.loaded'),
    error: expectNullableString(rawError, 'llmHealth.error'),
  };
}
