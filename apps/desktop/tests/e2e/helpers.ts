/**
 * Shared helpers for the Electron e2e specs.
 *
 * launchUniPet() boots the desktop app with a clean temp HOME so each test
 * gets its own settings file and discovery file location. Returns the
 * ElectronApplication plus paths to the discovery file the test can poll
 * once the HTTP server has bound a port.
 */

import { _electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(CURRENT_DIR, '..', '..');
const MAIN_PATH = join(REPO_ROOT, 'dist-electron', 'main.js');

export interface LaunchOptions {
  /** Extra env vars to inject (override discovery path, etc.) */
  env?: Record<string, string>;
}

export interface LaunchResult {
  app: ElectronApplication;
  tempHome: string;
  discoveryPath: string;
}

export async function launchUniPet(options: LaunchOptions = {}): Promise<LaunchResult> {
  const tempHome = mkdtempSync(join(tmpdir(), 'unipet-e2e-'));
  // Linux: discovery file is written under HOME/.local/state/unipet/ipc.json.
  // Other OSes have their own paths; for this test we force the Linux path
  // by setting HOME — the desktop app uses homedir() which honors HOME.
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HOME: tempHome,
    USERPROFILE: tempHome,
    ...options.env,
  };
  const discoveryPath = join(tempHome, '.local', 'state', 'unipet', 'ipc.json');

  const app = await _electron.launch({
    args: [MAIN_PATH],
    env,
    timeout: 20_000,
  });

  return { app, tempHome, discoveryPath };
}

/** Wait for the discovery JSON file to be written by the HTTP server. */
export async function waitForDiscovery(
  discoveryPath: string,
  timeoutMs = 10_000,
): Promise<{ httpPort: number; pid: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(discoveryPath)) {
      try {
        const data = JSON.parse(readFileSync(discoveryPath, 'utf-8'));
        if (typeof data.httpPort === 'number') return data;
      } catch {
        // Partial write — retry
      }
    }
    await wait(100);
  }
  throw new Error(`Discovery file not written within ${timeoutMs}ms: ${discoveryPath}`);
}

/** Identify the render window from all open windows. */
export async function classifyWindows(app: ElectronApplication) {
  const pages = app.windows();
  if (pages.length === 0) {
    throw new Error('Expected at least 1 window (render), got 0');
  }
  const classified: Array<{ kind: 'render' | 'unknown'; page: typeof pages[number] }> = [];
  for (const page of pages) {
    const url = page.url();
    if (url.includes('index.html') || url.startsWith('http://localhost')) {
      classified.push({ kind: 'render', page });
    } else {
      classified.push({ kind: 'unknown', page });
    }
  }
  return {
    all: classified,
    render: classified.find((c) => c.kind === 'render')?.page,
  };
}

/** POST a JSON body to the desktop app's HTTP server. */
export async function httpPost(
  port: number,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed };
}
