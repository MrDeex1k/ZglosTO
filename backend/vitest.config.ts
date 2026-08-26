import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const backendDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    env: {
      WHITE_LABEL_CONFIG: resolve(backendDirectory, '../config/white-label/zglosto.yaml'),
    },
    include: ['{config,contracts,lib,nest,operations,storage}/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
