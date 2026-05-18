/**
 * Shared application context — single mutable object that all Electron
 * main-process modules reference so they can coordinate state.
 */

import type { BrowserWindow, Tray } from 'electron';
import type { PetHttpServer } from './http-server.js';
import type { AdapterRegistry } from '@unipet/adapters';
import type { EventBus } from '@unipet/core';

// ─── Types ───────────────────────────────────────────────

export interface DragSnapshot {
  winX: number;
  winY: number;
  winW: number;
  winH: number;
  cursorX: number;
  cursorY: number;
}

// ─── Constants ───────────────────────────────────────────

/** Window size presets — canvas = PW×PH (24×32) at up to 8× scale. */
export const SIZE_PRESETS: Record<string, { width: number; height: number }> = {
  S: { width: 240, height: 320 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 480 },
};

export const SNAP_TOLERANCE = 30;
export const MINI_OFFSET_RATIO = 0.486;

// ─── Context ─────────────────────────────────────────────

export interface AppContext {
  renderWin: BrowserWindow | undefined;
  settingsWindow: BrowserWindow | undefined;
  dashboardWindow: BrowserWindow | undefined;
  tray: Tray | undefined;
  isPaused: boolean;
  isDnd: boolean;
  currentState: string;
  isMiniMode: boolean;
  dragSnapshot: DragSnapshot | null;
  httpServer: PetHttpServer;
  adapterRegistry: AdapterRegistry | null;
  adapterBus: EventBus | null;
  topmostTimer: ReturnType<typeof setInterval> | null;
  settings: Record<string, unknown>;
}

export function createAppContext(
  httpServer: PetHttpServer,
  settings: Record<string, unknown>,
): AppContext {
  return {
    renderWin: undefined,
    settingsWindow: undefined,
    dashboardWindow: undefined,
    tray: undefined,
    isPaused: false,
    isDnd: false,
    currentState: 'idle',
    isMiniMode: false,
    dragSnapshot: null,
    httpServer,
    adapterRegistry: null,
    adapterBus: null,
    topmostTimer: null,
    settings,
  };
}
