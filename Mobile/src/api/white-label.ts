import { parsePublicCityConfigResponse, type PublicCityConfigResponse } from '@zglosto/contracts';

import type { PublicConfigCache, PublicConfigCacheEntry } from '@/storage/public-config-cache';

import type { ApiClient } from './client';
import { ApiError } from './errors';

export interface PublicConfigLoadResult {
  isStale: boolean;
  response: PublicCityConfigResponse;
  source: 'cache' | 'not-modified' | 'remote';
}

interface LoadPublicConfigOptions {
  cache: PublicConfigCache;
  client: ApiClient;
  now?: () => Date;
  signal?: AbortSignal;
}

function cacheResult(entry: PublicConfigCacheEntry, source: 'cache' | 'not-modified') {
  return { isStale: source === 'cache', response: entry.response, source } as const;
}

export async function loadPublicConfig({
  cache,
  client,
  now = () => new Date(),
  signal,
}: LoadPublicConfigOptions): Promise<PublicConfigLoadResult> {
  const cached = await cache.read();
  const headers = new Headers();
  if (cached !== null) headers.set('If-None-Match', cached.etag);

  try {
    const response = await client.raw('/api/config/public', {
      headers,
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.status === 304) {
      if (cached === null) {
        throw new ApiError('API returned 304 without a cached representation.', {
          kind: 'contract',
          status: 304,
        });
      }
      return cacheResult(cached, 'not-modified');
    }
    if (!response.ok) {
      throw new ApiError(`Public configuration failed with HTTP ${response.status}.`, {
        correlationId: response.headers.get('x-correlation-id'),
        kind: 'http',
        status: response.status,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ApiError('Public configuration returned invalid JSON.', {
        cause: error,
        kind: 'contract',
      });
    }

    let parsed: PublicCityConfigResponse;
    try {
      parsed = parsePublicCityConfigResponse(payload);
    } catch (error) {
      throw new ApiError('Public configuration failed contract validation.', {
        cause: error,
        kind: 'contract',
      });
    }

    const etag = response.headers.get('etag');
    if (etag === null || etag.trim() === '') {
      throw new ApiError('Public configuration response is missing ETag.', {
        kind: 'contract',
      });
    }

    await cache.write({ etag, response: parsed, savedAt: now().toISOString() });
    return { isStale: false, response: parsed, source: 'remote' };
  } catch (error) {
    if (
      cached !== null &&
      error instanceof ApiError &&
      (error.kind === 'network' || error.kind === 'timeout')
    ) {
      return cacheResult(cached, 'cache');
    }
    throw error;
  }
}

export function resolvePublicAssetUrl(origin: string, location: string): string {
  const url = new URL(location, origin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError('Public asset URL must use HTTP(S).', { kind: 'contract' });
  }
  return url.toString();
}
