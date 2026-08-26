import type { HomepageCacheEnvironment, RedisMode } from '@zglosto/contracts';

export function homepageNginxCacheTtlSeconds(
  redisMode: RedisMode,
  configuration: HomepageCacheEnvironment,
): number {
  return redisMode === 'disabled'
    ? configuration.nginxDisabledTtlSeconds
    : configuration.nginxMicrocacheSeconds;
}
