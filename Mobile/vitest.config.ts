import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'expo/fetch': fileURLToPath(new URL('./src/test/expo-fetch.ts', import.meta.url)),
    },
  },
  test: {
    server: { deps: { inline: ['zod'] } },
    setupFiles: [fileURLToPath(new URL('../scripts/assert-test-runtime.ts', import.meta.url))],
    environment: 'node',
  },
});
