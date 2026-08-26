import type {
  ClientAddressEnvironment,
  HomepageCacheEnvironment,
  IncidentRateLimitEnvironment,
  RedisConnectionEnvironment,
} from '@zglosto/contracts';
import {
  validateClientAddressEnvironment,
  validateHomepageCacheEnvironment,
  validateIncidentRateLimitEnvironment,
  validateRedisConnectionEnvironment,
} from '../../config/env.ts';

export interface RuntimeConfiguration {
  clientAddress: ClientAddressEnvironment;
  homepageCache: HomepageCacheEnvironment;
  incidentRateLimit: IncidentRateLimitEnvironment;
  redis: RedisConnectionEnvironment;
}

export const RUNTIME_CONFIGURATION = Symbol('RUNTIME_CONFIGURATION');

export function parseRuntimeConfiguration(): RuntimeConfiguration {
  return {
    clientAddress: validateClientAddressEnvironment(),
    homepageCache: validateHomepageCacheEnvironment(),
    incidentRateLimit: validateIncidentRateLimitEnvironment(),
    redis: validateRedisConnectionEnvironment(),
  };
}
