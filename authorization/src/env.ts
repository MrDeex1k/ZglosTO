import {
  ClientAddressEnvironmentSchema,
  LocalRateLimitEnvironmentSchema,
  RedisConnectionEnvironmentSchema,
  RedisModeSchema,
  type ClientAddressEnvironment,
  type LocalRateLimitEnvironment,
  type RedisConnectionEnvironment,
  type RedisMode,
} from '@zglosto/contracts';

type EmailDeliveryMode = 'disabled' | 'test';

export interface MtlsEnvironment {
  port: number;
  caPath: string;
  certificatePath: string;
  privateKeyPath: string;
  backendIdentity: string;
  healthcheckIdentity: string;
  nginxIdentity: string;
}

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
    throw new Error(`${name} must use postgres:// or postgresql://`);
  }
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    if (parsed.searchParams.has(parameter)) {
      throw new Error(`${name} must not override managed TLS parameter ${parameter}`);
    }
  }
  return url;
}

function validPort(name: string, value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function positiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

function workloadIdentity(name: string): string {
  const identity = required(name);
  const url = new URL(identity);
  if (url.protocol !== 'spiffe:' || url.hostname !== 'zglosto.local' || !url.pathname) {
    throw new Error(`${name} must be a spiffe://zglosto.local workload identity`);
  }
  return identity;
}

function mtlsEnvironment(): MtlsEnvironment {
  const backendIdentity = workloadIdentity('AUTHORIZATION_MTLS_BACKEND_IDENTITY');
  const healthcheckIdentity = workloadIdentity('AUTHORIZATION_MTLS_HEALTHCHECK_IDENTITY');
  const nginxIdentity = workloadIdentity('AUTHORIZATION_MTLS_NGINX_IDENTITY');
  if (new Set([backendIdentity, healthcheckIdentity, nginxIdentity]).size !== 3) {
    throw new Error('Backend, healthcheck and Nginx mTLS identities must be distinct');
  }

  return {
    port: validPort('AUTHORIZATION_MTLS_PORT', required('AUTHORIZATION_MTLS_PORT')),
    caPath: required('AUTHORIZATION_MTLS_CA_PATH'),
    certificatePath: required('AUTHORIZATION_MTLS_CERT_PATH'),
    privateKeyPath: required('AUTHORIZATION_MTLS_KEY_PATH'),
    backendIdentity,
    healthcheckIdentity,
    nginxIdentity,
  };
}

function emailDeliveryMode(): EmailDeliveryMode {
  const mode = process.env.EMAIL_DELIVERY_MODE?.trim() || 'disabled';
  if (mode !== 'disabled' && mode !== 'test') {
    throw new Error('EMAIL_DELIVERY_MODE must be one of: disabled, test');
  }
  if (mode === 'test' && process.env.NODE_ENV !== 'test') {
    throw new Error('EMAIL_DELIVERY_MODE=test is allowed only with NODE_ENV=test');
  }
  return mode;
}

function redisMode(): RedisMode {
  const value = process.env.REDIS_MODE?.trim() || 'disabled';
  const result = RedisModeSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Environment variable REDIS_MODE must be one of: disabled, local, external');
  }
  return result.data;
}

function redisConnectionEnvironment(): RedisConnectionEnvironment {
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

function localRateLimitEnvironment(): LocalRateLimitEnvironment {
  return LocalRateLimitEnvironmentSchema.parse({
    cleanupIntervalMs: positiveInteger(
      'AUTH_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS',
      process.env.AUTH_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS?.trim() || '60000',
    ),
    maxKeys: positiveInteger(
      'AUTH_LOCAL_RATE_LIMIT_MAX_KEYS',
      process.env.AUTH_LOCAL_RATE_LIMIT_MAX_KEYS?.trim() || '50000',
    ),
    maxRequests: positiveInteger(
      'AUTH_LOCAL_RATE_LIMIT_MAX_REQUESTS',
      process.env.AUTH_LOCAL_RATE_LIMIT_MAX_REQUESTS?.trim() || '50',
    ),
    windowMs: positiveInteger(
      'AUTH_LOCAL_RATE_LIMIT_WINDOW_MS',
      process.env.AUTH_LOCAL_RATE_LIMIT_WINDOW_MS?.trim() || '1000',
    ),
  });
}

function clientAddressEnvironment(): ClientAddressEnvironment {
  return ClientAddressEnvironmentSchema.parse({
    trustedProxyHops: positiveInteger(
      'CLIENT_IP_TRUSTED_PROXY_HOPS',
      process.env.CLIENT_IP_TRUSTED_PROXY_HOPS?.trim() || '1',
    ),
  });
}

const betterAuthSecret = required('BETTER_AUTH_SECRET');
if (betterAuthSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  databaseUrl: validDatabaseUrl('DATABASE_URL', required('DATABASE_URL')),
  databaseTlsCaPath: required('DATABASE_TLS_CA_PATH'),
  betterAuthSecret,
  betterAuthUrl: validUrl('BETTER_AUTH_URL', required('BETTER_AUTH_URL')),
  clientAddress: clientAddressEnvironment(),
  frontendOrigin: validUrl('FRONTEND_ORIGIN', required('FRONTEND_ORIGIN')),
  emailDeliveryMode: emailDeliveryMode(),
  localRateLimit: localRateLimitEnvironment(),
  mtls: mtlsEnvironment(),
  redis: redisConnectionEnvironment(),
});
