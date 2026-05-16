/**
 * Hit Window Preload — safe IPC bridge for input events
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hitAPI', {
  // Drag
  dragLock: (cursorX, cursorY) => ipcRenderer.send('drag-lock', cursorX, cursorY),
  dragMove: (cursorX, cursorY) => ipcRenderer.send('drag-move', cursorX, cursorY),
  dragEnd: () => ipcRenderer.send('drag-end'),

  // Throw (velocity-based flick)
  throwPet: (vx, vy) => ipcRenderer.send('throw-pet', vx, vy),

  // Click
  click: (x, y) => ipcRenderer.send('pet:clicked', x, y),
  contextMenu: () => ipcRenderer.send('pet:context-menu'),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),

  // Mouse-move forwarded to render window so eye tracking can work
  // (render window is permanently click-through and never sees DOM mousemove).
  mouseMove: (x, y) => ipcRenderer.send('mouse-move', x, y),

  // Settings sync
  on: (channel, callback) => {
    const allowed = ['pet:pause-toggled', 'pet:mini-mode', 'settings:changed'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
