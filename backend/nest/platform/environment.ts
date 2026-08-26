import { z } from 'zod';

const PlatformEnvironmentSchema = z
  .object({
    BACKEND_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVICE_NAME: z.enum(['backend', 'media_worker']).default('backend'),
  })
  .transform((environment) => ({
    nodeEnv: environment.NODE_ENV,
    port: environment.BACKEND_PORT,
    serviceName: environment.SERVICE_NAME,
  }));

export type PlatformEnvironment = z.infer<typeof PlatformEnvironmentSchema>;

export const PLATFORM_ENVIRONMENT = Symbol('PLATFORM_ENVIRONMENT');

export function parsePlatformEnvironment(environment: NodeJS.ProcessEnv): PlatformEnvironment {
  return PlatformEnvironmentSchema.parse(environment);
}
