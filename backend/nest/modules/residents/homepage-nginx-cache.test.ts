import type { HomepageCacheEnvironment, RedisMode } from '@zglosto/contracts';
import { describe, expect, it } from 'vitest';
import { homepageNginxCacheTtlSeconds } from './homepage-nginx-cache.ts';

const configuration: HomepageCacheEnvironment = {
  nginxDisabledTtlSeconds: 900,
  nginxMicrocacheSeconds: 30,
  ttlSeconds: 900,
};

describe('homepageNginxCacheTtlSeconds', () => {
  it.each([
    ['disabled', 900],
    ['local', 30],
    ['external', 30],
  ] satisfies readonly (readonly [RedisMode, number])[])(
    'selects the expected TTL for Redis mode %s',
    (mode, expectedTtlSeconds) => {
      expect(homepageNginxCacheTtlSeconds(mode, configuration)).toBe(expectedTtlSeconds);
    },
  );
});
