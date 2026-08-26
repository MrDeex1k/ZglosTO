import { z } from 'zod';
import {
  ClientAddressEnvironmentSchema,
  HomepageCacheEnvironmentSchema,
  IncidentRateLimitEnvironmentSchema,
  RedisConnectionEnvironmentSchema,
  RedisModeSchema,
  type ClientAddressEnvironment,
  type HomepageCacheEnvironment,
  type IncidentRateLimitEnvironment,
  type RedisConnectionEnvironment,
  type RedisMode,
} from '@zglosto/contracts';

const RequiredStringSchema = z.string().trim().min(1);

const AuthorizationEnvironmentSchema = z
  .object({
    caPath: RequiredStringSchema,
    certificatePath: RequiredStringSchema,
    privateKeyPath: RequiredStringSchema,
    serverName: RequiredStringSchema,
    timeoutMs: z.number().int().positive(),
    url: z.url(),
  })
  .strict();

export type AuthorizationEnvironment = z.infer<typeof AuthorizationEnvironmentSchema>;

const ObjectStorageEnvironmentSchema = z
  .object({
    accessKeyId: RequiredStringSchema,
    autoCreateBucket: z.boolean(),
    bucket: RequiredStringSchema,
    endpoint: z.url(),
    forcePathStyle: z.boolean(),
    objectPrefix: z.string(),
    publicEndpoint: z.url(),
    region: RequiredStringSchema,
    secretAccessKey: RequiredStringSchema,
    uploadExpirySeconds: z.number().int().min(60).max(3_600),
  })
  .strict();

export type ObjectStorageEnvironment = z.infer<typeof ObjectStorageEnvironmentSchema>;

const DatabaseConnectionEnvironmentSchema = z
  .object({
    connectionTimeoutMs: z.number().int().positive(),
    idleTimeoutMs: z.number().int().positive(),
    poolMax: z.number().int().positive(),
    tlsCaPath: RequiredStringSchema,
    url: z.url(),
  })
  .strict();

export type DatabaseConnectionEnvironment = z.infer<typeof DatabaseConnectionEnvironmentSchema>;

const LlmEnvironmentSchema = z
  .object({
    caPath: RequiredStringSchema,
    certificatePath: RequiredStringSchema,
    gatewayUrl: z.url(),
    hmacKeyFile: RequiredStringSchema,
    hmacKeyId: RequiredStringSchema.regex(/^[A-Za-z0-9._-]{1,64}$/),
    privateKeyPath: RequiredStringSchema,
    serverName: RequiredStringSchema,
    timeoutMs: z.number().int().positive(),
  })
  .strict();

export type LlmEnvironment = z.infer<typeof LlmEnvironmentSchema>;

const RabbitMqEnvironmentSchema = z
  .object({
    batchSize: z.number().int().min(1).max(500),
    heartbeatSeconds: z.number().int().positive(),
    lockTimeoutMs: z.number().int().positive(),
    pollIntervalMs: z.number().int().positive(),
    publisherEnabled: z.boolean(),
    reconnectDelayMs: z.number().int().positive(),
    serverName: RequiredStringSchema,
    tlsCaPath: RequiredStringSchema,
    url: z.url(),
  })
  .strict();

export type RabbitMqEnvironment = z.infer<typeof RabbitMqEnvironmentSchema>;

export const BackendEnvironmentSchema = z
  .object({
    authorization: AuthorizationEnvironmentSchema,
    clientAddress: ClientAddressEnvironmentSchema,
    databaseTlsCaPath: RequiredStringSchema,
    frontendOrigin: z.url(),
    homepageCache: HomepageCacheEnvironmentSchema,
    incidentRateLimit: IncidentRateLimitEnvironmentSchema,
    llmGatewayUrl: z.url(),
    llmTimeoutMs: z.number().int().positive(),
    objectStorage: ObjectStorageEnvironmentSchema,
    port: z.number().int().positive().max(65_535),
    rabbitMq: RabbitMqEnvironmentSchema,
    redis: RedisConnectionEnvironmentSchema,
  })
  .strict();

export type BackendEnvironment = z.infer<typeof BackendEnvironmentSchema>;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function validUrl(name: string, value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Environment variable ${name} must be a valid URL`);
  }
}

function validDatabaseUrl(name: string, value: string): string {
  const url = validUrl(name, value);
  const parsed = new URL(url);
  const protocol = parsed.protocol;
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`Environment variable ${name} must use postgres:// or postgresql://`);
  }
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    if (parsed.searchParams.has(parameter)) {
      throw new Error(
        `Environment variable ${name} must not override managed TLS parameter ${parameter}`,
      );
    }
  }
  return url;
}

function validHttpsUrl(name: string, value: string): string {
  const url = validUrl(name, value);
  if (new URL(url).protocol !== 'https:') {
    throw new Error(`Environment variable ${name} must use https://`);
  }
  return url;
}

function validAmqpsUrl(name: string, value: string): string {
  const url = validUrl(name, value);
  if (new URL(url).protocol !== 'amqps:') {
    throw new Error(`Environment variable ${name} must use amqps://`);
  }
  return url;
}

function validTlsServerName(name: string, value: string): string {
  if (
    value === 'localhost' ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(value)
  ) {
    return value;
  }
  throw new Error(`Environment variable ${name} must be a valid DNS name`);
}

function positiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

function redisMode(): RedisMode {
  const value = process.env.REDIS_MODE?.trim() || 'disabled';
  const result = RedisModeSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Environment variable REDIS_MODE must be one of: disabled, local, external');
  }
  return result.data;
}

function booleanValue(name: string, value: string): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`Environment variable ${name} must be true or false`);
}

function validBucketName(value: string): string {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) || value.includes('..')) {
    throw new Error('Environment variable S3_BUCKET must be a valid S3 bucket name');
  }
  return value;
}

function validObjectPrefix(value: string): string {
  const normalized = value.replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Environment variable S3_OBJECT_PREFIX cannot contain parent segments');
  }
  return normalized;
}

export function validateDatabaseConnectionEnvironment(): DatabaseConnectionEnvironment {
  return DatabaseConnectionEnvironmentSchema.parse({
    connectionTimeoutMs: positiveInteger(
      'DATABASE_CONNECTION_TIMEOUT_MS',
      process.env.DATABASE_CONNECTION_TIMEOUT_MS?.trim() || '5000',
    ),
    idleTimeoutMs: positiveInteger(
      'DATABASE_IDLE_TIMEOUT_MS',
      process.env.DATABASE_IDLE_TIMEOUT_MS?.trim() || '30000',
    ),
    poolMax: positiveInteger('DATABASE_POOL_MAX', process.env.DATABASE_POOL_MAX?.trim() || '10'),
    tlsCaPath: required('DATABASE_TLS_CA_PATH'),
    url: validDatabaseUrl('DATABASE_URL', required('DATABASE_URL')),
  });
}

export function validateAuthorizationEnvironment(): AuthorizationEnvironment {
  return AuthorizationEnvironmentSchema.parse({
    caPath: required('AUTH_SERVICE_CA_PATH'),
    certificatePath: required('AUTH_SERVICE_CERT_PATH'),
    privateKeyPath: required('AUTH_SERVICE_KEY_PATH'),
    serverName: validTlsServerName(
      'AUTH_SERVICE_SERVER_NAME',
      required('AUTH_SERVICE_SERVER_NAME'),
    ),
    timeoutMs: positiveInteger(
      'AUTH_SERVICE_TIMEOUT_MS',
      process.env.AUTH_SERVICE_TIMEOUT_MS?.trim() || '5000',
    ),
    url: validHttpsUrl('AUTH_SERVICE_URL', required('AUTH_SERVICE_URL')),
  });
}

export function validateLlmEnvironment(): LlmEnvironment {
  return LlmEnvironmentSchema.parse({
    caPath: required('LLM_GATEWAY_CA_PATH'),
    certificatePath: required('LLM_GATEWAY_CERT_PATH'),
    gatewayUrl: validHttpsUrl('LLM_GATEWAY_URL', required('LLM_GATEWAY_URL')),
    hmacKeyFile: required('LLM_GATEWAY_HMAC_KEY_FILE'),
    hmacKeyId: required('LLM_GATEWAY_HMAC_KEY_ID'),
    privateKeyPath: required('LLM_GATEWAY_KEY_PATH'),
    serverName: validTlsServerName('LLM_GATEWAY_SERVER_NAME', required('LLM_GATEWAY_SERVER_NAME')),
    timeoutMs: positiveInteger('LLM_TIMEOUT_MS', required('LLM_TIMEOUT_MS')),
  });
}

export function validateRabbitMqEnvironment(): RabbitMqEnvironment {
  return RabbitMqEnvironmentSchema.parse({
    batchSize: positiveInteger('OUTBOX_BATCH_SIZE', process.env.OUTBOX_BATCH_SIZE?.trim() || '25'),
    heartbeatSeconds: positiveInteger(
      'RABBITMQ_HEARTBEAT_SECONDS',
      process.env.RABBITMQ_HEARTBEAT_SECONDS?.trim() || '30',
    ),
    lockTimeoutMs: positiveInteger(
      'OUTBOX_LOCK_TIMEOUT_MS',
      process.env.OUTBOX_LOCK_TIMEOUT_MS?.trim() || '30000',
    ),
    pollIntervalMs: positiveInteger(
      'OUTBOX_POLL_INTERVAL_MS',
      process.env.OUTBOX_POLL_INTERVAL_MS?.trim() || '1000',
    ),
    publisherEnabled: booleanValue(
      'RABBITMQ_PUBLISHER_ENABLED',
      process.env.RABBITMQ_PUBLISHER_ENABLED?.trim() || 'true',
    ),
    reconnectDelayMs: positiveInteger(
      'RABBITMQ_RECONNECT_DELAY_MS',
      process.env.RABBITMQ_RECONNECT_DELAY_MS?.trim() || '1000',
    ),
    serverName: validTlsServerName('RABBITMQ_SERVER_NAME', required('RABBITMQ_SERVER_NAME')),
    tlsCaPath: required('RABBITMQ_TLS_CA_PATH'),
    url: validAmqpsUrl('RABBITMQ_URL', required('RABBITMQ_URL')),
  });
}

export function validateObjectStorageEnvironment(): ObjectStorageEnvironment {
  const endpoint = validUrl('S3_ENDPOINT', required('S3_ENDPOINT'));
  const configuredPublicEndpoint = process.env.S3_PUBLIC_ENDPOINT?.trim();
  const publicEndpoint =
    configuredPublicEndpoint == null || configuredPublicEndpoint === ''
      ? process.env.SERVICE_NAME === 'media_worker'
        ? endpoint
        : validUrl('S3_PUBLIC_ENDPOINT', required('S3_PUBLIC_ENDPOINT'))
      : validUrl('S3_PUBLIC_ENDPOINT', configuredPublicEndpoint);

  return ObjectStorageEnvironmentSchema.parse({
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    autoCreateBucket: booleanValue(
      'S3_AUTO_CREATE_BUCKET',
      process.env.S3_AUTO_CREATE_BUCKET?.trim() || 'false',
    ),
    bucket: validBucketName(required('S3_BUCKET')),
    endpoint,
    forcePathStyle: booleanValue('S3_FORCE_PATH_STYLE', required('S3_FORCE_PATH_STYLE')),
    objectPrefix: validObjectPrefix(process.env.S3_OBJECT_PREFIX?.trim() || ''),
    publicEndpoint,
    region: required('S3_REGION'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    uploadExpirySeconds: positiveInteger(
      'S3_UPLOAD_EXPIRY_SECONDS',
      process.env.S3_UPLOAD_EXPIRY_SECONDS?.trim() || '300',
    ),
  });
}

export function validateRedisConnectionEnvironment(): RedisConnectionEnvironment {
  const mode = redisMode();
  const configuredUrlFile = optional('REDIS_URL_FILE');
  const configuredTlsCaPath = optional('REDIS_TLS_CA_PATH');
  const configuredIdentityHmacKeyFile = optional('RATE_LIMIT_HMAC_KEY_FILE');

  if (
    mode === 'disabled' &&
    (configuredUrlFile !== null ||
      configuredTlsCaPath !== null ||
      configuredIdentityHmacKeyFile !== null)
  ) {
    throw new Error(
      'Redis secrets and RATE_LIMIT_HMAC_KEY_FILE must not be set when REDIS_MODE=disabled',
    );
  }

  if (
    mode !== 'disabled' &&
    (configuredUrlFile === null || configuredIdentityHmacKeyFile === null)
  ) {
    throw new Error(
      `REDIS_URL_FILE and RATE_LIMIT_HMAC_KEY_FILE are required when REDIS_MODE=${mode}`,
    );
  }

  return RedisConnectionEnvironmentSchema.parse({
    commandTimeoutMs: positiveInteger(
      'REDIS_COMMAND_TIMEOUT_MS',
      process.env.REDIS_COMMAND_TIMEOUT_MS?.trim() || '500',
    ),
    connectTimeoutMs: positiveInteger(
      'REDIS_CONNECT_TIMEOUT_MS',
      process.env.REDIS_CONNECT_TIMEOUT_MS?.trim() || '1000',
    ),
    identityHmacKeyFile: mode === 'disabled' ? null : configuredIdentityHmacKeyFile,
    keyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || 'zglosto',
    mode,
    tlsCaPath: mode === 'disabled' ? null : configuredTlsCaPath,
    urlFile: mode === 'disabled' ? null : configuredUrlFile,
  });
}

export function validateHomepageCacheEnvironment(): HomepageCacheEnvironment {
  return HomepageCacheEnvironmentSchema.parse({
    nginxDisabledTtlSeconds: positiveInteger(
      'HOMEPAGE_NGINX_DISABLED_TTL_SECONDS',
      process.env.HOMEPAGE_NGINX_DISABLED_TTL_SECONDS?.trim() || '900',
    ),
    nginxMicrocacheSeconds: positiveInteger(
      'HOMEPAGE_NGINX_MICROCACHE_SECONDS',
      process.env.HOMEPAGE_NGINX_MICROCACHE_SECONDS?.trim() || '30',
    ),
    ttlSeconds: positiveInteger(
      'HOMEPAGE_CACHE_TTL_SECONDS',
      process.env.HOMEPAGE_CACHE_TTL_SECONDS?.trim() || '900',
    ),
  });
}

export function validateClientAddressEnvironment(): ClientAddressEnvironment {
  return ClientAddressEnvironmentSchema.parse({
    trustedProxyHops: positiveInteger(
      'CLIENT_IP_TRUSTED_PROXY_HOPS',
      process.env.CLIENT_IP_TRUSTED_PROXY_HOPS?.trim() || '1',
    ),
  });
}

export function validateIncidentRateLimitEnvironment(): IncidentRateLimitEnvironment {
  return IncidentRateLimitEnvironmentSchema.parse({
    global: {
      maxRequests: positiveInteger(
        'INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS',
        process.env.INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS?.trim() || '300',
      ),
      windowMs: positiveInteger(
        'INCIDENT_GLOBAL_RATE_LIMIT_WINDOW_MS',
        process.env.INCIDENT_GLOBAL_RATE_LIMIT_WINDOW_MS?.trim() || '60000',
      ),
    },
    ip: {
      maxRequests: positiveInteger(
        'INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS',
        process.env.INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS?.trim() || '10',
      ),
      windowMs: positiveInteger(
        'INCIDENT_IP_RATE_LIMIT_WINDOW_MS',
        process.env.INCIDENT_IP_RATE_LIMIT_WINDOW_MS?.trim() || '900000',
      ),
    },
    local: {
      cleanupIntervalMs: positiveInteger(
        'INCIDENT_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS',
        process.env.INCIDENT_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS?.trim() || '60000',
      ),
      maxKeys: positiveInteger(
        'INCIDENT_LOCAL_RATE_LIMIT_MAX_KEYS',
        process.env.INCIDENT_LOCAL_RATE_LIMIT_MAX_KEYS?.trim() || '50000',
      ),
      maxRequests: positiveInteger(
        'INCIDENT_LOCAL_RATE_LIMIT_MAX_REQUESTS',
        process.env.INCIDENT_LOCAL_RATE_LIMIT_MAX_REQUESTS?.trim() || '5',
      ),
      windowMs: positiveInteger(
        'INCIDENT_LOCAL_RATE_LIMIT_WINDOW_MS',
        process.env.INCIDENT_LOCAL_RATE_LIMIT_WINDOW_MS?.trim() || '10000',
      ),
    },
    user: {
      maxRequests: positiveInteger(
        'INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS',
        process.env.INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS?.trim() || '20',
      ),
      windowMs: positiveInteger(
        'INCIDENT_USER_RATE_LIMIT_WINDOW_MS',
        process.env.INCIDENT_USER_RATE_LIMIT_WINDOW_MS?.trim() || '900000',
      ),
    },
  });
}

export function validateBackendEnvironment(): BackendEnvironment {
  const database = validateDatabaseConnectionEnvironment();

  return BackendEnvironmentSchema.parse({
    authorization: validateAuthorizationEnvironment(),
    clientAddress: validateClientAddressEnvironment(),
    databaseTlsCaPath: database.tlsCaPath,
    frontendOrigin: validUrl('FRONTEND_ORIGIN', required('FRONTEND_ORIGIN')),
    homepageCache: validateHomepageCacheEnvironment(),
    incidentRateLimit: validateIncidentRateLimitEnvironment(),
    llmGatewayUrl: validateLlmEnvironment().gatewayUrl,
    llmTimeoutMs: positiveInteger('LLM_TIMEOUT_MS', required('LLM_TIMEOUT_MS')),
    objectStorage: validateObjectStorageEnvironment(),
    port: positiveInteger('BACKEND_PORT', process.env.BACKEND_PORT?.trim() || '3000'),
    rabbitMq: validateRabbitMqEnvironment(),
    redis: validateRedisConnectionEnvironment(),
  });
}
