import { beforeEach, expect, test } from 'vitest';
import {
  BackendEnvironmentSchema,
  validateAuthorizationEnvironment,
  validateBackendEnvironment,
  validateClientAddressEnvironment,
  validateDatabaseConnectionEnvironment,
  validateHomepageCacheEnvironment,
  validateIncidentRateLimitEnvironment,
  validateObjectStorageEnvironment,
  validateRabbitMqEnvironment,
  validateRedisConnectionEnvironment,
} from './env.ts';

beforeEach(() => {
  delete process.env.DATABASE_CONNECTION_TIMEOUT_MS;
  delete process.env.DATABASE_IDLE_TIMEOUT_MS;
  delete process.env.DATABASE_POOL_MAX;
  delete process.env.CLIENT_IP_TRUSTED_PROXY_HOPS;
  delete process.env.REDIS_MODE;
  delete process.env.REDIS_URL_FILE;
  delete process.env.REDIS_TLS_CA_PATH;
  delete process.env.REDIS_CONNECT_TIMEOUT_MS;
  delete process.env.REDIS_COMMAND_TIMEOUT_MS;
  delete process.env.REDIS_KEY_PREFIX;
  delete process.env.RATE_LIMIT_HMAC_KEY_FILE;
  delete process.env.HOMEPAGE_CACHE_TTL_SECONDS;
  delete process.env.HOMEPAGE_NGINX_MICROCACHE_SECONDS;
  delete process.env.HOMEPAGE_NGINX_DISABLED_TTL_SECONDS;
  delete process.env.INCIDENT_LOCAL_RATE_LIMIT_WINDOW_MS;
  delete process.env.INCIDENT_LOCAL_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.INCIDENT_LOCAL_RATE_LIMIT_MAX_KEYS;
  delete process.env.INCIDENT_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS;
  delete process.env.INCIDENT_IP_RATE_LIMIT_WINDOW_MS;
  delete process.env.INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.INCIDENT_USER_RATE_LIMIT_WINDOW_MS;
  delete process.env.INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.INCIDENT_GLOBAL_RATE_LIMIT_WINDOW_MS;
  delete process.env.INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.SERVICE_NAME;
  process.env.DATABASE_URL = 'postgresql://app:secret@database:54325/zglosto_db';
  process.env.DATABASE_TLS_CA_PATH = '/run/secrets/database/ca.crt';
  process.env.AUTH_SERVICE_URL = 'https://authorization:9956';
  process.env.AUTH_SERVICE_CA_PATH = '/run/secrets/service/ca.crt';
  process.env.AUTH_SERVICE_CERT_PATH = '/run/secrets/service/backend-client.crt';
  process.env.AUTH_SERVICE_KEY_PATH = '/run/secrets/service/backend-client.key';
  process.env.AUTH_SERVICE_SERVER_NAME = 'authorization';
  process.env.AUTH_SERVICE_TIMEOUT_MS = '5000';
  process.env.FRONTEND_ORIGIN = 'http://localhost:1235';
  process.env.LLM_GATEWAY_URL = 'https://llm_gateway:8130';
  process.env.LLM_GATEWAY_CA_PATH = '/run/secrets/service/ca.crt';
  process.env.LLM_GATEWAY_CERT_PATH = '/run/secrets/service/backend-client.crt';
  process.env.LLM_GATEWAY_KEY_PATH = '/run/secrets/service/backend-client.key';
  process.env.LLM_GATEWAY_SERVER_NAME = 'llm-gateway';
  process.env.LLM_GATEWAY_HMAC_KEY_FILE = '/run/secrets/llm-auth/hmac-key';
  process.env.LLM_GATEWAY_HMAC_KEY_ID = 'backend-v1';
  process.env.LLM_TIMEOUT_MS = '7000';
  process.env.BACKEND_PORT = '3000';
  process.env.S3_ENDPOINT = 'http://object-storage:9000';
  process.env.S3_PUBLIC_ENDPOINT = 'https://uploads.example.test';
  process.env.S3_UPLOAD_EXPIRY_SECONDS = '300';
  process.env.S3_REGION = 'eu-central-1';
  process.env.S3_BUCKET = 'zglosto-test';
  process.env.S3_ACCESS_KEY_ID = 'test-access-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_OBJECT_PREFIX = 'incidents';
  process.env.S3_AUTO_CREATE_BUCKET = 'false';
  process.env.RABBITMQ_URL = 'amqps://backend:secret@rabbitmq:5671/zglosto';
  process.env.RABBITMQ_TLS_CA_PATH = '/run/secrets/service/ca.crt';
  process.env.RABBITMQ_SERVER_NAME = 'rabbitmq';
  process.env.RABBITMQ_HEARTBEAT_SECONDS = '30';
  process.env.RABBITMQ_RECONNECT_DELAY_MS = '1000';
  process.env.RABBITMQ_PUBLISHER_ENABLED = 'true';
  process.env.OUTBOX_POLL_INTERVAL_MS = '1000';
  process.env.OUTBOX_BATCH_SIZE = '25';
  process.env.OUTBOX_LOCK_TIMEOUT_MS = '30000';
});

test('accepts the application PostgreSQL URL without a direct connection URL', () => {
  const environment = validateBackendEnvironment();

  expect(BackendEnvironmentSchema.parse(environment)).toMatchObject({
    authorization: {
      caPath: '/run/secrets/service/ca.crt',
      certificatePath: '/run/secrets/service/backend-client.crt',
      privateKeyPath: '/run/secrets/service/backend-client.key',
      serverName: 'authorization',
      timeoutMs: 5000,
      url: 'https://authorization:9956',
    },
    clientAddress: {
      trustedProxyHops: 1,
    },
    databaseTlsCaPath: '/run/secrets/database/ca.crt',
    frontendOrigin: 'http://localhost:1235',
    homepageCache: {
      nginxDisabledTtlSeconds: 900,
      nginxMicrocacheSeconds: 30,
      ttlSeconds: 900,
    },
    incidentRateLimit: {
      global: { maxRequests: 300, windowMs: 60000 },
      ip: { maxRequests: 10, windowMs: 900000 },
      local: {
        cleanupIntervalMs: 60000,
        maxKeys: 50000,
        maxRequests: 5,
        windowMs: 10000,
      },
      user: { maxRequests: 20, windowMs: 900000 },
    },
    llmGatewayUrl: 'https://llm_gateway:8130',
    llmTimeoutMs: 7000,
    objectStorage: {
      accessKeyId: 'test-access-key',
      autoCreateBucket: false,
      bucket: 'zglosto-test',
      endpoint: 'http://object-storage:9000',
      forcePathStyle: true,
      objectPrefix: 'incidents',
      region: 'eu-central-1',
      secretAccessKey: 'test-secret-key',
    },
    port: 3000,
    rabbitMq: {
      batchSize: 25,
      heartbeatSeconds: 30,
      lockTimeoutMs: 30000,
      pollIntervalMs: 1000,
      publisherEnabled: true,
      reconnectDelayMs: 1000,
      serverName: 'rabbitmq',
      tlsCaPath: '/run/secrets/service/ca.crt',
      url: 'amqps://backend:secret@rabbitmq:5671/zglosto',
    },
    redis: {
      commandTimeoutMs: 500,
      connectTimeoutMs: 1000,
      identityHmacKeyFile: null,
      keyPrefix: 'zglosto',
      mode: 'disabled',
      tlsCaPath: null,
      urlFile: null,
    },
  });
});

test('requires TLS-only RabbitMQ transport', () => {
  expect(validateRabbitMqEnvironment()).toMatchObject({
    batchSize: 25,
    publisherEnabled: true,
    serverName: 'rabbitmq',
  });
  process.env.RABBITMQ_URL = 'amqp://backend:secret@rabbitmq:5672/zglosto';
  expect(() => validateRabbitMqEnvironment()).toThrow('must use amqps://');
});

test('exposes focused database and provider-neutral object storage configuration', () => {
  expect(validateDatabaseConnectionEnvironment()).toEqual({
    connectionTimeoutMs: 5000,
    idleTimeoutMs: 30000,
    poolMax: 10,
    tlsCaPath: '/run/secrets/database/ca.crt',
    url: 'postgresql://app:secret@database:54325/zglosto_db',
  });
  expect(validateObjectStorageEnvironment()).toMatchObject({
    bucket: 'zglosto-test',
    endpoint: 'http://object-storage:9000',
    publicEndpoint: 'https://uploads.example.test',
    forcePathStyle: true,
    region: 'eu-central-1',
  });
});

test('allows media worker to use only the internal Object Storage endpoint', () => {
  process.env.SERVICE_NAME = 'media_worker';
  delete process.env.S3_PUBLIC_ENDPOINT;

  expect(validateObjectStorageEnvironment()).toMatchObject({
    endpoint: 'http://object-storage:9000',
    publicEndpoint: 'http://object-storage:9000',
  });
});

test('requires a browser-visible Object Storage endpoint for the backend', () => {
  process.env.SERVICE_NAME = 'backend';
  delete process.env.S3_PUBLIC_ENDPOINT;

  expect(() => validateObjectStorageEnvironment()).toThrow(
    'Missing required environment variable: S3_PUBLIC_ENDPOINT',
  );
});

test('validates explicit PostgreSQL pool limits', () => {
  process.env.DATABASE_POOL_MAX = '24';
  process.env.DATABASE_IDLE_TIMEOUT_MS = '45000';
  process.env.DATABASE_CONNECTION_TIMEOUT_MS = '7000';

  expect(validateDatabaseConnectionEnvironment()).toMatchObject({
    connectionTimeoutMs: 7000,
    idleTimeoutMs: 45000,
    poolMax: 24,
  });
});

test('exposes focused Authorization mTLS configuration', () => {
  expect(validateAuthorizationEnvironment()).toEqual({
    caPath: '/run/secrets/service/ca.crt',
    certificatePath: '/run/secrets/service/backend-client.crt',
    privateKeyPath: '/run/secrets/service/backend-client.key',
    serverName: 'authorization',
    timeoutMs: 5000,
    url: 'https://authorization:9956',
  });
});

test('rejects an incomplete Object Storage configuration', () => {
  delete process.env.S3_BUCKET;

  expect(() => validateBackendEnvironment()).toThrow(
    'Missing required environment variable: S3_BUCKET',
  );
});

test('rejects invalid Object Storage boolean flags', () => {
  process.env.S3_FORCE_PATH_STYLE = 'yes';

  expect(() => validateBackendEnvironment()).toThrow(
    'Environment variable S3_FORCE_PATH_STYLE must be true or false',
  );
});

test('requires DATABASE_URL even when legacy DB variables are present', () => {
  delete process.env.DATABASE_URL;
  process.env.DB_HOST = 'database';
  process.env.POSTGRES_PORT = '54325';
  process.env.POSTGRES_USER = 'legacy-user';
  process.env.POSTGRES_PASSWORD = 'legacy-password';
  process.env.POSTGRES_DB = 'zglosto_db';

  expect(() => validateBackendEnvironment()).toThrow(
    'Missing required environment variable: DATABASE_URL',
  );
});

test('rejects a non-PostgreSQL DATABASE_URL', () => {
  process.env.DATABASE_URL = 'https://database.example.com/zglosto_db';

  expect(() => validateBackendEnvironment()).toThrow(
    'Environment variable DATABASE_URL must use postgres:// or postgresql://',
  );
});

test('rejects connection-string overrides of managed database TLS', () => {
  process.env.DATABASE_URL = 'postgresql://app:secret@pgbouncer:6432/zglosto_db?sslmode=disable';

  expect(() => validateBackendEnvironment()).toThrow(
    'Environment variable DATABASE_URL must not override managed TLS parameter sslmode',
  );
});

test('rejects an insecure Authorization service URL', () => {
  process.env.AUTH_SERVICE_URL = 'http://authorization:9955';

  expect(() => validateBackendEnvironment()).toThrow(
    'Environment variable AUTH_SERVICE_URL must use https://',
  );
});

test('defaults to Redis disabled without requiring Redis secrets', () => {
  expect(validateRedisConnectionEnvironment()).toEqual({
    commandTimeoutMs: 500,
    connectTimeoutMs: 1000,
    identityHmacKeyFile: null,
    keyPrefix: 'zglosto',
    mode: 'disabled',
    tlsCaPath: null,
    urlFile: null,
  });
});

test.each(['local', 'external'] as const)(
  'requires Redis and HMAC secret files in Redis %s mode',
  (mode) => {
    process.env.REDIS_MODE = mode;

    expect(() => validateRedisConnectionEnvironment()).toThrow(
      `REDIS_URL_FILE and RATE_LIMIT_HMAC_KEY_FILE are required when REDIS_MODE=${mode}`,
    );
  },
);

test('accepts local Redis configuration with optional TLS CA', () => {
  process.env.REDIS_MODE = 'local';
  process.env.REDIS_URL_FILE = '/run/secrets/redis/url';
  process.env.RATE_LIMIT_HMAC_KEY_FILE = '/run/secrets/redis/rate-limit-hmac';
  process.env.REDIS_TLS_CA_PATH = '/run/secrets/redis/ca.crt';
  process.env.REDIS_CONNECT_TIMEOUT_MS = '750';
  process.env.REDIS_COMMAND_TIMEOUT_MS = '250';
  process.env.REDIS_KEY_PREFIX = 'zglosto:city-1';

  expect(validateRedisConnectionEnvironment()).toEqual({
    commandTimeoutMs: 250,
    connectTimeoutMs: 750,
    identityHmacKeyFile: '/run/secrets/redis/rate-limit-hmac',
    keyPrefix: 'zglosto:city-1',
    mode: 'local',
    tlsCaPath: '/run/secrets/redis/ca.crt',
    urlFile: '/run/secrets/redis/url',
  });
});

test('rejects Redis credentials configured in disabled mode', () => {
  process.env.REDIS_URL_FILE = '/run/secrets/redis/url';

  expect(() => validateRedisConnectionEnvironment()).toThrow(
    'Redis secrets and RATE_LIMIT_HMAC_KEY_FILE must not be set when REDIS_MODE=disabled',
  );
});

test('rejects unsupported Redis modes and invalid positive integers', () => {
  process.env.REDIS_MODE = 'both';
  expect(() => validateRedisConnectionEnvironment()).toThrow(
    'REDIS_MODE must be one of: disabled, local, external',
  );

  process.env.REDIS_MODE = 'disabled';
  process.env.REDIS_COMMAND_TIMEOUT_MS = '0';
  expect(() => validateRedisConnectionEnvironment()).toThrow(
    'REDIS_COMMAND_TIMEOUT_MS must be a positive integer',
  );
});

test('exposes agreed cache defaults and configurable positive limiter thresholds', () => {
  expect(validateHomepageCacheEnvironment()).toEqual({
    nginxDisabledTtlSeconds: 900,
    nginxMicrocacheSeconds: 30,
    ttlSeconds: 900,
  });

  process.env.INCIDENT_LOCAL_RATE_LIMIT_MAX_REQUESTS = '7';
  process.env.INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS = '12';
  process.env.INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS = '24';
  process.env.INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS = '400';

  expect(validateIncidentRateLimitEnvironment()).toEqual({
    global: { maxRequests: 400, windowMs: 60000 },
    ip: { maxRequests: 12, windowMs: 900000 },
    local: {
      cleanupIntervalMs: 60000,
      maxKeys: 50000,
      maxRequests: 7,
      windowMs: 10000,
    },
    user: { maxRequests: 24, windowMs: 900000 },
  });
});

test('validates the explicit trusted reverse-proxy hop count', () => {
  expect(validateClientAddressEnvironment()).toEqual({ trustedProxyHops: 1 });

  process.env.CLIENT_IP_TRUSTED_PROXY_HOPS = '2';
  expect(validateClientAddressEnvironment()).toEqual({ trustedProxyHops: 2 });

  process.env.CLIENT_IP_TRUSTED_PROXY_HOPS = '0';
  expect(() => validateClientAddressEnvironment()).toThrow(
    'CLIENT_IP_TRUSTED_PROXY_HOPS must be a positive integer',
  );
});

test('rejects non-positive cache and limiter configuration', () => {
  process.env.HOMEPAGE_CACHE_TTL_SECONDS = '-1';
  expect(() => validateHomepageCacheEnvironment()).toThrow(
    'HOMEPAGE_CACHE_TTL_SECONDS must be a positive integer',
  );

  delete process.env.HOMEPAGE_CACHE_TTL_SECONDS;
  process.env.INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS = '1.5';
  expect(() => validateIncidentRateLimitEnvironment()).toThrow(
    'INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS must be a positive integer',
  );
});
