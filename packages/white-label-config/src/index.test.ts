import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, test } from 'vitest';
import { createPublicWhiteLabelConfig } from '@zglosto/contracts';

import {
  createWhiteLabelConfigReadiness,
  loadWhiteLabelConfigFile,
  resolveWhiteLabelConfigPath,
  SingleCityWhiteLabelConfigLoader,
  WhiteLabelConfigLoadError,
  type LoadedWhiteLabelConfig,
} from './index.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const whiteLabelConfigDirectory = join(repositoryRoot, 'config/white-label');
const defaultConfigPath = join(whiteLabelConfigDirectory, 'zglosto.yaml');
const cityConfigPaths = readdirSync(whiteLabelConfigDirectory, { withFileTypes: true })
  .filter(
    (entry) => entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')),
  )
  .map((entry) => join(whiteLabelConfigDirectory, entry.name));

function expectLoadError(operation: () => unknown, code: WhiteLabelConfigLoadError['code']): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(WhiteLabelConfigLoadError);
    if (error instanceof WhiteLabelConfigLoadError) expect(error.code).toBe(code);
    return;
  }

  throw new Error(`Expected WhiteLabelConfigLoadError with code ${code}`);
}

describe('White-Label YAML loader', () => {
  test('validates every versioned city config in the repository', () => {
    expect(cityConfigPaths.length).toBeGreaterThanOrEqual(3);
    cityConfigPaths.forEach((configPath) =>
      expect(() => loadWhiteLabelConfigFile(configPath)).not.toThrow(),
    );
  });

  test('proves city data, services and feature flags are config-driven', () => {
    const loadedConfigs = cityConfigPaths.map(loadWhiteLabelConfigFile);
    const cityKeys = loadedConfigs.map(({ config }) => config.city.key);
    const configVersions = loadedConfigs.map(({ config }) => config.configVersion);
    const checksums = loadedConfigs.map(({ checksum }) => checksum);

    expect(new Set(cityKeys).size).toBe(loadedConfigs.length);
    expect(new Set(configVersions).size).toBe(loadedConfigs.length);
    expect(new Set(checksums).size).toBe(loadedConfigs.length);

    const defaultConfig = loadedConfigs.find(({ path }) => path === defaultConfigPath);
    if (defaultConfig === undefined) throw new Error('Default White-Label config is missing');
    const defaultServiceKeys = new Set(defaultConfig.config.services.map(({ key }) => key));
    loadedConfigs
      .filter(({ path }) => path !== defaultConfigPath)
      .forEach(({ config }) => {
        const publicConfig = createPublicWhiteLabelConfig(config);
        const serializedPublicConfig = JSON.stringify(publicConfig);
        const citySpecificPublicConfig = serializedPublicConfig.replace(
          '"timezone":"Europe/Warsaw"',
          '',
        );

        expect(citySpecificPublicConfig).not.toMatch(/Warszawa|Warsaw|kontakt@zglosto\.pl/);
        expect(publicConfig.city.key).toBe(config.city.key);
        expect(publicConfig.services.every(({ enabled }) => enabled)).toBe(true);
        expect(
          publicConfig.services.some(({ key }) => key === config.routing.fallbackServiceKey),
        ).toBe(true);
        expect(config.services.some(({ key }) => !defaultServiceKeys.has(key))).toBe(true);
        expect(config.features).toEqual(publicConfig.features);
      });
  });

  test('loads and validates the default ZglosTO config', () => {
    const loaded = loadWhiteLabelConfigFile(defaultConfigPath);

    expect(loaded.config.city.key).toBe('zglosto');
    expect(loaded.config.city.displayName).toEqual({ 'pl-PL': 'Warszawa', en: 'Warsaw' });
    expect(loaded.config.contact.email).toBe('kontakt@zglosto.example');
    expect(loaded.config.localContent.footerText.en).toContain('Warsaw');
    expect(
      existsSync(join(repositoryRoot, 'frontend/public', loaded.config.branding.logoPath.slice(1))),
    ).toBe(true);
    expect(
      existsSync(
        join(repositoryRoot, 'frontend/public', loaded.config.branding.faviconPath.slice(1)),
      ),
    ).toBe(true);
    expect(loaded.config.routing.fallbackServiceKey).toBe('other');
    expect(loaded.config.services).toHaveLength(6);
    expect(loaded.config.services.map((service) => service.key)).toEqual([
      'district_heating',
      'public_transit',
      'municipal_services',
      'sewer_emergency',
      'roads',
      'other',
    ]);
    expect(loaded.config.services[4]?.key).toBe('roads');
    expect(loaded.checksum).toMatch(/^[0-9a-f]{64}$/);
    expectTypeOf(loaded).toEqualTypeOf<LoadedWhiteLabelConfig>();
    expect(createWhiteLabelConfigReadiness(loaded)).toEqual({
      status: 'valid',
      configVersion: loaded.config.configVersion,
      checksum: loaded.checksum,
    });
  });

  test('resolves one relative YAML path from WHITE_LABEL_CONFIG', () => {
    expect(
      resolveWhiteLabelConfigPath(
        { WHITE_LABEL_CONFIG: './config/white-label/zglosto.yaml' },
        repositoryRoot,
      ),
    ).toBe(defaultConfigPath);
  });

  test('requires a non-empty WHITE_LABEL_CONFIG value', () => {
    expectLoadError(() => resolveWhiteLabelConfigPath({}, repositoryRoot), 'missing_path');
    expect(() => resolveWhiteLabelConfigPath({ WHITE_LABEL_CONFIG: '  ' }, repositoryRoot)).toThrow(
      WhiteLabelConfigLoadError,
    );
  });

  test('reports read, YAML and schema errors without returning partial data', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'zglosto-white-label-'));
    const malformedPath = join(temporaryDirectory, 'malformed.yaml');
    const invalidPath = join(temporaryDirectory, 'invalid.yaml');

    try {
      expectLoadError(
        () => loadWhiteLabelConfigFile(join(temporaryDirectory, 'missing.yaml')),
        'read_error',
      );

      writeFileSync(malformedPath, 'city: [unterminated', 'utf8');
      expectLoadError(() => loadWhiteLabelConfigFile(malformedPath), 'yaml_error');

      writeFileSync(invalidPath, 'schemaVersion: 1\nconfigVersion: invalid\n', 'utf8');
      expectLoadError(() => loadWhiteLabelConfigFile(invalidPath), 'validation_error');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('rejects secret material at the loader boundary without echoing its value', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'zglosto-white-label-secret-'));
    const protectedPath = join(temporaryDirectory, 'protected.yaml');
    const secretLikeValue = ['sk', 'test', 'abcdefghijklmnop'].join('-');

    try {
      writeFileSync(
        protectedPath,
        `${readFileSync(defaultConfigPath, 'utf8')}\napiKey: ${secretLikeValue}\n`,
        'utf8',
      );

      try {
        loadWhiteLabelConfigFile(protectedPath);
        throw new Error('Expected protected White-Label config to be rejected');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(WhiteLabelConfigLoadError);
        if (!(error instanceof WhiteLabelConfigLoadError)) return;
        expect(error.code).toBe('validation_error');
        expect(error.message).toContain('$.apiKey: secret-bearing fields are forbidden');
        expect(error.message).not.toContain(secretLikeValue);
      }
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('caches one config and blocks switching the process to another city', () => {
    const loader = new SingleCityWhiteLabelConfigLoader();
    const first = loader.load({ WHITE_LABEL_CONFIG: defaultConfigPath }, repositoryRoot);
    const cached = loader.load({ WHITE_LABEL_CONFIG: defaultConfigPath }, repositoryRoot);

    expect(cached).toBe(first);
    expectLoadError(
      () => loader.load({ WHITE_LABEL_CONFIG: '/app/config/another-city.yaml' }, repositoryRoot),
      'different_config',
    );
  });
});
