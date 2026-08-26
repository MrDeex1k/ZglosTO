import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePublicCityConfigResponse, type PublicCityConfigResponse } from '@zglosto/contracts';

import { STORAGE_KEYS } from './keys';

const PUBLIC_CONFIG_CACHE_VERSION = 1 as const;

export interface PublicConfigCacheEntry {
  etag: string;
  response: PublicCityConfigResponse;
  savedAt: string;
}

export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
}

interface SerializedPublicConfigCache {
  etag: string;
  response: unknown;
  savedAt: string;
  version: number;
}

function parseCacheValue(value: string): PublicConfigCacheEntry | null {
  let candidate: SerializedPublicConfigCache;
  try {
    candidate = JSON.parse(value) as SerializedPublicConfigCache;
  } catch {
    return null;
  }

  if (
    candidate.version !== PUBLIC_CONFIG_CACHE_VERSION ||
    typeof candidate.etag !== 'string' ||
    candidate.etag.trim() === '' ||
    typeof candidate.savedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.savedAt))
  ) {
    return null;
  }

  try {
    return {
      etag: candidate.etag,
      response: parsePublicCityConfigResponse(candidate.response),
      savedAt: candidate.savedAt,
    };
  } catch {
    return null;
  }
}

export function createPublicConfigCache(storage: KeyValueStorage = AsyncStorage) {
  return {
    async clear(): Promise<void> {
      await storage.removeItem(STORAGE_KEYS.publicConfig);
    },
    async read(): Promise<PublicConfigCacheEntry | null> {
      const value = await storage.getItem(STORAGE_KEYS.publicConfig);
      if (value === null) return null;
      const parsed = parseCacheValue(value);
      if (parsed === null) await storage.removeItem(STORAGE_KEYS.publicConfig);
      return parsed;
    },
    async write(entry: PublicConfigCacheEntry): Promise<void> {
      const validated = parsePublicCityConfigResponse(entry.response);
      await storage.setItem(
        STORAGE_KEYS.publicConfig,
        JSON.stringify({ ...entry, response: validated, version: PUBLIC_CONFIG_CACHE_VERSION }),
      );
    },
  };
}

export type PublicConfigCache = ReturnType<typeof createPublicConfigCache>;
