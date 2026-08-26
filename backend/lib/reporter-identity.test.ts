import { expect, test } from 'vitest';
import { isValidReporterEmail, normalizeReporterEmail } from './reporter-identity.ts';

test('normalizes reporter email before persistence', () => {
  expect(normalizeReporterEmail('  Jan.Kowalski@Example.COM ')).toBe('jan.kowalski@example.com');
});

test('rejects malformed and overlong reporter emails', () => {
  expect(isValidReporterEmail('missing-at.example.com')).toBe(false);
  expect(isValidReporterEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  expect(isValidReporterEmail('resident@example.com')).toBe(true);
});
