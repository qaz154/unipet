/**
 * UniPet Desktop Pet — Production-grade Electron Main Process
 *
 * Architecture:
 * - Transparent render window displays pet and handles input directly
 * - Mini mode: edge snap, peek on hover, parabolic jump
 * - Always-on-top with watchdog timer
 * - Crash recovery: auto-reload on render process crash
 * - Adaptive tray: sleep/wake, mini mode, size, sound, settings
 * - Session tracking with state priority
 */

import { app, BrowserWindow, screen, globalShortcut, dialog, shell } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { join } from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { DEFAULT_HTTP_PORT } from '@unipet/core';
import { PetHttpServer } from './http-server.js';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// Extracted modules
import { createEnhancedLogger, logToFile } from './logging.js';
import { loadSettings, getSetting, setSetting } from './settings-persistence.js';
import { createAppContext, SIZE_PRESETS, SNAP_TOLERANCE, MINI_OFFSET_RATIO } from './app-context.js';
import { createTray, updateTrayTooltip, updateTrayMenu } from './tray-menu.js';
import type { TrayDeps } from './tray-menu.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import type { IpcDeps } from './ipc-handlers.js';

// ESM-compatible __dirname replacement
const dir = fileURLToPath(new URL('.', import.meta.url));

// ─── Bootstrap ───────────────────────────────────────────

const log = createEnhancedLogger();
const settings = loadSettings();
const httpServer = new PetHttpServer();
const ctx = createAppContext(httpServer, settings);

// ─── Window Helpers ──────────────────────────────────────

function getSavedPosition(): { x: number; y: number } {
  const pos = getSetting<{ x: number; y: number } | null>(settings, 'windowPosition', null);
  const size = getSetting<string>(settings, 'petSize', 'M');
  const s = SIZE_PRESETS[size] || SIZE_PRESETS.M;
  const { width, height, x: waX, y: waY } = screen.getPrimaryDisplay().workArea;
  const fallback = { x: waX + width - s.width - 40, y: waY + height - s.height - 40 };

  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    const visible = (
      pos.x >= waX - s.width * 0.5 &&
      pos.x < waX + width - s.width * 0.5 &&
      pos.y >= waY - s.height * 0.5 &&
      pos.y < waY + height - s.height * 0.5
    );
    if (visible) return pos;
    log.warn('Saved position off-screen, resetting to default.');
    return fallback;
  }
  return fallback;
}

function saveWindowPosition(): void {
  if (!ctx.renderWin) return;
  const [x, y] = ctx.renderWin.getPosition();
  setSetting(settings, 'windowPosition', { x, y });
}

function getWindowSize(): { width: number; height: number } {
  const size = getSetting<string>(settings, 'petSize', 'M');
  return SIZE_PRESETS[size] || SIZE_PRESETS.M;
}

// ─── Platform-Specific Window Options ────────────────────

/**
 * Returns platform-specific BrowserWindow constructor options.
 *
 * macOS:
 *  - `type: 'panel'` gives NSPanel behavior (stays above other windows, does not steal focus)
 *  - `titleBarStyle: 'hiddenInset'` hides the native title bar while keeping traffic-light positioning
 *  - `skipTaskbar` is ignored on macOS; dock hiding is handled separately via `app.dock?.hide()`
 *
 * Linux:
 *  - X11: transparent windows work with the default settings
 *  - Wayland: `transparent: true` alone can leave artifacts; a fully transparent background color
 *    as a fallback ensures correct compositing.  Note that some Wayland compositors still have
 *    limitations with always-on-top transparent windows.
 */
function getPlatformWindowOptions(): Partial<BrowserWindowConstructorOptions> {
  const platform = process.platform;

  if (platform === 'darwin') {
    return {
      type: 'panel',
      titleBarStyle: 'hiddenInset',
      // skipTaskbar is not honored on macOS; dock visibility is set via app.dock?.hide()
      skipTaskbar: false,
      trafficLightPosition: { x: 0, y: 0 },
    };
  }

  if (platform === 'linux') {
    // Wayland compositors may not honour `transparent` correctly without an explicit
    // fully-transparent background colour.  X11 works fine with just `transparent: true`.
    const isWayland = !!process.env['WAYLAND_DISPLAY'] || !!process.env['XDG_SESSION_TYPE']?.includes('wayland');
    if (isWayland) {
      return {
        backgroundColor: '#00000000',
      };
    }
    return {};
  }

  // Windows and other platforms use the defaults
  return {};
}

function isAllowedAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return true;
    if (process.env['VITE_DEV_SERVER_URL']) {
      const devUrl = new URL(process.env['VITE_DEV_SERVER_URL']);
      return parsed.origin === devUrl.origin;
    }
    return false;
  } catch {
    return false;
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function attachNavigationGuards(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppUrl(url)) return;
    event.preventDefault();
    log.warn('Blocked renderer navigation:', url);
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Failed to open external URL:', message);
      });
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Failed to open external URL:', message);
      });
    } else {
      log.warn('Blocked window.open URL:', url);
    }
    return { action: 'deny' };
  });
}

// ─── Render Window ───────────────────────────────────────

function createRenderWindow(): BrowserWindow {
  const pos = getSavedPosition();
  const size = getWindowSize();
  const platformOpts = getPlatformWindowOptions();

  ctx.renderWin = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    ...platformOpts,
    webPreferences: {
      preload: join(dir, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  attachNavigationGuards(ctx.renderWin);

  // macOS: hide traffic-light buttons and prevent focus theft
  if (process.platform === 'darwin') {
    ctx.renderWin.setWindowButtonVisibility(false);
  }

  ctx.renderWin.setFocusable(false);
  ctx.renderWin.setAlwaysOnTop(true, 'pop-up-menu');
  ctx.renderWin.setContentProtection(getSetting<boolean>(settings, 'screenPrivacy', true));

  if (process.env['VITE_DEV_SERVER_URL']) {
    ctx.renderWin.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    ctx.renderWin.loadFile(join(dir, '../dist/index.html'));
  }
  ctx.renderWin.showInactive();

  ctx.renderWin.on('move', () => {
    saveWindowPosition();
  });

  ctx.renderWin.webContents.on('did-finish-load', () => {
    ctx.renderWin?.webContents.send('settings:loaded', settings);
    ctx.renderWin?.webContents.send('pet:size-changed', size);
  });

  ctx.renderWin.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) {
      const tag = ['', '', 'WARN', 'ERROR'][level] || 'LOG';
      logToFile('error', `[RENDERER] ${tag}: ${message} (${source}:${line})`);
    }
  });

  // Crash recovery
  ctx.renderWin.webContents.on('render-process-gone', (_e, details) => {
    log.error('Render process crashed:', details?.reason);
    setTimeout(() => {
      if (ctx.renderWin && !ctx.renderWin.isDestroyed()) {
        ctx.renderWin.reload();
        reassertTopmost();
      }
    }, 1000);
  });

  return ctx.renderWin;
}

// ─── Always-on-Top Watchdog ──────────────────────────────

const TOPMOST_WATCHDOG_MS = 5000;

function startTopmostWatchdog(): void {
  if (ctx.topmostTimer) clearInterval(ctx.topmostTimer);
  ctx.topmostTimer = setInterval(() => {
    reassertTopmost();
  }, TOPMOST_WATCHDOG_MS);
}

function reassertTopmost(): void {
  if (ctx.renderWin && !ctx.renderWin.isDestroyed()) {
    ctx.renderWin.setAlwaysOnTop(true, 'pop-up-menu');
  }
}

// ─── Mini Mode ───────────────────────────────────────────

function checkMiniModeSnap(winX: number, _winY: number, winW: number, _winH: number): boolean {
  const workArea = screen.getPrimaryDisplay().workArea;
  const centerX = winX + winW / 2;

  if (centerX - workArea.x < SNAP_TOLERANCE) {
    enterMiniMode('left');
    return true;
  }
  if (workArea.x + workArea.width - centerX < SNAP_TOLERANCE) {
    enterMiniMode('right');
    return true;
  }
  return false;
}

function enterMiniMode(edge: 'left' | 'right'): void {
  if (ctx.isMiniMode) return;
  ctx.isMiniMode = true;

  const size = getWindowSize();
  const workArea = screen.getPrimaryDisplay().workArea;
  let targetX: number;
  if (edge === 'left') {
    targetX = workArea.x - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
  } else {
    targetX = workArea.x + workArea.width - Math.round(size.width * MINI_OFFSET_RATIO);
  }
  const targetY = workArea.y + Math.round((workArea.height - size.height) / 2);

  animateWindow(targetX, targetY, 100);
  ctx.renderWin?.webContents.send('pet:mini-mode', true);
}

function exitMiniMode(): void {
  if (!ctx.isMiniMode) return;
  ctx.isMiniMode = false;

  const saved = getSetting<{ x: number; y: number } | null>(settings, 'windowPosition', null);
  if (saved && ctx.renderWin && !ctx.renderWin.isDestroyed()) {
    animateWindow(saved.x, saved.y, 300);
  }

  ctx.renderWin?.webContents.send('pet:mini-mode', false);
}

function animateWindow(targetX: number, targetY: number, duration: number): void {
  if (!ctx.renderWin || ctx.renderWin.isDestroyed()) return;
  const [startX, startY] = ctx.renderWin.getPosition();
  const startTime = Date.now();

  const step = () => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t * (2 - t); // ease-out quadratic
    const x = Math.round(startX + (targetX - startX) * eased);
    const y = Math.round(startY + (targetY - startY) * eased);
    ctx.renderWin?.setPosition(x, y);
    if (t < 1) setTimeout(step, 16);
  };
  step();
}

// ─── Settings Window ─────────────────────────────────────

function openSettings(): void {
  if (ctx.settingsWindow && !ctx.settingsWindow.isDestroyed()) {
    ctx.settingsWindow.show();
    ctx.settingsWindow.focus();
    return;
  }

  ctx.settingsWindow = new BrowserWindow({
    width: 800,
    height: 560,
    minWidth: 640,
    minHeight: 480,
    title: 'UniPet Settings',
    show: false,
    backgroundColor: '#1c1c1f',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(dir, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ctx.settingsWindow.setMenuBarVisibility(false);
  ctx.settingsWindow.center();

  if (process.env['VITE_DEV_SERVER_URL']) {
    ctx.settingsWindow.loadURL(`${process.env['VITE_DEV_SERVER_URL']}#/settings`);
  } else {
    ctx.settingsWindow.loadFile(join(dir, '../dist/index.html'), { hash: '/settings' });
  }

  const showTimeout = setTimeout(() => {
    log.info('Settings fallback show (ready-to-show timeout)');
    if (ctx.settingsWindow && !ctx.settingsWindow.isDestroyed()) {
      ctx.settingsWindow.show();
    }
  }, 3000);

  ctx.settingsWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    log.info('Settings ready-to-show, showing window');
    ctx.settingsWindow?.show();
    ctx.settingsWindow?.webContents.send('settings:loaded', settings);
  });

  ctx.settingsWindow.webContents.on('did-finish-load', () => {
    log.info('Settings page finished loading');
  });

  ctx.settingsWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log.error('Settings failed to load:', code, desc);
  });

  ctx.settingsWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('Settings render process gone:', details.reason);
  });

  ctx.settingsWindow.on('closed', () => {
    log.info('Settings window closed');
    ctx.settingsWindow = undefined;
  });
}

// ─── Dashboard Window ────────────────────────────────────

function openDashboard(): void {
  if (ctx.dashboardWindow && !ctx.dashboardWindow.isDestroyed()) {
    ctx.dashboardWindow.show();
    ctx.dashboardWindow.focus();
    return;
  }

  ctx.dashboardWindow = new BrowserWindow({
    width: 640,
    height: 480,
    minWidth: 480,
    minHeight: 360,
    title: 'Sessions Dashboard',
    show: false,
    backgroundColor: '#1c1c1f',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(dir, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ctx.dashboardWindow.setMenuBarVisibility(false);
  ctx.dashboardWindow.center();

  if (process.env['VITE_DEV_SERVER_URL']) {
    ctx.dashboardWindow.loadURL(`${process.env["VITE_DEV_SERVER_URL"]}#/dashboard`);
  } else {
    ctx.dashboardWindow.loadFile(join(dir, '../dist/index.html'), { hash: '/dashboard' });
  }

  const showTimeout = setTimeout(() => {
    log.info('Dashboard fallback show (ready-to-show timeout)');
    if (ctx.dashboardWindow && !ctx.dashboardWindow.isDestroyed()) {
      ctx.dashboardWindow.show();
    }
  }, 3000);

  ctx.dashboardWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    log.info('Dashboard ready-to-show, showing window');
    ctx.dashboardWindow?.show();
    ctx.dashboardWindow?.webContents.send('settings:loaded', settings);
  });

  ctx.dashboardWindow.webContents.on('did-finish-load', () => {
    log.info('Dashboard page finished loading');
  });

  ctx.dashboardWindow.on('closed', () => {
    log.info('Dashboard window closed');
    ctx.dashboardWindow = undefined;
  });
}

// ─── Dependency Wiring ───────────────────────────────────

const trayDeps: TrayDeps = {
  exitMiniMode,
  checkMiniModeSnap,
  openSettings,
  openDashboard,
  checkForUpdates: () => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      log.info('No updates available');
    });
  },
  log,
  dir,
};

const ipcDeps: IpcDeps = {
  openSettings,
  openDashboard,
  reassertTopmost,
  saveWindowPosition,
  checkMiniModeSnap,
  exitMiniMode,
  startTopmostWatchdog,
  updateTrayTooltip: () => updateTrayTooltip(ctx),
  updateTrayMenu: () => updateTrayMenu(ctx, trayDeps),
  log,
  dir,
};

registerIpcHandlers(ctx, ipcDeps);

// ─── Global Error Handling ───────────────────────────────

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

// ─── App Lifecycle ───────────────────────────────────────

app.whenReady().then(() => {
  createRenderWindow();
  startTopmostWatchdog();
  createTray(ctx, trayDeps);
  httpServer.start(DEFAULT_HTTP_PORT, ctx.renderWin);

  // macOS: hide the dock icon so the pet does not appear in the Dock or Cmd+Tab switcher.
  // This is the macOS equivalent of skipTaskbar on Windows.
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  // Linux: Wayland compositors (GNOME 44+, KDE Plasma 6, etc.) may exhibit visual artifacts
  // with always-on-top transparent windows.  If issues are reported, consider:
  //   1. Falling back to X11 via `--ozone-platform=x11`
  //   2. Disabling transparency and using a shaped window instead
  // The getPlatformWindowOptions() helper already applies a backgroundColor fallback for Wayland.

  // ── Global Shortcuts ─────────────────────────────────────
  globalShortcut.register('Ctrl+Shift+Y', () => {
    ctx.renderWin?.webContents.send('shortcut', 'allow');
  });
  globalShortcut.register('Ctrl+Shift+N', () => {
    ctx.renderWin?.webContents.send('shortcut', 'deny');
  });

  // ── Auto-hooks registration (best-effort) ────────────────
  {
    const hooksScript = join(dir, '..', '..', '..', 'hooks', 'install-hooks.js');
    execFile(
      process.execPath,
      [hooksScript],
      { timeout: 10000, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
      (err, stdout, stderr) => {
        if (err) {
          log.warn('Auto-hooks registration failed (non-blocking):', stderr?.toString() || err.message);
        } else {
          log.info('Auto-hooks registration succeeded:', stdout?.toString()?.trim());
        }
      },
    );
  }

  // ── Auto Updater ─────────────────────────────────────────
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Download now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} downloaded. Restart to install?`,
      buttons: ['Restart', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.info('Update check skipped:', err?.message || 'dev mode');
  });
});

app.on('window-all-closed', () => {});

app.on('before-quit', async () => {
  if (ctx.topmostTimer) clearInterval(ctx.topmostTimer);
  globalShortcut.unregisterAll();
  saveWindowPosition();
  httpServer.stop();
  try { await ctx.adapterRegistry?.stopAll(); } catch { /* ignore */ }
  ctx.adapterRegistry = null;
  ctx.adapterBus?.clear?.();
  ctx.adapterBus = null;
  ctx.renderWin?.destroy();
  ctx.settingsWindow?.destroy();
  ctx.dashboardWindow?.destroy();
  ctx.tray?.destroy();
});
