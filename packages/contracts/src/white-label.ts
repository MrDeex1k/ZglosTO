import { z } from 'zod';

export const WHITE_LABEL_DEPLOYMENT_MODEL = 'single-city' as const;
export type WhiteLabelDeploymentModel = typeof WHITE_LABEL_DEPLOYMENT_MODEL;

export const WHITE_LABEL_SCHEMA_VERSION = 1 as const;

export const SUPPORTED_LOCALES = ['pl-PL', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'pl-PL';
export const DEPLOYMENT_TIMEZONE = 'Europe/Warsaw' as const;
export const supportedLocaleSchema = z.enum(SUPPORTED_LOCALES);
export const localizedTextSchema = z.strictObject({
  'pl-PL': z.string().trim().min(1),
  en: z.string().trim().min(1),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export function parseSupportedLocale(value: unknown): SupportedLocale {
  return supportedLocaleSchema.parse(value);
}

export const MAP_PROVIDERS = ['osm', 'maplibre', 'google'] as const;
export type MapProvider = (typeof MAP_PROVIDERS)[number];

export const CITY_SERVICE_ICON_KEYS = [
  'bus',
  'circle_help',
  'greenery',
  'lighting',
  'road',
  'safety',
  'trash',
  'utilities',
  'water',
] as const;
export type CityServiceIconKey = (typeof CITY_SERVICE_ICON_KEYS)[number];

const technicalKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,63}$/, 'must match ^[a-z][a-z0-9_]{1,63}$');

const nonEmptyTextSchema = z.string().trim().min(1);
const nullableNonEmptyTextSchema = nonEmptyTextSchema.nullable();
const assetLocationSchema = z
  .string()
  .refine(
    (value) =>
      (value.startsWith('/') && !value.startsWith('//')) || /^https?:\/\/[^\s]+$/.test(value),
    { message: 'must be a root-relative path or an HTTP(S) URL' },
  );

const nullableAssetLocationSchema = assetLocationSchema.nullable();
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB color');
const publicEmailSchema = z.email().max(254);
const publicPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,32}$/, 'must be a public phone number')
  .nullable();
const publicWebsiteSchema = z
  .url()
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
    message: 'must be an HTTP(S) URL',
  })
  .nullable();

const FORBIDDEN_WHITE_LABEL_FIELD_NAMES = new Set([
  'accesstoken',
  'apikey',
  'authsecret',
  'bearertoken',
  'clientsecret',
  'connectionstring',
  'credentials',
  'databaseurl',
  'encryptionkey',
  'encryptionsecret',
  'hftoken',
  'jwtsecret',
  'oauthclientsecret',
  'password',
  'passwd',
  'privatekey',
  'refreshtoken',
  's3secretaccesskey',
  'secret',
  'secretaccesskey',
  'secretkey',
  'sessionsecret',
  'signingkey',
  'signingsecret',
  'smtppassword',
  'token',
  'webhooksecret',
]);

const SECRET_VALUE_PATTERNS = [
  {
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
    message: 'private key material is forbidden; use ENV/Secret',
  },
  {
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    message: 'cloud access credentials are forbidden; use ENV/Secret',
  },
  {
    pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/,
    message: 'provider credentials are forbidden; use ENV/Secret',
  },
  {
    pattern: /\b(?:gh[pousr]_|glpat-|sk-(?:proj-|live-|test-)?)[A-Za-z0-9_-]{16,}\b/,
    message: 'provider token material is forbidden; use ENV/Secret',
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    message: 'signed token material is forbidden; use ENV/Secret',
  },
  {
    pattern: /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
    message: 'URL credentials are forbidden; use ENV/Secret',
  },
  {
    pattern: /\$\{[^}\r\n]+\}/,
    message: 'environment interpolation is forbidden; configure the owning service via ENV/Secret',
  },
] as const;

function normalizeSecurityFieldName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function validateNoWhiteLabelSecrets(
  value: unknown,
  context: z.RefinementCtx,
  path: PropertyKey[] = [],
): void {
  if (typeof value === 'string') {
    const violation = SECRET_VALUE_PATTERNS.find(({ pattern }) => pattern.test(value)) ?? null;
    if (violation !== null) {
      context.addIssue({ code: 'custom', path, message: violation.message });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoWhiteLabelSecrets(item, context, [...path, index]));
    return;
  }

  if (typeof value !== 'object' || value === null) return;

  Object.entries(value).forEach(([fieldName, fieldValue]) => {
    const fieldPath = [...path, fieldName];
    if (FORBIDDEN_WHITE_LABEL_FIELD_NAMES.has(normalizeSecurityFieldName(fieldName))) {
      context.addIssue({
        code: 'custom',
        path: fieldPath,
        message: 'secret-bearing fields are forbidden; use ENV/Secret',
      });
    }
    validateNoWhiteLabelSecrets(fieldValue, context, fieldPath);
  });
}

export const citySchema = z
  .strictObject({
    key: technicalKeySchema,
    displayName: localizedTextSchema,
    defaultLocale: supportedLocaleSchema,
    supportedLocales: z.array(supportedLocaleSchema).min(1),
    timezone: z.literal(DEPLOYMENT_TIMEZONE),
  })
  .superRefine((city, context) => {
    const uniqueLocales = new Set(city.supportedLocales);
    if (uniqueLocales.size !== city.supportedLocales.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedLocales'],
        message: 'must not contain duplicate locales',
      });
    }

    if (!uniqueLocales.has(city.defaultLocale)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultLocale'],
        message: 'must be present in supportedLocales',
      });
    }
  });

export const brandingSchema = z.strictObject({
  logoPath: assetLocationSchema,
  emblemAlt: localizedTextSchema,
  faviconPath: assetLocationSchema,
  colors: z.strictObject({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    accent: hexColorSchema,
  }),
});

export const publicContactSchema = z.strictObject({
  email: publicEmailSchema,
  phone: publicPhoneSchema,
  website: publicWebsiteSchema,
  address: localizedTextSchema,
  officeHours: localizedTextSchema.nullable(),
});

export const localContentSchema = z.strictObject({
  siteTitle: localizedTextSchema,
  siteDescription: localizedTextSchema,
  footerText: localizedTextSchema,
  legalNotice: localizedTextSchema,
  reportAddressPlaceholder: localizedTextSchema,
});

export const cityServiceSchema = z.strictObject({
  key: technicalKeySchema,
  label: localizedTextSchema,
  shortLabel: localizedTextSchema,
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0),
  iconKey: z.enum(CITY_SERVICE_ICON_KEYS),
  description: localizedTextSchema.nullable(),
  color: hexColorSchema.nullable(),
});

export const routingSchema = z.strictObject({
  fallbackServiceKey: technicalKeySchema,
});

export const geoPointSchema = z.strictObject({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export const mapBoundsSchema = z
  .strictObject({
    southWest: geoPointSchema,
    northEast: geoPointSchema,
  })
  .superRefine((bounds, context) => {
    if (bounds.southWest.lat >= bounds.northEast.lat) {
      context.addIssue({
        code: 'custom',
        path: ['northEast', 'lat'],
        message: 'must be north of southWest.lat',
      });
    }

    if (bounds.southWest.lng >= bounds.northEast.lng) {
      context.addIssue({
        code: 'custom',
        path: ['northEast', 'lng'],
        message: 'must be east of southWest.lng',
      });
    }
  });

export const mapSchema = z
  .strictObject({
    provider: z.enum(MAP_PROVIDERS),
    center: geoPointSchema,
    zoom: z.number().int().min(1).max(22),
    bounds: mapBoundsSchema.nullable(),
    tilesUrl: nullableAssetLocationSchema,
    attribution: nullableNonEmptyTextSchema,
  })
  .superRefine((map, context) => {
    if (map.provider === 'maplibre' && map.tilesUrl === null) {
      context.addIssue({
        code: 'custom',
        path: ['tilesUrl'],
        message: 'is required for the maplibre provider',
      });
    }

    if (map.tilesUrl !== null && map.attribution === null) {
      context.addIssue({
        code: 'custom',
        path: ['attribution'],
        message: 'is required when tilesUrl is configured',
      });
    }
  });

export const featureFlagsSchema = z.strictObject({
  map: z.boolean(),
  llmClassification: z.boolean(),
  anonymousReports: z.boolean(),
});

const whiteLabelConfigShape = {
  schemaVersion: z.literal(WHITE_LABEL_SCHEMA_VERSION),
  configVersion: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/, 'must be a lowercase version identifier'),
  city: citySchema,
  branding: brandingSchema,
  contact: publicContactSchema,
  localContent: localContentSchema,
  services: z.array(cityServiceSchema).min(1),
  routing: routingSchema,
  map: mapSchema.nullable(),
  features: featureFlagsSchema,
} as const;

function validateWhiteLabelRelations(
  config: {
    services: z.infer<typeof cityServiceSchema>[];
    routing: z.infer<typeof routingSchema>;
    map: z.infer<typeof mapSchema> | null;
    features: z.infer<typeof featureFlagsSchema>;
  },
  context: z.RefinementCtx,
): void {
  const serviceKeys = new Set<string>();
  const sortOrders = new Set<number>();

  config.services.forEach((service, index) => {
    if (serviceKeys.has(service.key)) {
      context.addIssue({
        code: 'custom',
        path: ['services', index, 'key'],
        message: `duplicates service key ${service.key}`,
      });
    }
    serviceKeys.add(service.key);

    if (sortOrders.has(service.sortOrder)) {
      context.addIssue({
        code: 'custom',
        path: ['services', index, 'sortOrder'],
        message: `duplicates sortOrder ${service.sortOrder}`,
      });
    }
    sortOrders.add(service.sortOrder);
  });

  if (!config.services.some((service) => service.enabled)) {
    context.addIssue({
      code: 'custom',
      path: ['services'],
      message: 'must contain at least one enabled service',
    });
  }

  const fallbackService = config.services.find(
    (service) => service.key === config.routing.fallbackServiceKey,
  );
  if (!fallbackService) {
    context.addIssue({
      code: 'custom',
      path: ['routing', 'fallbackServiceKey'],
      message: 'must reference an existing service',
    });
  } else if (!fallbackService.enabled) {
    context.addIssue({
      code: 'custom',
      path: ['routing', 'fallbackServiceKey'],
      message: 'must reference an enabled service',
    });
  }

  if (config.features.map && config.map === null) {
    context.addIssue({
      code: 'custom',
      path: ['map'],
      message: 'is required when features.map is enabled',
    });
  }
}

const structuralWhiteLabelConfigSchema = z
  .strictObject(whiteLabelConfigShape)
  .superRefine(validateWhiteLabelRelations);

export const whiteLabelConfigSchema = z
  .unknown()
  .superRefine(validateNoWhiteLabelSecrets)
  .pipe(structuralWhiteLabelConfigSchema);

export const publicCityServiceSchema = cityServiceSchema.extend({
  enabled: z.literal(true),
});

const publicWhiteLabelConfigShape = {
  schemaVersion: whiteLabelConfigShape.schemaVersion,
  configVersion: whiteLabelConfigShape.configVersion,
  city: whiteLabelConfigShape.city,
  branding: whiteLabelConfigShape.branding,
  contact: whiteLabelConfigShape.contact,
  localContent: whiteLabelConfigShape.localContent,
  services: z.array(publicCityServiceSchema).min(1),
  routing: whiteLabelConfigShape.routing,
  map: whiteLabelConfigShape.map,
  features: whiteLabelConfigShape.features,
} as const;

// This is an explicit allowlist. Private settings added to the deployment schema do
// not become part of the public API unless they are deliberately added here too.
export const publicWhiteLabelConfigSchema = z
  .unknown()
  .superRefine(validateNoWhiteLabelSecrets)
  .pipe(
    z.strictObject(publicWhiteLabelConfigShape).superRefine((config, context) => {
      const serviceKeys = new Set<string>();
      const sortOrders = new Set<number>();
      config.services.forEach((service, index) => {
        if (serviceKeys.has(service.key)) {
          context.addIssue({
            code: 'custom',
            path: ['services', index, 'key'],
            message: `duplicates service key ${service.key}`,
          });
        }
        serviceKeys.add(service.key);

        if (sortOrders.has(service.sortOrder)) {
          context.addIssue({
            code: 'custom',
            path: ['services', index, 'sortOrder'],
            message: `duplicates sortOrder ${service.sortOrder}`,
          });
        }
        sortOrders.add(service.sortOrder);
      });

      if (!serviceKeys.has(config.routing.fallbackServiceKey)) {
        context.addIssue({
          code: 'custom',
          path: ['routing', 'fallbackServiceKey'],
          message: 'must reference a public enabled service',
        });
      }

      if (config.features.map && config.map === null) {
        context.addIssue({
          code: 'custom',
          path: ['map'],
          message: 'is required when features.map is enabled',
        });
      }
    }),
  );

export const publicCityConfigResponseSchema = z.strictObject({
  configVersion: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/, 'must be a lowercase version identifier'),
  checksum: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase SHA-256 checksum'),
  config: publicWhiteLabelConfigSchema,
});

export type City = z.infer<typeof citySchema>;
export type Branding = z.infer<typeof brandingSchema>;
export type PublicContact = z.infer<typeof publicContactSchema>;
export type LocalContent = z.infer<typeof localContentSchema>;
export type CityService = z.infer<typeof cityServiceSchema>;
export type GeoPoint = z.infer<typeof geoPointSchema>;
export type MapBounds = z.infer<typeof mapBoundsSchema>;
export type MapConfig = z.infer<typeof mapSchema>;
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;
export type WhiteLabelConfig = z.infer<typeof whiteLabelConfigSchema>;
export type PublicWhiteLabelConfig = z.infer<typeof publicWhiteLabelConfigSchema>;
export type PublicCityConfigResponse = z.infer<typeof publicCityConfigResponseSchema>;

// Compatibility alias for consumers prepared during Phase 1.
export type CityConfig = WhiteLabelConfig;

export function findCityService(
  services: readonly CityService[],
  value: string,
): CityService | null {
  return services.find((service) => service.key === value) ?? null;
}

export function findEnabledCityService(
  services: readonly CityService[],
  value: string,
): CityService | null {
  const service = findCityService(services, value);
  return service?.enabled === true ? service : null;
}

function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) return '$';
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`;
    return result === '$' ? `$.${String(segment)}` : `${result}.${String(segment)}`;
  }, '$');
}

export function formatWhiteLabelValidationError(error: z.ZodError): string {
  return error.issues.map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`).join('; ');
}

export class WhiteLabelConfigValidationError extends Error {
  constructor(error: z.ZodError) {
    super(`Invalid White-Label config: ${formatWhiteLabelValidationError(error)}`);
    this.name = 'WhiteLabelConfigValidationError';
  }
}

export function safeParseWhiteLabelConfig(value: unknown) {
  return whiteLabelConfigSchema.safeParse(value);
}

export function parseWhiteLabelConfig(value: unknown): WhiteLabelConfig {
  const result = safeParseWhiteLabelConfig(value);
  if (!result.success) throw new WhiteLabelConfigValidationError(result.error);
  return result.data;
}

export function safeParsePublicWhiteLabelConfig(value: unknown) {
  return publicWhiteLabelConfigSchema.safeParse(value);
}

export function parsePublicWhiteLabelConfig(value: unknown): PublicWhiteLabelConfig {
  const result = safeParsePublicWhiteLabelConfig(value);
  if (!result.success) throw new WhiteLabelConfigValidationError(result.error);
  return result.data;
}

export function createPublicWhiteLabelConfig(config: WhiteLabelConfig): PublicWhiteLabelConfig {
  return parsePublicWhiteLabelConfig({
    schemaVersion: config.schemaVersion,
    configVersion: config.configVersion,
    city: config.city,
    branding: config.branding,
    contact: config.contact,
    localContent: config.localContent,
    services: config.services.filter((service) => service.enabled),
    routing: config.routing,
    map: config.map,
    features: config.features,
  });
}

export function parsePublicCityConfigResponse(value: unknown): PublicCityConfigResponse {
  const result = publicCityConfigResponseSchema.safeParse(value);
  if (!result.success) throw new WhiteLabelConfigValidationError(result.error);
  return result.data;
}
