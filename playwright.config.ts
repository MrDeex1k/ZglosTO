import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4179';
const composeURL = process.env.BROWSER_COMPOSE_URL;
const suite = process.env.BROWSER_DESKTOP_EXECUTABLE ? 'desktop' : composeURL ? 'compose' : null;
const reportPath = suite ? `output/browser-${suite}` : null;

// Flashwright keeps the upstream entry point and config filename.
export default defineConfig({
  testDir: './tests/browser',
  testMatch: suite ? `**/*.${suite}.spec.ts` : '**/*.spec.ts',
  testIgnore: suite ? [] : ['**/*.compose.spec.ts', '**/*.desktop.spec.ts'],
  workers: suite ? 1 : 2,
  outputDir: reportPath ? `${reportPath}/results` : 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', ...(reportPath ? { outputFolder: `${reportPath}/report` } : {}) }],
  ],
  use: {
    baseURL: composeURL ?? baseURL,
    locale: 'pl-PL',
    isolation: 'strict',
    waitForAnimations: true,
    failFastWhenIdle: false,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects:
    suite === 'desktop'
      ? [{ name: 'electron' }]
      : [
          { name: 'chromium', use: { browserName: 'chromium' } },
          { name: 'webkit', use: { browserName: 'webkit' } },
        ],
  webServer: suite
    ? []
    : {
        command:
          'bun run --filter frontend-zglosto preview --host 127.0.0.1 --port 4179 --strictPort',
        url: baseURL,
      },
});
