import { parsePublicCityConfigResponse } from '@zglosto/contracts';

export const publicConfigFixture = parsePublicCityConfigResponse({
  checksum: 'a'.repeat(64),
  configVersion: 'mobile-test-1',
  config: {
    branding: {
      colors: { accent: '#15803d', primary: '#b91c1c', secondary: '#273449' },
      emblemAlt: { en: 'Test city emblem', 'pl-PL': 'Herb miasta testowego' },
      faviconPath: '/favicon.svg',
      logoPath: '/logo.svg',
    },
    city: {
      defaultLocale: 'pl-PL',
      displayName: { en: 'Test City', 'pl-PL': 'Miasto Testowe' },
      key: 'test_city',
      supportedLocales: ['pl-PL', 'en'],
      timezone: 'Europe/Warsaw',
    },
    configVersion: 'mobile-test-1',
    contact: {
      address: { en: 'Test address', 'pl-PL': 'Adres testowy' },
      email: 'office@example.test',
      officeHours: null,
      phone: null,
      website: 'https://example.test',
    },
    features: { anonymousReports: true, llmClassification: false, map: false },
    localContent: {
      footerText: { en: 'Thank you', 'pl-PL': 'Dziękujemy' },
      legalNotice: { en: 'Legal notice', 'pl-PL': 'Informacja prawna' },
      reportAddressPlaceholder: { en: 'Address', 'pl-PL': 'Adres' },
      siteDescription: { en: 'Test description', 'pl-PL': 'Opis testowy' },
      siteTitle: { en: 'Report it', 'pl-PL': 'Zgłoś to' },
    },
    map: null,
    routing: { fallbackServiceKey: 'other' },
    schemaVersion: 1,
    services: [
      {
        color: null,
        description: null,
        enabled: true,
        iconKey: 'circle_help',
        key: 'other',
        label: { en: 'Other', 'pl-PL': 'Inne' },
        shortLabel: { en: 'Other', 'pl-PL': 'Inne' },
        sortOrder: 0,
      },
    ],
  },
});
