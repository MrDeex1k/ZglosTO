import { describe, expect, test } from 'vitest';

import {
  createEmailVerificationCallback,
  createNativeAppLinkConfig,
  normalizeAppLinkHost,
} from '../../app.config';

describe('native app-link configuration', () => {
  test('keeps native associations disabled until a real host is supplied', () => {
    expect(normalizeAppLinkHost(undefined)).toBeNull();
    expect(normalizeAppLinkHost('  ')).toBeNull();
  });

  test.each(['https://city.example', 'city.example/path', 'localhost', '127.0.0.1', '*.city.pl'])(
    'rejects an unsafe association host: %s',
    (value) => expect(() => normalizeAppLinkHost(value)).toThrow(/DNS hostname/),
  );

  test('uses the associated HTTPS host and allows the scheme fallback in development', () => {
    expect(createEmailVerificationCallback('app.miasto.pl', 'production')).toBe(
      'https://app.miasto.pl/auth/email-verified',
    );
    expect(createEmailVerificationCallback(null, 'development')).toBe(
      'zglosto://auth/email-verified',
    );
    expect(() => createEmailVerificationCallback(null, 'production')).toThrow(
      /MOBILE_APP_LINK_HOST/,
    );
  });

  test('builds exact iOS and Android associations for the approved paths', () => {
    const host = normalizeAppLinkHost('APP.MIASTO.PL');
    expect(host).toBe('app.miasto.pl');
    expect(createNativeAppLinkConfig(host!)).toEqual({
      androidIntentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            { host: 'app.miasto.pl', pathPrefix: '/open', scheme: 'https' },
            { host: 'app.miasto.pl', pathPrefix: '/auth/email-verified', scheme: 'https' },
          ],
        },
      ],
      iosAssociatedDomains: ['applinks:app.miasto.pl'],
    });
  });
});
