import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: { deps: { inline: ['zod'] } },
    setupFiles: [fileURLToPath(new URL('../scripts/assert-test-runtime.ts', import.meta.url))],
    dir: './src',
  },
});
