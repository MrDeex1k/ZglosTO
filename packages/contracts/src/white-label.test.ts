import { describe, expect, expectTypeOf, test } from 'vitest';

import {
  createPublicWhiteLabelConfig,
  findCityService,
  findEnabledCityService,
  parsePublicCityConfigResponse,
  parseSupportedLocale,
  parseWhiteLabelConfig,
  safeParseWhiteLabelConfig,
  WHITE_LABEL_DEPLOYMENT_MODEL,
  WhiteLabelConfigValidationError,
  localizedTextSchema,
  type CityConfig,
  type PublicWhiteLabelConfig,
  type WhiteLabelConfig,
} from './white-label.js';

const validConfig = {
  schemaVersion: 1,
  configVersion: 'zglosto-2026-01',
  city: {
    key: 'zglosto',
    displayName: {
      'pl-PL': 'Warszawa',
      en: 'Warsaw',
    },
    defaultLocale: 'pl-PL',
    supportedLocales: ['pl-PL', 'en'],
    timezone: 'Europe/Warsaw',
  },
  branding: {
    logoPath: '/assets/city-logo.svg',
    emblemAlt: {
      'pl-PL': 'Herb miasta Warszawy',
      en: 'Coat of arms of Warsaw',
    },
    faviconPath: 'https://assets.example.com/favicon.svg',
    colors: {
      primary: '#0057B8',
      secondary: '#FFFFFF',
      accent: '#F5A623',
    },
  },
  contact: {
    email: 'kontakt@zglosto.example',
    phone: '+48 22 000 00 00',
    website: 'https://zglosto.example',
    address: {
      'pl-PL': 'ul. Przykładowa 1, 00-001 Warszawa',
      en: '1 Example Street, 00-001 Warsaw',
    },
    officeHours: {
      'pl-PL': 'Poniedziałek–piątek, 8:00–16:00',
      en: 'Monday–Friday, 8:00–16:00',
    },
  },
  localContent: {
    siteTitle: {
      'pl-PL': 'ZgłośTO — Warszawa',
      en: 'ZgłośTO — Warsaw',
    },
    siteDescription: {
      'pl-PL': 'Miejski system zgłaszania incydentów w Warszawie.',
      en: 'Municipal incident reporting system for Warsaw.',
    },
    footerText: {
      'pl-PL': 'Warszawa dziękuje za odpowiedzialne zgłaszanie problemów.',
      en: 'Warsaw thanks you for reporting local problems responsibly.',
    },
    legalNotice: {
      'pl-PL': 'Zgłoszenie nie zastępuje kontaktu z numerem alarmowym 112.',
      en: 'A report does not replace contacting the 112 emergency number.',
    },
    reportAddressPlaceholder: {
      'pl-PL': 'np. ul. Główna 123, Warszawa',
      en: 'e.g. 123 Main Street, Warsaw',
    },
  },
  services: [
    {
      key: 'roads',
      label: { 'pl-PL': 'Zarząd Dróg', en: 'Road Authority' },
      shortLabel: { 'pl-PL': 'ZD', en: 'Roads' },
      enabled: true,
      sortOrder: 10,
      iconKey: 'road',
      description: null,
      color: '#0057B8',
    },
    {
      key: 'manual_review',
      label: { 'pl-PL': 'Inne', en: 'Other' },
      shortLabel: { 'pl-PL': 'Inne', en: 'Other' },
      enabled: true,
      sortOrder: 999,
      iconKey: 'circle_help',
      description: {
        'pl-PL': 'Zgłoszenia wymagające ręcznej weryfikacji',
        en: 'Reports requiring manual review',
      },
      color: null,
    },
  ],
  routing: {
    fallbackServiceKey: 'manual_review',
  },
  map: {
    provider: 'osm',
    center: {
      lat: 52.2297,
      lng: 21.0122,
    },
    zoom: 12,
    bounds: null,
    tilesUrl: null,
    attribution: null,
  },
  features: {
    map: true,
    llmClassification: true,
    anonymousReports: true,
  },
} as const;

describe('White-Label config contract', () => {
  test('accepts only the complete Polish and English localized text contract', () => {
    expect(localizedTextSchema.parse({ 'pl-PL': 'Tekst', en: 'Text' })).toEqual({
      'pl-PL': 'Tekst',
      en: 'Text',
    });
    expect(() => localizedTextSchema.parse({ 'pl-PL': 'Tekst' })).toThrow();
    expect(parseSupportedLocale('en')).toBe('en');
    expect(() => parseSupportedLocale('en-US')).toThrow();
  });

  test('declares one city as the only supported runtime deployment model', () => {
    expect(WHITE_LABEL_DEPLOYMENT_MODEL).toBe('single-city');
  });

  test('parses a complete config and infers its TypeScript contract from Zod', () => {
    const parsed = parseWhiteLabelConfig(validConfig);

    expect(parsed).toEqual(validConfig);
    expectTypeOf(parsed).toEqualTypeOf<WhiteLabelConfig>();
    expectTypeOf<CityConfig>().toEqualTypeOf<WhiteLabelConfig>();
    expectTypeOf<PublicWhiteLabelConfig>().not.toEqualTypeOf<WhiteLabelConfig>();
  });

  test('rejects unknown fields at every object level and reports their paths', () => {
    const result = safeParseWhiteLabelConfig({
      ...validConfig,
      city: { ...validConfig.city, tenantId: 'city-1' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['city']);
    expect(() => parseWhiteLabelConfig({ ...validConfig, secret: 'do-not-expose' })).toThrow(
      '$.secret: secret-bearing fields are forbidden; use ENV/Secret',
    );
  });

  test('rejects secret-bearing fields and values without echoing their contents', () => {
    const secretLikeValue = ['sk', 'test', 'abcdefghijklmnop'].join('-');
    const secretFieldResult = safeParseWhiteLabelConfig({
      ...validConfig,
      apiKey: secretLikeValue,
    });
    expect(secretFieldResult.success).toBe(false);
    if (secretFieldResult.success) return;
    expect(secretFieldResult.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['apiKey'],
        message: 'secret-bearing fields are forbidden; use ENV/Secret',
      }),
    );
    expect(secretFieldResult.error.message).not.toContain(secretLikeValue);

    const credentialUrlResult = safeParseWhiteLabelConfig({
      ...validConfig,
      contact: {
        ...validConfig.contact,
        website: 'https://service-user:sensitive-value@example.com',
      },
    });
    expect(credentialUrlResult.success).toBe(false);
    if (credentialUrlResult.success) return;
    expect(credentialUrlResult.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['contact', 'website'],
        message: 'URL credentials are forbidden; use ENV/Secret',
      }),
    );
    expect(credentialUrlResult.error.message).not.toContain('sensitive-value');

    const providerTokenResult = safeParseWhiteLabelConfig({
      ...validConfig,
      localContent: {
        ...validConfig.localContent,
        footerText: { 'pl-PL': 'Publiczna stopka', en: secretLikeValue },
      },
    });
    expect(providerTokenResult.success).toBe(false);
    if (providerTokenResult.success) return;
    expect(providerTokenResult.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['localContent', 'footerText', 'en'],
        message: 'provider token material is forbidden; use ENV/Secret',
      }),
    );
    expect(providerTokenResult.error.message).not.toContain(secretLikeValue);
  });

  test('rejects environment interpolation in browser-visible product config', () => {
    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        localContent: {
          ...validConfig.localContent,
          footerText: { 'pl-PL': '${PRIVATE_VALUE}', en: 'Public footer' },
        },
      }),
    ).toThrow('environment interpolation is forbidden');
  });

  test('rejects multi-city collections and tenant-scoped configuration', () => {
    expect(() => parseWhiteLabelConfig([validConfig, validConfig])).toThrow(
      'expected object, received array',
    );

    expect(() =>
      parseWhiteLabelConfig({
        schemaVersion: 1,
        configVersion: 'multi-city-2026-01',
        cities: [validConfig.city, { ...validConfig.city, key: 'another_city' }],
        branding: validConfig.branding,
        contact: validConfig.contact,
        localContent: validConfig.localContent,
        services: validConfig.services,
        routing: validConfig.routing,
        map: validConfig.map,
        features: validConfig.features,
      }),
    ).toThrow('Unrecognized key: "cities"');

    expect(() => parseWhiteLabelConfig({ ...validConfig, tenantId: 'tenant-1' })).toThrow(
      'Unrecognized key: "tenantId"',
    );

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        services: [{ ...validConfig.services[0], tenantId: 'tenant-1' }, validConfig.services[1]],
      }),
    ).toThrow('Unrecognized key: "tenantId"');
  });

  test('rejects missing required nullable fields instead of propagating absent values', () => {
    const { description: _description, ...serviceWithoutDescription } = validConfig.services[0];
    const result = safeParseWhiteLabelConfig({
      ...validConfig,
      services: [serviceWithoutDescription, validConfig.services[1]],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['services', 0, 'description']);
  });

  test('requires complete localized branding, contact and local content', () => {
    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        branding: {
          ...validConfig.branding,
          emblemAlt: { 'pl-PL': 'Herb miasta Warszawy' },
        },
      }),
    ).toThrow('$.branding.emblemAlt.en');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        contact: { ...validConfig.contact, email: 'not-an-email' },
      }),
    ).toThrow('$.contact.email');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        localContent: {
          ...validConfig.localContent,
          footerText: { 'pl-PL': 'Tylko po polsku' },
        },
      }),
    ).toThrow('$.localContent.footerText.en');
  });

  test.each([
    ['unsupported locale', { ...validConfig.city, defaultLocale: 'de' }, 'defaultLocale'],
    ['unsupported timezone', { ...validConfig.city, timezone: 'UTC' }, 'timezone'],
    [
      'default locale outside supported locales',
      { ...validConfig.city, supportedLocales: ['en'] },
      'defaultLocale',
    ],
    [
      'duplicate supported locale',
      { ...validConfig.city, supportedLocales: ['pl-PL', 'pl-PL'] },
      'supportedLocales',
    ],
  ])('rejects %s', (_case, city, expectedPath) => {
    expect(() => parseWhiteLabelConfig({ ...validConfig, city })).toThrow(expectedPath);
  });

  test('rejects invalid and duplicate service keys and sort orders', () => {
    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        services: [{ ...validConfig.services[0], key: 'Roads' }, validConfig.services[1]],
      }),
    ).toThrow('must match ^[a-z][a-z0-9_]{1,63}$');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        services: [
          validConfig.services[0],
          { ...validConfig.services[1], key: 'roads', sortOrder: 10 },
        ],
      }),
    ).toThrow('duplicates service key roads');
  });

  test('requires an enabled fallback service and at least one enabled service', () => {
    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        routing: { fallbackServiceKey: 'missing' },
      }),
    ).toThrow('must reference an existing service');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        services: validConfig.services.map((service) => ({ ...service, enabled: false })),
      }),
    ).toThrow('must contain at least one enabled service');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        services: validConfig.services.map((service) =>
          service.key === 'manual_review' ? { ...service, enabled: false } : service,
        ),
      }),
    ).toThrow('must reference an enabled service');
  });

  test('resolves only stable service keys', () => {
    const parsed = parseWhiteLabelConfig(validConfig);

    expect(findCityService(parsed.services, 'roads')?.key).toBe('roads');
    expect(findCityService(parsed.services, 'Zarząd Dróg')).toBeNull();
    expect(findCityService(parsed.services, 'missing')).toBeNull();
    expect(findEnabledCityService(parsed.services, 'roads')?.key).toBe('roads');
  });

  test('validates map coordinates, bounds and provider requirements', () => {
    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        map: { ...validConfig.map, center: { lat: 91, lng: 21 } },
      }),
    ).toThrow('$.map.center.lat');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        map: {
          ...validConfig.map,
          bounds: {
            southWest: { lat: 53, lng: 22 },
            northEast: { lat: 52, lng: 21 },
          },
        },
      }),
    ).toThrow('must be north of southWest.lat');

    expect(() =>
      parseWhiteLabelConfig({
        ...validConfig,
        map: { ...validConfig.map, provider: 'maplibre' },
      }),
    ).toThrow('is required for the maplibre provider');

    expect(() => parseWhiteLabelConfig({ ...validConfig, map: null })).toThrow(
      'is required when features.map is enabled',
    );
  });

  test('validates the strict public response including a SHA-256 checksum', () => {
    const publicConfig = createPublicWhiteLabelConfig(parseWhiteLabelConfig(validConfig));
    expect(
      parsePublicCityConfigResponse({
        configVersion: validConfig.configVersion,
        checksum: 'a'.repeat(64),
        config: publicConfig,
      }),
    ).toEqual({
      configVersion: validConfig.configVersion,
      checksum: 'a'.repeat(64),
      config: publicConfig,
    });

    expect(() =>
      parsePublicCityConfigResponse({
        configVersion: validConfig.configVersion,
        checksum: 'not-a-checksum',
        config: publicConfig,
      }),
    ).toThrow(WhiteLabelConfigValidationError);

    expect(publicConfig.routing).toEqual(validConfig.routing);
  });
});
