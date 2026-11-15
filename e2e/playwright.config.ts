import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { BASE_URL, TIME_ZONE } from './support/env';

// The preinstalled browsers (matching @playwright/test 1.63.0), unless the environment says otherwise.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

/**
 * Family Rhythm journeys against a real local stack (see README.md). One worker: every test
 * resets the shared demo household first, so tests must not run at the same time.
 */
export default defineConfig({
  testDir: './journeys',
  outputDir: './.cache/test-results',
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    timezoneId: TIME_ZONE,
    locale: 'en-US',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
