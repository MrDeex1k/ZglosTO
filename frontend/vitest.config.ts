import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: dirname(createRequire(import.meta.url).resolve('react/package.json')),
      'react-dom': dirname(createRequire(import.meta.url).resolve('react-dom/package.json')),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../scripts/assert-test-runtime.ts', import.meta.url))],
    server: { deps: { inline: true } },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['react-i18next', 'lucide-react', 'use-sync-external-store/shim'],
        },
      },
    },
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
