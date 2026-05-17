/**
 * Single-window architecture smoke tests.
 *
 * Verifies the app boots correctly:
 *   1. App spawns the render window
 *   2. Discovery file is written with a usable HTTP port
 *   3. Pet canvas renders
 *   4. Window is set to always-on-top
 */

import { test, expect } from '@playwright/test';
import { launchUniPet, waitForDiscovery, classifyWindows } from './helpers';

test.describe('UniPet boot', () => {
  test('opens render window and writes discovery file', async () => {
    const { app, discoveryPath } = await launchUniPet();
    try {
      const discovery = await waitForDiscovery(discoveryPath);
      expect(discovery.httpPort).toBeGreaterThan(0);
      expect(discovery.pid).toBeGreaterThan(0);

      const { render } = await classifyWindows(app);
      expect(render, 'render window must be present').toBeDefined();
    } finally {
      await app.close();
    }
  });

  test('renders the pet canvas in the render window', async () => {
    const { app, discoveryPath } = await launchUniPet();
    try {
      await waitForDiscovery(discoveryPath);
      const { render } = await classifyWindows(app);
      await render!.waitForSelector('canvas.pet-canvas', { timeout: 10_000 });
      const canvas = await render!.locator('canvas.pet-canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  test('render window is configured as always-on-top', async () => {
    const { app, discoveryPath } = await launchUniPet();
    try {
      await waitForDiscovery(discoveryPath);
      const states = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => ({
          id: w.id,
          alwaysOnTop: w.isAlwaysOnTop(),
          size: w.getSize(),
        })),
      );
      expect(states.length).toBeGreaterThanOrEqual(1);
      for (const s of states) {
        expect(s.alwaysOnTop, `window ${s.id} alwaysOnTop`).toBe(true);
      }
    } finally {
      await app.close();
    }
  });
});
