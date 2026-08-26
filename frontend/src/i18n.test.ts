import { describe, expect, it } from 'vitest';

import { resolveI18nLocale } from './lib/locale';

describe('resolveI18nLocale', () => {
  it('uses the newly requested English language while resolvedLanguage is still Polish', () => {
    expect(resolveI18nLocale({ language: 'en', resolvedLanguage: 'pl-PL' })).toBe('en');
  });

  it('uses the newly requested Polish language while resolvedLanguage is still English', () => {
    expect(resolveI18nLocale({ language: 'pl-PL', resolvedLanguage: 'en' })).toBe('pl-PL');
  });

  it('normalizes regional language variants and preserves the default fallback', () => {
    expect(resolveI18nLocale({ language: 'en-US' })).toBe('en');
    expect(resolveI18nLocale({ language: 'de-DE' })).toBe('pl-PL');
  });
});
