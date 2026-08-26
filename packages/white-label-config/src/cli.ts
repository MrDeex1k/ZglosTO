import { resolve } from 'node:path';

import { loadWhiteLabelConfigFile } from './index.js';

const [, , configPath, outputFormat = 'json'] = process.argv;

if (typeof configPath !== 'string' || configPath.trim().length === 0) {
  throw new Error('Usage: white-label-config <config-path> [json|fields]');
}

const invocationDirectory =
  typeof process.env.INIT_CWD === 'string' && process.env.INIT_CWD.length > 0
    ? process.env.INIT_CWD
    : process.cwd();
const loadedConfig = loadWhiteLabelConfigFile(resolve(invocationDirectory, configPath));
const metadata = {
  cityKey: loadedConfig.config.city.key,
  configVersion: loadedConfig.config.configVersion,
  checksum: loadedConfig.checksum,
  path: loadedConfig.path,
};

if (outputFormat === 'fields') {
  process.stdout.write(
    `${metadata.cityKey}\t${metadata.configVersion}\t${metadata.checksum}\t${metadata.path}\n`,
  );
} else if (outputFormat === 'json') {
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
} else {
  throw new Error(`Unsupported output format: ${outputFormat}`);
}
