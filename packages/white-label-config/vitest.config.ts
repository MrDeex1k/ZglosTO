import { fileURLToPath } from 'node:url';
export default {
  test: {
    setupFiles: [fileURLToPath(new URL('../../scripts/assert-test-runtime.ts', import.meta.url))],
    server: { deps: { inline: ['zod'] } },
  },
};
