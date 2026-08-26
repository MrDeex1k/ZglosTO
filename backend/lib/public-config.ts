import { createHash } from 'node:crypto';
import {
  createPublicWhiteLabelConfig,
  parsePublicCityConfigResponse,
  type PublicCityConfigResponse,
} from '@zglosto/contracts';
import type { LoadedWhiteLabelConfig } from '@zglosto/white-label-config';

export const PUBLIC_CONFIG_CACHE_CONTROL = 'public, max-age=60, must-revalidate' as const;

export function createConfigEtag(payload: PublicCityConfigResponse): string {
  const representationChecksum = createHash('sha256')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
  return `"${representationChecksum}"`;
}

function normalizeEtag(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('W/') ? trimmed.slice(2).trim() : trimmed;
}

export function ifNoneMatchMatches(value: string | null, etag: string): boolean {
  if (value === null) return false;
  return value
    .split(',')
    .map(normalizeEtag)
    .some((candidate) => candidate === '*' || candidate === etag);
}

export function createPublicConfigResponse(
  loadedConfig: LoadedWhiteLabelConfig,
): PublicCityConfigResponse {
  return parsePublicCityConfigResponse({
    configVersion: loadedConfig.config.configVersion,
    checksum: loadedConfig.checksum,
    config: createPublicWhiteLabelConfig(loadedConfig.config),
  });
}
