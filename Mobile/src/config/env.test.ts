import { describe, expect, test } from 'vitest';

import { MobileEnvironmentError, parseMobileEnvironment } from './env';

describe('mobile environment', () => {
  test('accepts a normalized HTTPS origin', () => {
    expect(
      parseMobileEnvironment({
        EXPO_PUBLIC_API_ORIGIN: 'https://city.example',
        EXPO_PUBLIC_APP_ENV: 'preview',
      }),
    ).toEqual({
      allowHttpOrigin: false,
      apiOrigin: 'https://city.example',
      appEnvironment: 'preview',
    });
  });

  test('allows an explicit loopback HTTP origin only in development', () => {
    expect(
      parseMobileEnvironment({
        EXPO_PUBLIC_ALLOW_HTTP_ORIGIN: 'true',
        EXPO_PUBLIC_API_ORIGIN: 'http://10.0.2.2:1235',
        EXPO_PUBLIC_APP_ENV: 'development',
      }).apiOrigin,
    ).toBe('http://10.0.2.2:1235');
  });

  test('allows an explicit private bridge HTTP origin only in development', () => {
    expect(
      parseMobileEnvironment({
        EXPO_PUBLIC_ALLOW_HTTP_ORIGIN: 'true',
        EXPO_PUBLIC_API_ORIGIN: 'http://192.168.139.3:1235',
        EXPO_PUBLIC_APP_ENV: 'development',
      }).apiOrigin,
    ).toBe('http://192.168.139.3:1235');
  });

  test.each([
    {},
    { EXPO_PUBLIC_API_ORIGIN: '/api' },
    { EXPO_PUBLIC_API_ORIGIN: 'http://city.example' },
    { EXPO_PUBLIC_API_ORIGIN: 'https://user:secret@city.example' },
    { EXPO_PUBLIC_API_ORIGIN: 'https://city.example/api' },
  ])('rejects unsafe input %#', (input) => {
    expect(() => parseMobileEnvironment(input)).toThrow(MobileEnvironmentError);
  });

  test('never allows HTTP outside development', () => {
    expect(() =>
      parseMobileEnvironment({
        EXPO_PUBLIC_ALLOW_HTTP_ORIGIN: 'true',
        EXPO_PUBLIC_API_ORIGIN: 'http://localhost:1235',
        EXPO_PUBLIC_APP_ENV: 'production',
      }),
    ).toThrow('must use HTTPS');
  });
});
