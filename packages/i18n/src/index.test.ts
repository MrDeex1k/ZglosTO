import { describe, expect, test } from 'vitest';

import {
  createI18n,
  DEPLOYMENT_TIMEZONE,
  enTranslation,
  formatDateTime,
  normalizeSupportedLocale,
  plPLTranslation,
  resolveSupportedLocale,
} from './index.js';

function collectKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    return typeof nestedValue === 'string' ? [path] : collectKeys(nestedValue as object, path);
  });
}

function collectValues(value: object): string[] {
  return Object.values(value).flatMap((nestedValue) =>
    typeof nestedValue === 'string' ? [nestedValue] : collectValues(nestedValue as object),
  );
}

describe('locale contract', () => {
  test.each([
    ['pl', 'pl-PL'],
    ['pl_PL', 'pl-PL'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['de-DE', null],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSupportedLocale(input)).toBe(expected);
  });

  test('uses the first supported preference and then the explicit fallback', () => {
    expect(resolveSupportedLocale(['de-DE', 'en-US'], 'pl-PL')).toBe('en');
    expect(resolveSupportedLocale(['de-DE'], 'pl-PL')).toBe('pl-PL');
  });

  test('keeps Polish and English catalog keys identical', () => {
    expect(collectKeys(enTranslation).sort()).toEqual(collectKeys(plPLTranslation).sort());
  });

  test('does not expose implementation phase labels in the mobile catalog', () => {
    expect(collectValues(plPLTranslation.mobile)).not.toContainEqual(
      expect.stringMatching(/^Faza \d/),
    );
    expect(collectValues(enTranslation.mobile)).not.toContainEqual(
      expect.stringMatching(/^Phase \d/),
    );
  });

  test('creates an isolated translated i18next instance', async () => {
    const instance = await createI18n('en');
    expect(instance.t(($) => $.incidents.status.reported)).toBe('REPORTED');
  });

  test('keeps the permanent 112 notice available in both supported languages', () => {
    expect(plPLTranslation.incidents.emergencyDisclaimer.message).toBe(
      'ZgłosTO nie służy do obsługi sytuacji alarmowych. Jeśli występuje bezpośrednie zagrożenie życia, zdrowia, mienia lub bezpieczeństwa, zadzwoń pod numer 112.',
    );
    expect(enTranslation.incidents.emergencyDisclaimer.message).toBe(
      'ZgłosTO is not intended for emergency response. If there is an immediate threat to life, health, property, or safety, call 112.',
    );
  });

  test('formats winter and summer timestamps in Europe/Warsaw', () => {
    expect(formatDateTime('2026-01-15T12:00:00Z', 'en', DEPLOYMENT_TIMEZONE)).toContain('13:00');
    expect(formatDateTime('2026-07-15T12:00:00Z', 'en', DEPLOYMENT_TIMEZONE)).toContain('14:00');
  });
});
