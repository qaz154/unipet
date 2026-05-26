/**
 * HTTP API + IPC propagation tests.
 *
 * The desktop app's HTTP server is the integration boundary for external
 * agents (Claude Code, Codex, etc.). These specs verify that:
 *   1. /api/state with a valid state returns 200 and the renderer is informed
 *   2. /api/state with a disallowed state returns 400
 *   3. /api/speech sanitises secrets before forwarding
 *   4. /api/speech with oversized body returns 413
 *   5. /api/status reports running + pid
 */

import { test, expect } from '@playwright/test';
import {
  launchUniPet,
  waitForDiscovery,
  classifyWindows,
  httpPost,
  readAuthToken,
} from './helpers';

test.describe('HTTP API', () => {
  test('GET /api/status reports running with the expected pid/port', async () => {
    const { app, discoveryPath } = await launchUniPet();
    try {
      const discovery = await waitForDiscovery(discoveryPath);
      const res = await fetch(`http://127.0.0.1:${discovery.httpPort}/api/status`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { running: boolean; port: number; pid: number };
      expect(body.running).toBe(true);
      expect(body.port).toBe(discovery.httpPort);
      expect(body.pid).toBe(discovery.pid);
    } finally {
      await app.close();
    }
  });

  test('POST /api/state accepts allowed states and rejects disallowed ones', async () => {
    const { app, discoveryPath, tempHome } = await launchUniPet();
    try {
      const { httpPort } = await waitForDiscovery(discoveryPath);
      const token = readAuthToken(tempHome);

      // Allowed
      const ok = await httpPost(httpPort, '/api/state', { state: 'happy' }, token);
      expect(ok.status).toBe(200);

      // Disallowed — `dragging` is in PET_STATES but not externally allowed
      const blocked = await httpPost(httpPort, '/api/state', { state: 'dragging' }, token);
      expect(blocked.status).toBe(400);

      // Garbage
      const garbage = await httpPost(httpPort, '/api/state', { state: 'not-a-real-state' }, token);
      expect(garbage.status).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /api/speech redacts secrets and URLs before forwarding', async () => {
    const { app, discoveryPath, tempHome } = await launchUniPet();
    try {
      const { httpPort } = await waitForDiscovery(discoveryPath);
      const token = readAuthToken(tempHome);

      const res = await httpPost(httpPort, '/api/speech', {
        message: 'Visit https://example.com — api_key=abc123',
      }, token);
      expect(res.status).toBe(200);
      const body = res.body as { message?: string };
      expect(body.message).toBeDefined();
      expect(body.message!).not.toContain('example.com');
      expect(body.message!).not.toContain('abc123');
      expect(body.message!).toMatch(/\[url\]/);
    } finally {
      await app.close();
    }
  });

  test('POST with oversized body returns 413', async () => {
    const { app, discoveryPath, tempHome } = await launchUniPet();
    try {
      const { httpPort } = await waitForDiscovery(discoveryPath);
      const token = readAuthToken(tempHome);

      // MAX_BODY_SIZE is 4096; send 8KB JSON to overflow
      const bigPayload = JSON.stringify({ message: 'A'.repeat(8000) });
      const res = await fetch(`http://127.0.0.1:${httpPort}/api/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: bigPayload,
      });
      expect(res.status).toBe(413);
    } finally {
      await app.close();
    }
  });

  test('renderer receives the pet:event after /api/state', async () => {
    const { app, discoveryPath, tempHome } = await launchUniPet();
    try {
      const { httpPort } = await waitForDiscovery(discoveryPath);
      const token = readAuthToken(tempHome);
      const { render } = await classifyWindows(app);
      await render!.waitForSelector('canvas.pet-canvas');

      // Subscribe in-page to the IPC event before firing the HTTP request
      const recv = render!.evaluate(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('no event in 3s')), 3000);
            (window as { unipet?: { on: (c: string, cb: (...a: unknown[]) => void) => void } })
              .unipet?.on('pet:event', (ev: unknown) => {
                clearTimeout(timeout);
                resolve(ev);
              });
          }),
      );

      // Tiny race-safety wait so the listener has time to register
      await render!.waitForTimeout(150);
      const post = await httpPost(httpPort, '/api/state', { state: 'celebrating' }, token);
      expect(post.status).toBe(200);

      const event = (await recv) as { state?: string };
      expect(event.state).toBe('celebrating');
    } finally {
      await app.close();
    }
  });
});
