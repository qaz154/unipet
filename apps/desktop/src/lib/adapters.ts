/**
 * Desktop app adapter initialization.
 *
 * Adapters (HTTP, Git, MCP, hook-based) use Node.js APIs and must run
 * in the Electron main process — NOT in the renderer.
 *
 * This module provides a lightweight bridge so the renderer can request
 * adapter operations via IPC. The actual adapter registry lives in the
 * main process and forwards events to the renderer through `pet:event`.
 *
 * The main process PetHttpServer already handles:
 * - POST /api/state   → pet:event
 * - POST /api/speech  → pet:event
 * - POST /api/emotion → pet:event
 * - GET  /api/events  → SSE stream
 * - GET  /api/status  → status
 */

import { DEFAULT_HTTP_PORT } from '@unipet/core';

/** Adapter configuration (mirrors the main-process type without importing @unipet/adapters) */
export interface AdapterConfig {
  enabled: boolean;
  httpPort: number;
  overrides: Record<string, unknown>;
}

/**
 * Create an adapter config for the given adapter id.
 * Actual adapter startup happens in the main process via IPC.
 */
export function getDefaultAdapterConfig(adapterId: string, enabled: boolean): AdapterConfig {
  return {
    enabled,
    httpPort: DEFAULT_HTTP_PORT,
    overrides: {},
  };
}

/**
 * Request the main process to start adapters.
 * The main process initializes the AdapterRegistry and starts enabled adapters.
 * Events flow back to the renderer via the `pet:event` IPC channel.
 */
export async function startEnabledAdapters(
  _bus: unknown, // Not used — adapter events arrive via IPC
  enabledIds: string[],
): Promise<{ started: string[]; failed: Array<{ id: string; error: string }> }> {
  const ep = window.unipet;
  if (!ep) {
    return { started: [], failed: [] };
  }

  try {
    // Request the main process to start adapters
    const result = await ep.invoke?.('adapter:start-all', enabledIds);
    return (result as { started: string[]; failed: Array<{ id: string; error: string }> }) ?? { started: [], failed: [] };
  } catch {
    return { started: [], failed: [] };
  }
}

/** Stop all adapters in the main process */
export async function stopAllAdapters(): Promise<void> {
  const ep = window.unipet;
  if (!ep) return;
  try {
    await ep.invoke?.('adapter:stop-all');
  } catch { /* ignore */ }
}
