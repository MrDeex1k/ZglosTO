import { z } from 'zod';

const RequiredStringSchema = z.string().trim().min(1);
const PositiveIntegerSchema = z.number().int().positive();

export const RedisModeSchema = z.enum(['disabled', 'local', 'external']);

const RedisConnectionFields = {
  commandTimeoutMs: PositiveIntegerSchema,
  connectTimeoutMs: PositiveIntegerSchema,
  identityHmacKeyFile: RequiredStringSchema.nullable(),
  keyPrefix: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9:_-]{0,63}$/,
      'Redis key prefix must contain only lowercase letters, numbers, colons, underscores or hyphens',
    ),
  tlsCaPath: RequiredStringSchema.nullable(),
  urlFile: RequiredStringSchema.nullable(),
};

export const RedisConnectionEnvironmentSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    ...RedisConnectionFields,
    identityHmacKeyFile: z.null(),
    mode: z.literal('disabled'),
    tlsCaPath: z.null(),
    urlFile: z.null(),
  }),
  z.strictObject({
    ...RedisConnectionFields,
    identityHmacKeyFile: RequiredStringSchema,
    mode: z.literal('local'),
    urlFile: RequiredStringSchema,
  }),
  z.strictObject({
    ...RedisConnectionFields,
    identityHmacKeyFile: RequiredStringSchema,
    mode: z.literal('external'),
    urlFile: RequiredStringSchema,
  }),
]);

export const LocalRateLimitEnvironmentSchema = z.strictObject({
  cleanupIntervalMs: PositiveIntegerSchema,
  maxKeys: PositiveIntegerSchema,
  maxRequests: PositiveIntegerSchema,
  windowMs: PositiveIntegerSchema,
});

export const DistributedRateLimitRuleSchema = z.strictObject({
  maxRequests: PositiveIntegerSchema,
  windowMs: PositiveIntegerSchema,
});

export const IncidentRateLimitEnvironmentSchema = z.strictObject({
  global: DistributedRateLimitRuleSchema,
  ip: DistributedRateLimitRuleSchema,
  local: LocalRateLimitEnvironmentSchema,
  user: DistributedRateLimitRuleSchema,
});

export const HomepageCacheEnvironmentSchema = z.strictObject({
  nginxDisabledTtlSeconds: PositiveIntegerSchema,
  nginxMicrocacheSeconds: PositiveIntegerSchema,
  ttlSeconds: PositiveIntegerSchema,
});

export const ClientAddressEnvironmentSchema = z.strictObject({
  trustedProxyHops: PositiveIntegerSchema,
});

export type RedisMode = z.infer<typeof RedisModeSchema>;
export type RedisConnectionEnvironment = z.infer<typeof RedisConnectionEnvironmentSchema>;
export type LocalRateLimitEnvironment = z.infer<typeof LocalRateLimitEnvironmentSchema>;
export type DistributedRateLimitRule = z.infer<typeof DistributedRateLimitRuleSchema>;
export type IncidentRateLimitEnvironment = z.infer<typeof IncidentRateLimitEnvironmentSchema>;
export type HomepageCacheEnvironment = z.infer<typeof HomepageCacheEnvironmentSchema>;
export type ClientAddressEnvironment = z.infer<typeof ClientAddressEnvironmentSchema>;
