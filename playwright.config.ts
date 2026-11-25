import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4179';
const composeURL = process.env.BROWSER_COMPOSE_URL;

// Flashwright keeps the upstream entry point and config filename.
export default defineConfig({
  testDir: './tests/browser',
  testMatch: composeURL ? '**/*.compose.spec.ts' : '**/*.spec.ts',
  testIgnore: composeURL ? [] : '**/*.compose.spec.ts',
  workers: composeURL ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: composeURL ?? baseURL,
    locale: 'pl-PL',
    isolation: 'strict',
    waitForAnimations: true,
    failFastWhenIdle: false,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: composeURL
    ? []
    : {
        command:
          'bun run --filter frontend-zglosto preview --host 127.0.0.1 --port 4179 --strictPort',
        url: baseURL,
      },
});
