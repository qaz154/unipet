/**
 * Electron Preload Script — safe IPC bridge (CJS required by Electron)
 */

const { contextBridge, ipcRenderer } = require('electron');

const VALID_PET_EVENT_TYPES = new Set([
  'state_change', 'speech', 'emotion', 'move', 'command', 'permission',
  'session_start', 'session_end',
]);

function isValidPetEvent(raw) {
  if (typeof raw !== 'object' || raw === null) return false;
  return (
    typeof raw.type === 'string' &&
    VALID_PET_EVENT_TYPES.has(raw.type) &&
    typeof raw.source === 'string' &&
    typeof raw.timestamp === 'number' &&
    Number.isFinite(raw.timestamp)
  );
}

contextBridge.exposeInMainWorld('unipet', {
  show: () => ipcRenderer.invoke('pet:show'),
  hide: () => ipcRenderer.invoke('pet:hide'),
  move: (x, y) => ipcRenderer.invoke('pet:move', x, y),
  startDrag: () => ipcRenderer.invoke('pet:start-drag'),
  getPosition: () => ipcRenderer.invoke('pet:get-position'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('pet:set-always-on-top', enabled),
  setClickThrough: (enabled) => ipcRenderer.invoke('pet:set-click-through', enabled),
  setContentProtection: (enabled) => ipcRenderer.invoke('pet:set-content-protection', enabled),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
  isPaused: () => ipcRenderer.invoke('app:is-paused'),
  setState: (state) => ipcRenderer.invoke('pet:set-state', state),
  installAgent: (agentId) => ipcRenderer.invoke('agent:install', agentId),

  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),

  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  respondToPermission: (permissionId, action) =>
    ipcRenderer.invoke('pet:permission-response', permissionId, action),

  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:get-all'),

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  on: (channel, callback) => {
    const allowed = [
      'pet:pause-toggled', 'pet:event', 'pet:mini-mode', 'pet:size-changed',
      'pet:clicked', 'settings:loaded', 'settings:changed', 'mouse-move',
      'drag:started', 'drag:ended', 'throw-pet', 'shortcut', 'permission:resolved',
    ];
    if (!allowed.includes(channel)) return;

    if (channel === 'pet:event') {
      ipcRenderer.on(channel, (_event, ...args) => {
        if (args.length > 0 && isValidPetEvent(args[0])) {
          callback(...args);
        }
      });
    } else {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
