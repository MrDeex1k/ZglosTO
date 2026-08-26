import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, normalize, resolve } from 'node:path';

import {
  formatWhiteLabelValidationError,
  isRecord,
  safeParseWhiteLabelConfig,
  type WhiteLabelConfig,
} from '@zglosto/contracts';
import { parse as parseYaml } from 'yaml';

export const WHITE_LABEL_CONFIG_ENV = 'WHITE_LABEL_CONFIG' as const;

export const WHITE_LABEL_CONFIG_ERROR_CODES = [
  'invalid_environment',
  'missing_path',
  'read_error',
  'yaml_error',
  'validation_error',
  'different_config',
] as const;

export type WhiteLabelConfigErrorCode = (typeof WHITE_LABEL_CONFIG_ERROR_CODES)[number];

export interface LoadedWhiteLabelConfig {
  config: WhiteLabelConfig;
  path: string;
  checksum: string;
}

export interface WhiteLabelConfigReadiness {
  status: 'valid';
  configVersion: string;
  checksum: string;
}

export function createWhiteLabelConfigReadiness(
  loadedConfig: LoadedWhiteLabelConfig,
): WhiteLabelConfigReadiness {
  return {
    status: 'valid',
    configVersion: loadedConfig.config.configVersion,
    checksum: loadedConfig.checksum,
  };
}

export class WhiteLabelConfigLoadError extends Error {
  readonly code: WhiteLabelConfigErrorCode;

  constructor(code: WhiteLabelConfigErrorCode, message: string) {
    super(message);
    this.name = 'WhiteLabelConfigLoadError';
    this.code = code;
  }
}

export function resolveWhiteLabelConfigPath(
  environment: unknown,
  workingDirectory: string,
): string {
  if (!isRecord(environment)) {
    throw new WhiteLabelConfigLoadError(
      'invalid_environment',
      'White-Label environment must be an object',
    );
  }

  const configuredPath = environment[WHITE_LABEL_CONFIG_ENV];
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw new WhiteLabelConfigLoadError(
      'missing_path',
      `${WHITE_LABEL_CONFIG_ENV} must point to one YAML file`,
    );
  }

  const trimmedPath = configuredPath.trim();
  return normalize(isAbsolute(trimmedPath) ? trimmedPath : resolve(workingDirectory, trimmedPath));
}

export function loadWhiteLabelConfigFile(configPath: string): LoadedWhiteLabelConfig {
  const absolutePath = normalize(isAbsolute(configPath) ? configPath : resolve(configPath));
  let source: string;

  try {
    source = readFileSync(absolutePath, 'utf8');
  } catch {
    throw new WhiteLabelConfigLoadError(
      'read_error',
      `Cannot read White-Label config file: ${absolutePath}`,
    );
  }

  let rawConfig: unknown;
  try {
    rawConfig = parseYaml(source);
  } catch {
    throw new WhiteLabelConfigLoadError(
      'yaml_error',
      `Cannot parse White-Label YAML file: ${absolutePath}`,
    );
  }

  const result = safeParseWhiteLabelConfig(rawConfig);
  if (!result.success) {
    throw new WhiteLabelConfigLoadError(
      'validation_error',
      `Invalid White-Label config in ${absolutePath}: ${formatWhiteLabelValidationError(result.error)}`,
    );
  }

  return {
    config: result.data,
    path: absolutePath,
    checksum: createHash('sha256').update(source, 'utf8').digest('hex'),
  };
}

export class SingleCityWhiteLabelConfigLoader {
  private loadedConfig: LoadedWhiteLabelConfig | null = null;

  load(environment: unknown, workingDirectory: string): LoadedWhiteLabelConfig {
    const requestedPath = resolveWhiteLabelConfigPath(environment, workingDirectory);

    if (this.loadedConfig !== null) {
      if (this.loadedConfig.path !== requestedPath) {
        throw new WhiteLabelConfigLoadError(
          'different_config',
          `A White-Label config is already active for this process: ${this.loadedConfig.path}`,
        );
      }
      return this.loadedConfig;
    }

    this.loadedConfig = loadWhiteLabelConfigFile(requestedPath);
    return this.loadedConfig;
  }
}

const processConfigLoader = new SingleCityWhiteLabelConfigLoader();

export function loadProcessWhiteLabelConfig(): LoadedWhiteLabelConfig {
  return processConfigLoader.load(process.env, process.cwd());
}
