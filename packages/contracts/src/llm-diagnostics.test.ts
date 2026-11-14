import { expect, test } from 'vitest';
import { parseLlmClassificationResponse } from './llm.js';

const diagnostics = {
  confidenceRaw: 0.8,
  pEmergencyRaw: 0.8,
  modelId: 'zglosto/basal-2.0-mini:q5_k_m',
  modelRevision: `sha256:${'a'.repeat(64)}`,
  promptVersion: 'municipal-emergency-v1',
  latencyMs: 153,
  calibrationVersion: null,
};
const model = {
  classification: 'emergency',
  serviceKey: null,
  confidence: null,
  source: 'model',
  modelAvailable: true,
  reason: null,
};

test('preserves validated internal metadata without changing the decision', () => {
  expect(parseLlmClassificationResponse({ ...model, diagnostics })).toEqual({
    ...model,
    diagnostics,
  });
  expect(parseLlmClassificationResponse(model)).toEqual(model);
});

test.each([
  { confidenceRaw: NaN },
  { confidenceRaw: Infinity },
  { pEmergencyRaw: -0.1 },
  { pEmergencyRaw: 1.1 },
  { pEmergencyRaw: null },
  { confidenceRaw: 0.5 },
  { latencyMs: -1 },
  { latencyMs: 0.5 },
  { latencyMs: 2_147_483_648 },
  { modelId: '' },
  { modelRevision: 'mutable-tag' },
  { promptVersion: '' },
  { calibrationVersion: '' },
  { unexpected: 'data' },
])('drops invalid metadata without discarding a valid classification: %j', (overrides) => {
  expect(
    parseLlmClassificationResponse({ ...model, diagnostics: { ...diagnostics, ...overrides } }),
  ).toEqual({ ...model, diagnostics: null });
});

test('fallbacks permit timing/provenance but never scores', () => {
  const fallback = {
    ...model,
    classification: 'unknown',
    source: 'fallback',
    modelAvailable: false,
    reason: 'timeout',
  };
  expect(parseLlmClassificationResponse({ ...fallback, diagnostics })).toEqual({
    ...fallback,
    diagnostics: null,
  });
  const metadata = {
    ...diagnostics,
    confidenceRaw: null,
    pEmergencyRaw: null,
    modelRevision: null,
  };
  expect(parseLlmClassificationResponse({ ...fallback, diagnostics: metadata })).toEqual({
    ...fallback,
    diagnostics: metadata,
  });
});
