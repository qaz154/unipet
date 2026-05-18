/**
 * System tray — icon, tooltip, context menu, and resize helper.
 *
 * All functions receive the shared AppContext so they can read/write
 * mutable state.  External operations (opening windows, mini-mode
 * transitions, update checks) are injected via TrayDeps.
 */

import { app, Tray, Menu, nativeImage } from 'electron';
import { join } from 'path';
import type { Logger } from '@unipet/core';
import type { AppContext } from './app-context.js';
import { SIZE_PRESETS } from './app-context.js';
import { getSetting, setSetting } from './settings-persistence.js';

// ─── Dependency injection ────────────────────────────────

export interface TrayDeps {
  exitMiniMode: () => void;
  checkMiniModeSnap: (x: number, y: number, w: number, h: number) => boolean;
  openSettings: () => void;
  openDashboard: () => void;
  checkForUpdates: () => void;
  log: Logger;
  dir: string;
}

// ─── Tray i18n ───────────────────────────────────────────

const TRAY_I18N: Record<string, Record<string, string>> = {
  en: {
    idle: 'Idle', thinking: 'Thinking...', working: 'Working...',
    editing: 'Editing...', error: 'Error!', attention: 'Done!',
    sleeping: 'Sleeping', happy: 'Happy!', love: 'Love~',
    show: 'Show Pet', hide: 'Hide Pet',
    sleep: '\u{1F4A4} Sleep', wake: '\u{2600}\u{FE0F} Wake Up',
    miniMode: '\u{1F4CC} Mini Mode', exitMini: '\u{1F4CC} Full Mode',
    hideBubbles: 'Hide Bubbles', soundFx: '\u{1F50A} Sound Effects',
    size: 'Size', sizeS: 'Small', sizeM: 'Medium', sizeL: 'Large',
    settings: '\u{2699} Settings', checkUpdate: 'Check for Updates', quit: '\u{2715} Quit',
    dnd: '\u{1F319} Do Not Disturb', dndOff: '\u{1F514} Notifications On',
    openDashboard: '\u{1F4CA} Sessions Dashboard',
  },
  zh: {
    idle: '空闲', thinking: '思考中...', working: '工作中...',
    editing: '编辑中...', error: '出错了！', attention: '完成了！',
    sleeping: '睡眠中', happy: '开心！', love: '喜欢~',
    show: '显示宠物', hide: '隐藏宠物',
    sleep: '\u{1F4A4} 睡觉', wake: '\u{2600}\u{FE0F} 唤醒',
    miniMode: '\u{1F4CC} 迷你模式', exitMini: '\u{1F4CC} 完整模式',
    hideBubbles: '隐藏气泡', soundFx: '\u{1F50A} 音效',
    size: '大小', sizeS: '小', sizeM: '中', sizeL: '大',
    settings: '\u{2699} 设置', checkUpdate: '检查更新', quit: '\u{2715} 退出',
    dnd: '\u{1F319} 勿扰模式', dndOff: '\u{1F514} 恢复通知',
    openDashboard: '\u{1F4CA} 会话面板',
  },
  ja: {
    idle: '待機中', thinking: '思考中...', working: '作業中...',
    editing: '編集中...', error: 'エラー！', attention: '完了！', sleeping: '睡眠中',
    happy: '嬉しい！', love: '好き〜',
    show: 'ペットを表示', hide: 'ペットを隠す',
    sleep: '\u{1F4A4} スリープ', wake: '\u{2600}\u{FE0F} 起きる',
    miniMode: '\u{1F4CC} ミニモード', exitMini: '\u{1F4CC} フルモード',
    hideBubbles: 'バブルを非表示', soundFx: '\u{1F50A} サウンド', size: 'サイズ',
    sizeS: '小', sizeM: '中', sizeL: '大',
    settings: '\u{2699} 設定', checkUpdate: '更新確認', quit: '\u{2715} 終了',
    dnd: '\u{1F319} 取り込み中', dndOff: '\u{1F514} 通知オン',
    openDashboard: '\u{1F4CA} セッション',
  },
  ko: {
    idle: '대기', thinking: '생각 중...', working: '작업 중...',
    editing: '편집 중...', error: '오류!', attention: '완료!', sleeping: '수면 중',
    happy: '행복!', love: '좋아~',
    show: '펫 표시', hide: '펫 숨기기',
    sleep: '\u{1F4A4} 수면', wake: '\u{2600}\u{FE0F} 깨우기',
    miniMode: '\u{1F4CC} 미니 모드', exitMini: '\u{1F4CC} 풀 모드',
    hideBubbles: '버블 숨기기', soundFx: '\u{1F50A} 사운드', size: '크기',
    sizeS: '작음', sizeM: '보통', sizeL: '큼',
    settings: '\u{2699} 설정', checkUpdate: '업데이트 확인', quit: '\u{2715} 종료',
    dnd: '\u{1F319} 방해 금지', dndOff: '\u{1F514} 알림 켜기',
    openDashboard: '\u{1F4CA} 세션 대시보드',
  },
};

export function tr(settings: Record<string, unknown>, key: string): string {
  const locale = (settings['locale'] as string) || 'en';
  return TRAY_I18N[locale]?.[key] || TRAY_I18N['en']?.[key] || key;
}

// ─── Icon ────────────────────────────────────────────────

export function createDefaultIcon(): Electron.NativeImage {
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

// ─── Tray lifecycle ──────────────────────────────────────

export function createTray(ctx: AppContext, deps: TrayDeps): void {
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(join(deps.dir, '../public/tray-icon.png'));
    if (icon.isEmpty()) icon = createDefaultIcon();
  } catch {
    icon = createDefaultIcon();
  }

  ctx.tray = new Tray(icon);
  updateTrayTooltip(ctx);
  updateTrayMenu(ctx, deps);

  ctx.tray.on('double-click', () => {
    if (ctx.isMiniMode) deps.exitMiniMode();
    ctx.renderWin?.show();
  });
}

export function updateTrayTooltip(ctx: AppContext): void {
  ctx.tray?.setToolTip(`UniPet — ${tr(ctx.settings, ctx.currentState)}`);
}

export function updateTrayMenu(ctx: AppContext, deps: TrayDeps): void {
  if (!ctx.tray) return;

  const stateLabel = tr(ctx.settings, ctx.currentState);
  const currentSize = getSetting<string>(ctx.settings, 'petSize', 'M');
  const soundOn = getSetting<boolean>(ctx.settings, 'soundEnabled', false);
  const bubblesHidden = getSetting<boolean>(ctx.settings, 'hideBubbles', false);

  const sizeSubmenu: Electron.MenuItemConstructorOptions[] = [
    { label: tr(ctx.settings, 'sizeS'), type: 'radio', checked: currentSize === 'S', click: () => resizePet(ctx, deps, 'S') },
    { label: tr(ctx.settings, 'sizeM'), type: 'radio', checked: currentSize === 'M', click: () => resizePet(ctx, deps, 'M') },
    { label: tr(ctx.settings, 'sizeL'), type: 'radio', checked: currentSize === 'L', click: () => resizePet(ctx, deps, 'L') },
  ];

  const contextMenu = Menu.buildFromTemplate([
    { label: `\u{1F43E} ${stateLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: ctx.isPaused ? tr(ctx.settings, 'wake') : tr(ctx.settings, 'sleep'),
      click: () => {
        ctx.isPaused = !ctx.isPaused;
        ctx.renderWin?.webContents.send('pet:pause-toggled', ctx.isPaused);
        updateTrayMenu(ctx, deps);
      },
    },
    {
      label: ctx.isMiniMode ? tr(ctx.settings, 'exitMini') : tr(ctx.settings, 'miniMode'),
      click: () => {
        if (ctx.isMiniMode) deps.exitMiniMode();
        else {
          const [x, y] = ctx.renderWin?.getPosition() || [0, 0];
          const [w, h] = ctx.renderWin?.getSize() || [280, 280];
          deps.checkMiniModeSnap(x, y, w, h);
        }
        updateTrayMenu(ctx, deps);
      },
    },
    {
      label: ctx.isDnd ? tr(ctx.settings, 'dndOff') : tr(ctx.settings, 'dnd'),
      click: () => {
        ctx.isDnd = !ctx.isDnd;
        ctx.renderWin?.webContents.send('pet:dnd-changed', ctx.isDnd);
        if (ctx.isDnd) {
          setSetting(ctx.settings, 'soundEnabled', false);
          ctx.renderWin?.webContents.send('settings:changed', 'soundEnabled', false);
        }
        updateTrayMenu(ctx, deps);
      },
    },
    { type: 'separator' },
    {
      label: `${tr(ctx.settings, 'hideBubbles')} ${bubblesHidden ? '✓' : ''}`,
      type: 'checkbox',
      checked: bubblesHidden,
      click: () => {
        setSetting(ctx.settings, 'hideBubbles', !bubblesHidden);
        ctx.renderWin?.webContents.send('settings:changed', 'hideBubbles', !bubblesHidden);
        updateTrayMenu(ctx, deps);
      },
    },
    {
      label: `${tr(ctx.settings, 'soundFx')} ${soundOn ? '✓' : ''}`,
      type: 'checkbox',
      checked: soundOn,
      click: () => {
        setSetting(ctx.settings, 'soundEnabled', !soundOn);
        ctx.renderWin?.webContents.send('settings:changed', 'soundEnabled', !soundOn);
        updateTrayMenu(ctx, deps);
      },
    },
    { type: 'separator' },
    { label: tr(ctx.settings, 'size'), submenu: sizeSubmenu },
    { type: 'separator' },
    { label: tr(ctx.settings, 'checkUpdate'), click: () => deps.checkForUpdates() },
    { label: tr(ctx.settings, 'settings'), click: () => deps.openSettings() },
    { label: tr(ctx.settings, 'openDashboard'), click: () => deps.openDashboard() },
    { type: 'separator' },
    { label: tr(ctx.settings, 'quit'), click: () => app.quit() },
  ]);
  ctx.tray.setContextMenu(contextMenu);
}

export function resizePet(ctx: AppContext, deps: TrayDeps, size: string): void {
  setSetting(ctx.settings, 'petSize', size);
  const s = SIZE_PRESETS[size] || SIZE_PRESETS.M;
  ctx.renderWin?.setSize(s.width, s.height);
  ctx.renderWin?.webContents.send('pet:size-changed', s);
  updateTrayMenu(ctx, deps);
}
