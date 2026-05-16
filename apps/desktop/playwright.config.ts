import { defineConfig } from '@playwright/test';

/**
 * Playwright config — Electron e2e tests for UniPet.
 *
 * Run with: pnpm --filter @unipet/desktop test:e2e
 *
 * The Electron tests don't use a browser. Each spec spawns the desktop app
 * via Playwright's `_electron.launch()`, asserts against the windows, and
 * cleans up. Specs must `await electronApp.close()` in afterEach to avoid
 * leaked Electron processes on CI.
 *
 * Required: a built `dist-electron/main.js` (run `pnpm --filter @unipet/desktop build:electron`
 * before invoking tests, or use the `build:electron` reporter step).
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Electron specs use a singleton app instance per spec, so parallelising
  // them within a file is fine but not across files (port conflict on 23333).
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: { trace: 'on-first-retry' },
});
