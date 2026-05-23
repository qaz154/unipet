/**
 * Electron Preload Script — safe IPC bridge
 *
 * Validates pet:event payloads to block malformed IPC from external sources.
 * Other event channels pass through without schema validation.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ─── pet:event Payload Validation ──────────────────────

const VALID_PET_EVENT_TYPES = new Set([
  'state_change', 'speech', 'emotion', 'move', 'command', 'permission',
  'session_start', 'session_end',
]);

function isValidPetEvent(raw: unknown): raw is {
  type: string;
  source: string;
  timestamp: number;
} {
  if (typeof raw !== 'object' || raw === null) return false;
  const e = raw as Record<string, unknown>;
  if (typeof e.type !== 'string' || !VALID_PET_EVENT_TYPES.has(e.type)) return false;
  if (typeof e.source !== 'string') (e as Record<string, unknown>).source = 'unknown';
  if (typeof e.timestamp !== 'number' || !Number.isFinite(e.timestamp)) (e as Record<string, unknown>).timestamp = Date.now();
  return true;
}

contextBridge.exposeInMainWorld('unipet', {
  // Window
  show: () => ipcRenderer.invoke('pet:show'),
  hide: () => ipcRenderer.invoke('pet:hide'),
  move: (x: number, y: number) => ipcRenderer.invoke('pet:move', x, y),
  startDrag: () => ipcRenderer.invoke('pet:start-drag'),
  getPosition: () => ipcRenderer.invoke('pet:get-position'),

  // Fire-and-forget drag IPC (no round-trip, smooth)
  dragLock: (cursorX: number, cursorY: number) => ipcRenderer.send('drag-lock', cursorX, cursorY),
  dragMove: (cursorX: number, cursorY: number) => ipcRenderer.send('drag-move', cursorX, cursorY),
  dragEnd: () => ipcRenderer.send('drag-end'),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('pet:set-always-on-top', enabled),
  setClickThrough: (enabled: boolean) => ipcRenderer.invoke('pet:set-click-through', enabled),
  setContentProtection: (enabled: boolean) => ipcRenderer.invoke('pet:set-content-protection', enabled),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
  isPaused: () => ipcRenderer.invoke('app:is-paused'),
  isDnd: () => ipcRenderer.invoke('pet:is-dnd'),
  setState: (state: string) => ipcRenderer.invoke('pet:set-state', state),
  installAgent: (agentId: string) => ipcRenderer.invoke('agent:install', agentId),
  uninstallAgent: (agentId: string) => ipcRenderer.invoke('agent:uninstall', agentId),

  // Window controls (for settings window frameless titlebar)
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),

  // Adapter IPC — allowlisted channels only
  invoke: (channel: string, ...args: unknown[]) => {
    const allowedInvoke = [
      'adapter:start-all', 'adapter:stop-all',
    ];
    if (!allowedInvoke.includes(channel)) return Promise.reject(new Error(`IPC channel "${channel}" not allowed`));
    return ipcRenderer.invoke(channel, ...args);
  },

  // Permission response
  respondToPermission: (permissionId: string, action: string) =>
    ipcRenderer.invoke('pet:permission-response', permissionId, action),

  // Settings persistence
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:get-all'),

  // Events — allowlist + pet:event schema guard
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowed = [
      'pet:pause-toggled', 'pet:event', 'pet:mini-mode', 'pet:size-changed',
      'pet:clicked', 'pet:dnd-changed', 'settings:loaded', 'settings:changed',
      'mouse-move', 'drag:started', 'drag:ended', 'throw-pet', 'shortcut', 'user-idle',
      'permission:resolved',
    ];
    if (!allowed.includes(channel)) return;

    if (channel === 'pet:event') {
      // Only pet:event payloads are validated against the PetEvent schema.
      // Other event types (clicked, mouse-move, etc.) pass raw args through.
      ipcRenderer.on(channel, (_event, ...args) => {
        if (args.length > 0 && isValidPetEvent(args[0])) {
          callback(...args);
        } else if (args.length > 0) {
          console.warn('[preload] Dropped invalid pet:event:', JSON.stringify(args[0]).slice(0, 200));
        }
      });
    } else {
      // pet:clicked → (x, y) as numbers
      // mouse-move → (x, y) as numbers
      // settings:changed → (key, value)
      // pet:pause-toggled → (isPaused: boolean)
      // pet:mini-mode → (mini: boolean)
      // pet:size-changed → ({ width, height })
      // settings:loaded → (settings: object)
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
