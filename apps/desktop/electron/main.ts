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

import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, shell, globalShortcut, dialog } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { listAgentIds, AdapterRegistry, createBuiltinAdapters, MCPAdapter, HTTPAdapter, GitAdapter } from '@unipet/adapters';
import { EventBus, DEFAULT_HTTP_PORT, createLogger } from '@unipet/core';
import type { PetEvent, Logger } from '@unipet/core';
import { PetHttpServer } from './http-server.js';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// ESM-compatible __dirname replacement
const dir = fileURLToPath(new URL('.', import.meta.url));

// ─── File Logging ─────────────────────────────────────────
function getLogDir(): string {
  try {
    return app.getPath('logs');
  } catch {
    return join(homedir(), '.unipet', 'logs');
  }
}

let _logDir: string | null = null;
function logDir(): string {
  if (!_logDir) {
    _logDir = getLogDir();
    mkdirSync(_logDir, { recursive: true });
  }
  return _logDir;
}

function logToFile(level: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
  try {
    const file = join(logDir(), level === 'error' ? 'error.log' : 'out.log');
    appendFileSync(file, line);
  } catch {
    // Best effort — don't crash if log write fails
  }
}

const log: Logger = createLogger('debug', 'unipet');
const origDebug = log.debug.bind(log);
const origInfo = log.info.bind(log);
const origWarn = log.warn.bind(log);
const origError = log.error.bind(log);

function fmtArgs(args: unknown[]): string {
  return args.map(a => a instanceof Error ? a.stack || a.message : String(a)).join(' ');
}

log.debug = (msg, ...args) => { origDebug(msg, ...args); logToFile('debug', args.length ? `${msg} ${fmtArgs(args)}` : msg); };
log.info = (msg, ...args) => { origInfo(msg, ...args); logToFile('info', args.length ? `${msg} ${fmtArgs(args)}` : msg); };
log.warn = (msg, ...args) => { origWarn(msg, ...args); logToFile('warn', args.length ? `${msg} ${fmtArgs(args)}` : msg); };
log.error = (msg, ...args) => { origError(msg, ...args); logToFile('error', args.length ? `${msg} ${fmtArgs(args)}` : msg); };

const ALLOWED_AGENT_IDS = new Set<string>(listAgentIds());

// ─── Settings Persistence ──────────────────────────────

const CONFIG_DIR = join(homedir(), '.unipet');
const CONFIG_FILE = join(CONFIG_DIR, 'settings.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadSettings(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch { /* corrupt file, start fresh */ }
  return {};
}

function saveSettings(data: Record<string, unknown>): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

const settings = loadSettings();

function getSetting<T>(key: string, fallback: T): T {
  return (settings[key] as T) ?? fallback;
}

function setSetting(key: string, value: unknown): void {
  settings[key] = value;
  saveSettings(settings);
}

// ─── Window State ──────────────────────────────────────

let renderWin: BrowserWindow | undefined;  // Transparent pet display (handles both rendering and input)
let settingsWindow: BrowserWindow | undefined;
let dashboardWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let isPaused = false;
let isDnd = false;
let currentState = 'idle';
let isMiniMode = false;
let miniEdge: 'left' | 'right' | null = null;
let dragSnapshot: { winX: number; winY: number; winW: number; winH: number; cursorX: number; cursorY: number } | null = null;
const httpServer = new PetHttpServer();

// ─── Adapter Registry (main process) ──────────────────
let adapterRegistry: AdapterRegistry | null = null;
let adapterBus: EventBus | null = null;

// Window size presets — must be large enough to fit the scaled canvas.
// Canvas = PW×PH (24×32) at up to 8× scale. Default M (280×280) fits canvas
// at 0.75 scale: 192×256px, with 44px/12px padding inside the window.
const SIZE_PRESETS: Record<string, { width: number; height: number }> = {
  S: { width: 240, height: 320 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 480 },
};
const SNAP_TOLERANCE = 30;
const MINI_OFFSET_RATIO = 0.486;
const PEEK_OFFSET = 25;

function getSavedPosition(): { x: number; y: number } {
  const pos = getSetting<{ x: number; y: number } | null>('windowPosition', null);
  const size = getSetting<string>('petSize', 'M');
  const s = SIZE_PRESETS[size] || SIZE_PRESETS.M;
  // Fallback: bottom-right of primary display
  const { width, height, x: waX, y: waY } = screen.getPrimaryDisplay().workArea;
  const fallback = { x: waX + width - s.width - 40, y: waY + height - s.height - 40 };

  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    // Clamp: if saved position is completely outside the current work area, reset
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
  if (!renderWin) return;
  const [x, y] = renderWin.getPosition();
  setSetting('windowPosition', { x, y });
}

function getWindowSize(): { width: number; height: number } {
  const size = getSetting<string>('petSize', 'M');
  return SIZE_PRESETS[size] || SIZE_PRESETS.M;
}

function createRenderWindow(): BrowserWindow {
  const pos = getSavedPosition();
  const size = getWindowSize();

  renderWin = new BrowserWindow({
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
    webPreferences: {
      preload: join(dir, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  renderWin.setFocusable(false);
  renderWin.setAlwaysOnTop(true, 'pop-up-menu');
  renderWin.setContentProtection(getSetting<boolean>('screenPrivacy', true));

  if (process.env['VITE_DEV_SERVER_URL']) {
    renderWin.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    renderWin.loadFile(join(dir, '../dist/index.html'));
  }
  renderWin.showInactive();

  renderWin.on('move', () => {
    saveWindowPosition();
  });

  renderWin.webContents.on('did-finish-load', () => {
    renderWin?.webContents.send('settings:loaded', settings);
    renderWin?.webContents.send('pet:size-changed', size);
  });

  renderWin.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) {
      const tag = ['', '', 'WARN', 'ERROR'][level] || 'LOG';
      logToFile('error', `[RENDERER] ${tag}: ${message} (${source}:${line})`);
    }
  });

  // Crash recovery
  renderWin.on('render-process-gone' as any, (_e: any, details: any) => {
    log.error('Render process crashed:', details?.reason);
    setTimeout(() => {
      if (renderWin && !renderWin.isDestroyed()) {
        renderWin.reload();
        reassertTopmost();
      }
    }, 1000);
  });

  return renderWin;
}

// ─── Always-on-Top Watchdog ────────────────────────────

const TOPMOST_WATCHDOG_MS = 5000;
let topmostTimer: ReturnType<typeof setInterval> | null = null;

function startTopmostWatchdog(): void {
  if (topmostTimer) clearInterval(topmostTimer);
  topmostTimer = setInterval(() => {
    reassertTopmost();
  }, TOPMOST_WATCHDOG_MS);
}

function reassertTopmost(): void {
  if (renderWin && !renderWin.isDestroyed()) {
    renderWin.setAlwaysOnTop(true, 'pop-up-menu');
  }
}

// ─── Mini Mode ─────────────────────────────────────────

function checkMiniModeSnap(winX: number, winY: number, winW: number, winH: number): boolean {
  const workArea = screen.getPrimaryDisplay().workArea;
  const centerX = winX + winW / 2;

  if (centerX - workArea.x < SNAP_TOLERANCE) {
    miniEdge = 'left';
    enterMiniMode('left');
    return true;
  }
  if (workArea.x + workArea.width - centerX < SNAP_TOLERANCE) {
    miniEdge = 'right';
    enterMiniMode('right');
    return true;
  }
  return false;
}

function enterMiniMode(edge: 'left' | 'right'): void {
  if (isMiniMode) return;
  isMiniMode = true;

  const size = getWindowSize();
  const workArea = screen.getPrimaryDisplay().workArea;
  let targetX: number;
  if (edge === 'left') {
    targetX = workArea.x - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
  } else {
    targetX = workArea.x + workArea.width - Math.round(size.width * MINI_OFFSET_RATIO);
  }
  const targetY = workArea.y + Math.round((workArea.height - size.height) / 2);

  // Animate to edge
  animateWindow(targetX, targetY, 100);
  renderWin?.webContents.send('pet:mini-mode', true);
}

function exitMiniMode(): void {
  if (!isMiniMode) return;
  isMiniMode = false;
  miniEdge = null;

  const saved = getSetting<{ x: number; y: number }>('windowPosition', null as any);
  if (saved && renderWin && !renderWin.isDestroyed()) {
    animateWindow(saved.x, saved.y, 300);
  }

  renderWin?.webContents.send('pet:mini-mode', false);
}

function animateWindow(targetX: number, targetY: number, duration: number): void {
  if (!renderWin || renderWin.isDestroyed()) return;
  const [startX, startY] = renderWin.getPosition();
  const startTime = Date.now();

  const step = () => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t * (2 - t); // ease-out quadratic
    const x = Math.round(startX + (targetX - startX) * eased);
    const y = Math.round(startY + (targetY - startY) * eased);
    renderWin?.setPosition(x, y);
    if (t < 1) setTimeout(step, 16);
  };
  step();
}

function animateWindowParabola(targetX: number, targetY: number, duration: number): void {
  if (!renderWin) return;
  const [startX, startY] = renderWin.getPosition();
  const startTime = Date.now();
  const peakHeight = 40;

  const step = () => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = t * (2 - t);
    const x = Math.round(startX + (targetX - startX) * eased);
    const arc = -4 * peakHeight * t * (t - 1);
    const y = Math.round(startY + (targetY - startY) * eased - arc);
    renderWin?.setPosition(x, y);
    if (t < 1) setTimeout(step, 16);
  };
  step();
}

// ─── Tray ──────────────────────────────────────────────

function createTray(): void {
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(join(dir, '../public/tray-icon.png'));
    if (icon.isEmpty()) icon = createDefaultIcon();
  } catch {
    icon = createDefaultIcon();
  }

  tray = new Tray(icon);
  updateTrayTooltip();
  updateTrayMenu();

  tray.on('double-click', () => {
    if (isMiniMode) exitMiniMode();
    renderWin?.show();
  });
}

function createDefaultIcon(): Electron.NativeImage {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4 + 0] = 217;
    buffer[i * 4 + 1] = 119;
    buffer[i * 4 + 2] = 87;
    buffer[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

// ─── Tray i18n ────────────────────────────────────────

const TRAY_I18N: Record<string, Record<string, string>> = {
  en: {
    idle: 'Idle', thinking: 'Thinking...', working: 'Working...',
    editing: 'Editing...', error: 'Error!', attention: 'Done!',
    sleeping: 'Sleeping', happy: 'Happy!', love: 'Love~',
    show: 'Show Pet', hide: 'Hide Pet',
    sleep: '💤 Sleep', wake: '☀️ Wake Up',
    miniMode: '📌 Mini Mode', exitMini: '📌 Full Mode',
    hideBubbles: 'Hide Bubbles', soundFx: '🔊 Sound Effects',
    size: 'Size', sizeS: 'Small', sizeM: 'Medium', sizeL: 'Large',
    settings: '⚙ Settings', checkUpdate: 'Check for Updates', quit: '✕ Quit',
    dnd: '🌙 Do Not Disturb', dndOff: '🔔 Notifications On',
    openDashboard: '📊 Sessions Dashboard',
  },
  zh: {
    idle: '空闲', thinking: '思考中...', working: '工作中...',
    editing: '编辑中...', error: '出错了！', attention: '完成了！',
    sleeping: '睡眠中', happy: '开心！', love: '喜欢~',
    show: '显示宠物', hide: '隐藏宠物',
    sleep: '💤 睡觉', wake: '☀️ 唤醒',
    miniMode: '📌 迷你模式', exitMini: '📌 完整模式',
    hideBubbles: '隐藏气泡', soundFx: '🔊 音效',
    size: '大小', sizeS: '小', sizeM: '中', sizeL: '大',
    settings: '⚙ 设置', checkUpdate: '检查更新', quit: '✕ 退出',
    dnd: '🌙 勿扰模式', dndOff: '🔔 恢复通知',
    openDashboard: '📊 会话面板',
  },
  ja: {
    idle: '待機中', thinking: '思考中...', working: '作業中...',
    editing: '編集中...', error: 'エラー！', attention: '完了！', sleeping: '睡眠中',
    happy: '嬉しい！', love: '好き〜',
    show: 'ペットを表示', hide: 'ペットを隠す',
    sleep: '💤 スリープ', wake: '☀️ 起きる',
    miniMode: '📌 ミニモード', exitMini: '📌 フルモード',
    hideBubbles: 'バブルを非表示', soundFx: '🔊 サウンド', size: 'サイズ',
    sizeS: '小', sizeM: '中', sizeL: '大',
    settings: '⚙ 設定', checkUpdate: '更新確認', quit: '✕ 終了',
    dnd: '🌙 取り込み中', dndOff: '🔔 通知オン',
    openDashboard: '📊 セッション',
  },
  ko: {
    idle: '대기', thinking: '생각 중...', working: '작업 중...',
    editing: '편집 중...', error: '오류!', attention: '완료!', sleeping: '수면 중',
    happy: '행복!', love: '좋아~',
    show: '펫 표시', hide: '펫 숨기기',
    sleep: '💤 수면', wake: '☀️ 깨우기',
    miniMode: '📌 미니 모드', exitMini: '📌 풀 모드',
    hideBubbles: '버블 숨기기', soundFx: '🔊 사운드', size: '크기',
    sizeS: '작음', sizeM: '보통', sizeL: '큼',
    settings: '⚙ 설정', checkUpdate: '업데이트 확인', quit: '✕ 종료',
    dnd: '🌙 방해 금지', dndOff: '🔔 알림 켜기',
    openDashboard: '📊 세션 대시보드',
  },
};

function tr(key: string): string {
  const locale = (settings['locale'] as string) || 'en';
  return TRAY_I18N[locale]?.[key] || TRAY_I18N['en']?.[key] || key;
}

function updateTrayTooltip(): void {
  tray?.setToolTip(`UniPet — ${tr(currentState)}`);
}

function updateTrayMenu(): void {
  if (!tray) return;
  const stateLabel = tr(currentState);
  const currentSize = getSetting<string>('petSize', 'M');
  const soundOn = getSetting<boolean>('soundEnabled', false);
  const bubblesHidden = getSetting<boolean>('hideBubbles', false);

  const sizeSubmenu: Electron.MenuItemConstructorOptions[] = [
    { label: tr('sizeS'), type: 'radio', checked: currentSize === 'S', click: () => resizePet('S') },
    { label: tr('sizeM'), type: 'radio', checked: currentSize === 'M', click: () => resizePet('M') },
    { label: tr('sizeL'), type: 'radio', checked: currentSize === 'L', click: () => resizePet('L') },
  ];

  const contextMenu = Menu.buildFromTemplate([
    { label: `🐾 ${stateLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: isPaused ? tr('wake') : tr('sleep'),
      click: () => {
        isPaused = !isPaused;
        renderWin?.webContents.send('pet:pause-toggled', isPaused);
        updateTrayMenu();
      },
    },
    {
      label: isMiniMode ? tr('exitMini') : tr('miniMode'),
      click: () => {
        if (isMiniMode) exitMiniMode();
        else {
          const [x, y] = renderWin?.getPosition() || [0, 0];
          const [w, h] = renderWin?.getSize() || [280, 280];
          checkMiniModeSnap(x, y, w, h);
        }
        updateTrayMenu();
      },
    },
    {
      label: isDnd ? tr('dndOff') : tr('dnd'),
      click: () => {
        isDnd = !isDnd;
        renderWin?.webContents.send('pet:dnd-changed', isDnd);
        if (isDnd) {
          setSetting('soundEnabled', false);
          renderWin?.webContents.send('settings:changed', 'soundEnabled', false);
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: `${tr('hideBubbles')} ${bubblesHidden ? '✓' : ''}`,
      type: 'checkbox',
      checked: bubblesHidden,
      click: () => {
        setSetting('hideBubbles', !bubblesHidden);
        renderWin?.webContents.send('settings:changed', 'hideBubbles', !bubblesHidden);
        updateTrayMenu();
      },
    },
    {
      label: `${tr('soundFx')} ${soundOn ? '✓' : ''}`,
      type: 'checkbox',
      checked: soundOn,
      click: () => {
        setSetting('soundEnabled', !soundOn);
        renderWin?.webContents.send('settings:changed', 'soundEnabled', !soundOn);
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    { label: tr('size'), submenu: sizeSubmenu },
    { type: 'separator' },
    { label: tr('checkUpdate'), click: () => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {
        log.info('No updates available');
      });
    } },
    { label: tr('settings'), click: () => openSettings() },
    { label: tr('openDashboard'), click: () => openDashboard() },
    { type: 'separator' },
    { label: tr('quit'), click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

function resizePet(size: string): void {
  setSetting('petSize', size);
  const s = SIZE_PRESETS[size] || SIZE_PRESETS.M;
  renderWin?.setSize(s.width, s.height);
  renderWin?.webContents.send('pet:size-changed', s);
  updateTrayMenu();
}

// ─── Settings Window ───────────────────────────────────

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
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
      sandbox: false,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.center(); // Ensure it opens on screen

  if (process.env['VITE_DEV_SERVER_URL']) {
    settingsWindow.loadURL(`${process.env['VITE_DEV_SERVER_URL']}#/settings`);
  } else {
    settingsWindow.loadFile(join(dir, '../dist/index.html'), { hash: '/settings' });
  }

  // Fallback: show window if ready-to-show never fires within 3s
  const showTimeout = setTimeout(() => {
    log.info('Settings fallback show (ready-to-show timeout)');
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
    }
  }, 3000);

  settingsWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    log.info('Settings ready-to-show, showing window');
    settingsWindow?.show();
    settingsWindow?.webContents.send('settings:loaded', settings);
  });

  settingsWindow.webContents.on('did-finish-load', () => {
    log.info('Settings page finished loading');
  });

  settingsWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log.error('Settings failed to load:', code, desc);
  });

  settingsWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('Settings render process gone:', details.reason);
  });

  settingsWindow.on('closed', () => {
    log.info('Settings window closed');
    settingsWindow = undefined;
  });
}
// ─── Dashboard Window ──────────────────────────────────

function openDashboard(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
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
      sandbox: false,
    },
  });

  dashboardWindow.setMenuBarVisibility(false);
  dashboardWindow.center();

  if (process.env['VITE_DEV_SERVER_URL']) {
    dashboardWindow.loadURL(`${process.env["VITE_DEV_SERVER_URL"]}#/dashboard`);
  } else {
    dashboardWindow.loadFile(join(dir, '../dist/index.html'), { hash: '/dashboard' });
  }

  const showTimeout = setTimeout(() => {
    log.info('Dashboard fallback show (ready-to-show timeout)');
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.show();
    }
  }, 3000);

  dashboardWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    log.info('Dashboard ready-to-show, showing window');
    dashboardWindow?.show();
    dashboardWindow?.webContents.send('settings:loaded', settings);
  });

  dashboardWindow.webContents.on('did-finish-load', () => {
    log.info('Dashboard page finished loading');
  });

  dashboardWindow.on('closed', () => {
    log.info('Dashboard window closed');
    dashboardWindow = undefined;
  });
}

// ─── IPC Handlers ──────────────────────────────────────

// Window controls
ipcMain.handle('pet:show', () => {
  renderWin?.show();
});
ipcMain.handle('pet:hide', () => {
  renderWin?.hide();
});
ipcMain.handle('pet:move', (_e, x: number, y: number) => {
  if (typeof x !== 'number' || typeof y !== 'number' ||
      !Number.isFinite(x) || !Number.isFinite(y)) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const clampedX = Math.max(wa.x, Math.min(x, wa.x + wa.width  - 1));
  const clampedY = Math.max(wa.y, Math.min(y, wa.y + wa.height - 1));
  renderWin?.setPosition(clampedX, clampedY);
});
ipcMain.handle('pet:get-position', () => renderWin?.getPosition() ?? [0, 0]);
ipcMain.handle('pet:set-always-on-top', (_e, enabled: boolean) => {
  renderWin?.setAlwaysOnTop(enabled, 'pop-up-menu');
  if (enabled) startTopmostWatchdog();
});
ipcMain.handle('pet:set-click-through', (_e, enabled: boolean) => {
  renderWin?.setIgnoreMouseEvents(enabled, { forward: true });
});
ipcMain.handle('pet:set-content-protection', (_e, enabled: boolean) => {
  renderWin?.setContentProtection(enabled);
});
ipcMain.handle('pet:start-drag', () => {
  // Drag is driven by direct pointer events on the render window.
});

// State
ipcMain.handle('pet:set-state', (_e, state: string) => {
  currentState = state;
  updateTrayTooltip();
  updateTrayMenu();
});

// Click from hit window — forward to render window
ipcMain.on('pet:clicked', (_e, x: number, y: number) => {
  renderWin?.webContents.send('pet:clicked', x, y);
});

// Context menu from hit window
ipcMain.on('pet:context-menu', () => {
  updateTrayMenu();
  tray?.popUpContextMenu();
});

// Mouse-move forwarding (hit window → render window)
// The render window is permanently click-through, so it never receives DOM mousemove events.
// The hit window observes pointer movement and forwards screen coordinates here, which we
// fan out to the render window so eye tracking + activity detection still work.
ipcMain.on('mouse-move', (_e, x: number, y: number) => {
  renderWin?.webContents.send('mouse-move', x, y);
});

// Drag IPC (from hit window) — gated by the `dragEnabled` setting so the
// Behavior > "Drag to move" toggle actually has effect. When disabled we
// ignore drag-lock entirely; drag-move/drag-end become no-ops because no
// snapshot is set.
ipcMain.on('drag-move', (_e, mouseX: number, mouseY: number) => {
  if (!renderWin || !dragSnapshot) return;
  if (typeof mouseX !== 'number' || typeof mouseY !== 'number') return;
  const x = dragSnapshot.winX + (mouseX - dragSnapshot.cursorX);
  const y = dragSnapshot.winY + (mouseY - dragSnapshot.cursorY);
  const wa = screen.getPrimaryDisplay().workArea;
  const clampedX = Math.max(wa.x, Math.min(Math.round(x), wa.x + wa.width  - 1));
  const clampedY = Math.max(wa.y, Math.min(Math.round(y), wa.y + wa.height - 1));
  renderWin.setPosition(clampedX, clampedY);
});

ipcMain.on('drag-lock', (_e, cursorX: number, cursorY: number) => {
  if (!renderWin) return;
  if (!getSetting<boolean>('dragEnabled', true)) return;
  const [wx, wy] = renderWin.getPosition();
  const [ww, wh] = renderWin.getSize();
  dragSnapshot = { winX: wx, winY: wy, winW: ww, winH: wh, cursorX, cursorY };
  renderWin?.webContents.send('drag:started');
});

ipcMain.on('drag-end', () => {
  if (!renderWin || !dragSnapshot) return;
  const [x, y] = renderWin.getPosition();
  const [w, h] = renderWin.getSize();
  setSetting('windowPosition', { x, y });
  renderWin?.webContents.send('drag:ended');

  // Edge-snap check honors the user's edgeSnapping setting
  if (getSetting<boolean>('edgeSnapping', true)) {
    checkMiniModeSnap(x, y, w, h);
  }

  reassertTopmost();
  dragSnapshot = null;
});

// ── Throw (velocity-based pet flick) ─────────────────
ipcMain.on('throw-pet', (_e, vx: number, vy: number) => {
  if (!renderWin) return;
  // Forward to render process for physics simulation
  renderWin.webContents.send('throw-pet', vx, vy);
});

// Settings
// Permission response from renderer → forwarded back to hook
ipcMain.handle('pet:permission-response', (_e, permissionId: string, action: string) => {
  if (isDnd) {
    log.info('Permission ' + permissionId + ' suppressed (DND mode)');
    httpServer.resolvePermission(permissionId, 'deny');
    return { success: true };
  }
  log.info(`Permission response: ${permissionId} → ${action}`);
  renderWin?.webContents.send('permission:resolved', permissionId, action);
  httpServer.resolvePermission(permissionId, action);
  return { success: true };
});

ipcMain.handle('pet:is-dnd', () => isDnd);

ipcMain.handle('settings:get', (_e, key: string) => settings[key]);
ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
  // Reject functions/symbols — Electron IPC serialises them as empty objects,
  // which silently corrupts settings. Rejecting them early prevents the issue.
  if (typeof value === 'function' || typeof value === 'symbol') return;
  setSetting(key, value);
  renderWin?.webContents.send('settings:changed', key, value);
  settingsWindow?.webContents.send('settings:changed', key, value);
  if (key === 'locale') {
    updateTrayTooltip();
    updateTrayMenu();
  }
});
ipcMain.handle('settings:get-all', () => settings);

// Window controls (for settings window frameless titlebar)
ipcMain.handle('window:close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  win?.close();
});
ipcMain.handle('window:minimize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  win?.minimize();
});
ipcMain.handle('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

// Agent
ipcMain.handle('app:open-settings', () => openSettings());
ipcMain.handle('app:is-paused', () => isPaused);
ipcMain.handle('agent:install', async (_e, agentId: unknown) => {
  // Validate input: must be a string from our known agent set.
  // Without this, the spawned shell would happily expand any metacharacters
  // a renderer attacker could inject ("foo; rm -rf ~" etc.).
  if (typeof agentId !== 'string' || !ALLOWED_AGENT_IDS.has(agentId)) {
    return { success: false, error: `Unknown agent "${String(agentId)}". Available: ${[...ALLOWED_AGENT_IDS].join(', ')}` };
  }
  const scriptPath = join(dir, '..', '..', 'hooks', 'install-hooks.js');
  return await new Promise<{ success: boolean; output?: string; error?: string }>((resolve) => {
    // ELECTRON_RUN_AS_NODE makes process.execPath behave as plain Node,
    // so packaged builds (which have no system node) still work.
    execFile(
      process.execPath,
      [scriptPath, '--agent', agentId],
      {
        timeout: 10000,
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr?.toString() || err.message });
          return;
        }
        resolve({ success: true, output: stdout?.toString() });
      },
    );
  });
});

// ─── Adapter IPC ──────────────────────────────────────

ipcMain.handle('adapter:start-all', async (_e, enabledIds: string[]) => {
  const started: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  try {
    adapterBus = new EventBus();
    adapterRegistry = new AdapterRegistry();

    // Register all built-in hook-based agents
    for (const adapter of createBuiltinAdapters()) {
      adapterRegistry.register(adapter);
    }
    // Register protocol-based adapters
    adapterRegistry.register(new MCPAdapter());
    adapterRegistry.register(new HTTPAdapter());
    adapterRegistry.register(new GitAdapter());

    // Subscribe to adapter events and forward to renderer
    adapterBus.on((event: PetEvent) => {
      renderWin?.webContents.send('pet:event', event);
    });

    const result = await adapterRegistry.startAll(adapterBus, (id: string) => ({
      enabled: enabledIds.includes(id),
      httpPort: DEFAULT_HTTP_PORT,
      overrides: {},
    }));

    started.push(...result.started);
    failed.push(...result.failed);
  } catch (err) {
    failed.push({ id: 'registry', error: err instanceof Error ? err.message : String(err) });
  }

  return { started, failed };
});

ipcMain.handle('adapter:stop-all', async () => {
  try {
    await adapterRegistry?.stopAll();
  } catch { /* ignore */ }
  adapterRegistry = null;
  adapterBus?.clear?.();
  adapterBus = null;
});

// ─── Global Error Handling ─────────────────────────────

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

// ─── App Lifecycle ─────────────────────────────────────

app.whenReady().then(() => {
  createRenderWindow();
  startTopmostWatchdog();
  createTray();
  httpServer.start(DEFAULT_HTTP_PORT, renderWin);

  // ── Global Shortcuts (matching clawd-on-desk) ──────────
  globalShortcut.register('Ctrl+Shift+Y', () => {
    renderWin?.webContents.send('shortcut', 'allow');
  });
  globalShortcut.register('Ctrl+Shift+N', () => {
    renderWin?.webContents.send('shortcut', 'deny');
  });

  // ── Auto-hooks registration (best-effort) ───────────────────
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

  // ── Auto Updater ───────────────────────────────────────
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
  if (topmostTimer) clearInterval(topmostTimer);
  globalShortcut.unregisterAll();
  saveWindowPosition();
  httpServer.stop();
  try { await adapterRegistry?.stopAll(); } catch { /* ignore */ }
  adapterRegistry = null;
  adapterBus?.clear?.();
  adapterBus = null;
  renderWin?.destroy();
  settingsWindow?.destroy();
  dashboardWindow?.destroy();
  tray?.destroy();
});
