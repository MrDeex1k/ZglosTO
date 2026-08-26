import { z } from 'zod';

const DependencyStatusSchema = z.enum(['up', 'down']);
export const RedisDependencyStatusSchema = z.enum(['disabled', 'up', 'down']);

export const BackendLivenessResponseSchema = z
  .object({
    service: z.literal('backend'),
    status: z.literal('ok'),
  })
  .strict();

export const WhiteLabelConfigReadinessSchema = z
  .object({
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    configVersion: z.string().min(1),
    status: z.literal('valid'),
  })
  .strict();

export const BackendReadinessSuccessResponseSchema = z
  .object({
    config: WhiteLabelConfigReadinessSchema,
    database: z.literal('up'),
    objectStorage: z.literal('up'),
    redis: z.enum(['disabled', 'up']),
    service: z.literal('backend'),
    status: z.literal('ok'),
  })
  .strict();

export const BackendReadinessDegradedResponseSchema = z
  .object({
    config: WhiteLabelConfigReadinessSchema,
    database: z.literal('up'),
    objectStorage: z.literal('up'),
    redis: z.literal('down'),
    service: z.literal('backend'),
    status: z.literal('degraded'),
  })
  .strict();

export const BackendReadinessAvailableResponseSchema = z.discriminatedUnion('status', [
  BackendReadinessSuccessResponseSchema,
  BackendReadinessDegradedResponseSchema,
]);

export const BackendReadinessFailureResponseSchema = z
  .object({
    database: DependencyStatusSchema,
    objectStorage: DependencyStatusSchema,
    redis: RedisDependencyStatusSchema,
    service: z.literal('backend'),
    status: z.literal('error'),
  })
  .strict()
  .refine((response) => response.database === 'down' || response.objectStorage === 'down', {
    message: 'at least one readiness dependency must be down',
  });

export const BackendReadinessResponseSchema = z.discriminatedUnion('status', [
  BackendReadinessSuccessResponseSchema,
  BackendReadinessDegradedResponseSchema,
  BackendReadinessFailureResponseSchema,
]);

export const AuthorizationReadinessSuccessResponseSchema = z
  .object({
    config: WhiteLabelConfigReadinessSchema,
    database: z.literal('up'),
    redis: z.enum(['disabled', 'up']),
    service: z.literal('authorization'),
    status: z.literal('ok'),
  })
  .strict();

export const AuthorizationReadinessDegradedResponseSchema = z
  .object({
    config: WhiteLabelConfigReadinessSchema,
    database: z.literal('up'),
    redis: z.literal('down'),
    service: z.literal('authorization'),
    status: z.literal('degraded'),
  })
  .strict();

export const AuthorizationReadinessFailureResponseSchema = z
  .object({
    database: z.literal('down'),
    redis: RedisDependencyStatusSchema,
    service: z.literal('authorization'),
    status: z.literal('error'),
  })
  .strict();

export const AuthorizationReadinessResponseSchema = z.discriminatedUnion('status', [
  AuthorizationReadinessSuccessResponseSchema,
  AuthorizationReadinessDegradedResponseSchema,
  AuthorizationReadinessFailureResponseSchema,
]);

export type BackendLivenessResponse = z.infer<typeof BackendLivenessResponseSchema>;
export type BackendReadinessResponse = z.infer<typeof BackendReadinessResponseSchema>;
export type BackendReadinessSuccessResponse = z.infer<typeof BackendReadinessSuccessResponseSchema>;
export type AuthorizationReadinessResponse = z.infer<typeof AuthorizationReadinessResponseSchema>;
export type BackendReadinessFailureResponse = z.infer<typeof BackendReadinessFailureResponseSchema>;
export type RedisDependencyStatus = z.infer<typeof RedisDependencyStatusSchema>;
