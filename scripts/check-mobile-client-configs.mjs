import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createPublicWhiteLabelConfig,
  parsePublicCityConfigResponse,
} from '../packages/contracts/dist/index.js';
import { loadWhiteLabelConfigFile } from '../packages/white-label-config/dist/index.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const configDirectory = resolve(repositoryRoot, 'config/white-label');
const configPaths = readdirSync(configDirectory)
  .filter((name) => /^test-.+\.yaml$/.test(name))
  .sort()
  .map((name) => resolve(configDirectory, name));

if (configPaths.length < 2) {
  throw new Error('Mobile client readiness requires at least two synthetic White-Label configs.');
}

const identities = new Set();
for (const configPath of configPaths) {
  const loaded = loadWhiteLabelConfigFile(configPath);
  const response = parsePublicCityConfigResponse({
    configVersion: loaded.config.configVersion,
    checksum: loaded.checksum,
    config: createPublicWhiteLabelConfig(loaded.config),
  });
  const serialized = JSON.stringify(response);
  if (/(password|secret|token|credential|privateKey)/i.test(serialized)) {
    throw new Error(`Public Mobile config exposes a forbidden key: ${configPath}`);
  }
  if (response.config.services.some((service) => !service.enabled)) {
    throw new Error(`Public Mobile config exposes a disabled service: ${configPath}`);
  }
  identities.add(`${response.config.city.key}:${response.configVersion}:${response.checksum}`);
  process.stdout.write(
    `[mobile-client-config] ${response.config.city.key}: ${response.configVersion}, ${response.config.services.length} enabled services\n`,
  );
}

if (identities.size !== configPaths.length) {
  throw new Error(
    'Synthetic White-Label configs must have distinct city, version and checksum identities.',
  );
}

const mobileEnvironmentExample = readFileSync(
  resolve(repositoryRoot, 'Mobile/.env.example'),
  'utf8',
);
if (!mobileEnvironmentExample.includes('EXPO_PUBLIC_API_ORIGIN=https://example-city.invalid')) {
  throw new Error('Mobile/.env.example must keep a non-routable HTTPS example origin.');
}
if (!mobileEnvironmentExample.includes('EXPO_PUBLIC_ALLOW_HTTP_ORIGIN=false')) {
  throw new Error('Mobile/.env.example must disable HTTP by default.');
}

process.stdout.write(
  `[mobile-client-config] PASS: ${configPaths.length} synthetic client variants satisfy the Mobile public contract.\n`,
);
