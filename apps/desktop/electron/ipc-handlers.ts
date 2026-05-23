/**
 * IPC handler registration — collects every ipcMain.handle / ipcMain.on
 * call into a single registerIpcHandlers() entry-point.
 */

import { ipcMain, BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { execFile } from 'child_process';
import { listAgentIds, AdapterRegistry, MCPAdapter, HTTPAdapter, GitAdapter, HookBasedAdapter, BUILTIN_AGENTS } from '@unipet/adapters';
import { ClaudeCodeAdapter } from '@unipet/adapters';
import { EventBus, DEFAULT_HTTP_PORT } from '@unipet/core';
import type { PetEvent, Logger } from '@unipet/core';
import type { AppContext } from './app-context.js';
import { getSetting, setSetting } from './settings-persistence.js';

const ALLOWED_AGENT_IDS = new Set<string>(listAgentIds());

// ─── Dependency injection ────────────────────────────────

export interface IpcDeps {
  openSettings: () => void;
  openDashboard: () => void;
  reassertTopmost: () => void;
  saveWindowPosition: () => void;
  checkMiniModeSnap: (x: number, y: number, w: number, h: number) => boolean;
  exitMiniMode: () => void;
  startTopmostWatchdog: () => void;
  updateTrayTooltip: () => void;
  updateTrayMenu: () => void;
  log: Logger;
  dir: string;
}

// ─── Registration ────────────────────────────────────────

export function registerIpcHandlers(ctx: AppContext, deps: IpcDeps): void {
  // ── Window controls ──────────────────────────────────────

  ipcMain.handle('pet:show', () => {
    ctx.renderWin?.show();
  });
  ipcMain.handle('pet:hide', () => {
    ctx.renderWin?.hide();
  });
  ipcMain.handle('pet:move', (_e, x: number, y: number) => {
    if (typeof x !== 'number' || typeof y !== 'number' ||
        !Number.isFinite(x) || !Number.isFinite(y)) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const clampedX = Math.max(wa.x, Math.min(x, wa.x + wa.width  - 1));
    const clampedY = Math.max(wa.y, Math.min(y, wa.y + wa.height - 1));
    ctx.renderWin?.setPosition(clampedX, clampedY);
  });
  ipcMain.handle('pet:get-position', () => ctx.renderWin?.getPosition() ?? [0, 0]);
  ipcMain.handle('pet:set-always-on-top', (_e, enabled: boolean) => {
    ctx.renderWin?.setAlwaysOnTop(enabled, 'pop-up-menu');
    if (enabled) deps.startTopmostWatchdog();
  });
  ipcMain.handle('pet:set-click-through', (_e, enabled: boolean) => {
    ctx.renderWin?.setIgnoreMouseEvents(enabled, { forward: true });
  });
  ipcMain.handle('pet:set-content-protection', (_e, enabled: boolean) => {
    ctx.renderWin?.setContentProtection(enabled);
  });
  ipcMain.handle('pet:start-drag', () => {
    // Drag is driven by direct pointer events on the render window.
  });

  // ── State ────────────────────────────────────────────────

  ipcMain.handle('pet:set-state', (_e, state: string) => {
    ctx.currentState = state;
    deps.updateTrayTooltip();
    deps.updateTrayMenu();
  });

  // ── Click / context menu from hit window ─────────────────

  ipcMain.on('pet:clicked', (_e, x: number, y: number) => {
    ctx.renderWin?.webContents.send('pet:clicked', x, y);
  });

  ipcMain.on('pet:context-menu', () => {
    deps.updateTrayMenu();
    ctx.tray?.popUpContextMenu();
  });

  // ── Mouse-move forwarding (hit window -> render window) ──

  ipcMain.on('mouse-move', (_e, x: number, y: number) => {
    ctx.renderWin?.webContents.send('mouse-move', x, y);
  });

  // ── Drag IPC (from hit window) ───────────────────────────

  ipcMain.on('drag-move', (_e, mouseX: number, mouseY: number) => {
    if (!ctx.renderWin || !ctx.dragSnapshot) return;
    if (typeof mouseX !== 'number' || typeof mouseY !== 'number') return;
    const x = ctx.dragSnapshot.winX + (mouseX - ctx.dragSnapshot.cursorX);
    const y = ctx.dragSnapshot.winY + (mouseY - ctx.dragSnapshot.cursorY);
    const wa = screen.getPrimaryDisplay().workArea;
    const clampedX = Math.max(wa.x, Math.min(Math.round(x), wa.x + wa.width  - 1));
    const clampedY = Math.max(wa.y, Math.min(Math.round(y), wa.y + wa.height - 1));
    ctx.renderWin.setPosition(clampedX, clampedY);
  });

  ipcMain.on('drag-lock', (_e, cursorX: number, cursorY: number) => {
    if (!ctx.renderWin) return;
    if (!getSetting<boolean>(ctx.settings, 'dragEnabled', true)) return;
    const [wx, wy] = ctx.renderWin.getPosition();
    const [ww, wh] = ctx.renderWin.getSize();
    ctx.dragSnapshot = { winX: wx, winY: wy, winW: ww, winH: wh, cursorX, cursorY };
    ctx.renderWin?.webContents.send('drag:started');
  });

  ipcMain.on('drag-end', () => {
    if (!ctx.renderWin || !ctx.dragSnapshot) return;
    const [x, y] = ctx.renderWin.getPosition();
    const [w, h] = ctx.renderWin.getSize();
    setSetting(ctx.settings, 'windowPosition', { x, y });
    ctx.renderWin?.webContents.send('drag:ended');

    // Edge-snap check honors the user's edgeSnapping setting
    if (getSetting<boolean>(ctx.settings, 'edgeSnapping', true)) {
      deps.checkMiniModeSnap(x, y, w, h);
    }

    deps.reassertTopmost();
    ctx.dragSnapshot = null;
  });

  // ── Throw (velocity-based pet flick) ─────────────────────

  ipcMain.on('throw-pet', (_e, vx: number, vy: number) => {
    if (!ctx.renderWin) return;
    ctx.renderWin.webContents.send('throw-pet', vx, vy);
  });

  // ── Permission ───────────────────────────────────────────

  ipcMain.handle('pet:permission-response', (_e, permissionId: string, action: string) => {
    if (ctx.isDnd) {
      deps.log.info('Permission ' + permissionId + ' suppressed (DND mode)');
      ctx.httpServer.resolvePermission(permissionId, 'deny');
      return { success: true };
    }
    deps.log.info(`Permission response: ${permissionId} → ${action}`);
    ctx.renderWin?.webContents.send('permission:resolved', permissionId, action);
    ctx.httpServer.resolvePermission(permissionId, action);
    return { success: true };
  });

  ipcMain.handle('pet:is-dnd', () => ctx.isDnd);

  // ── Settings ─────────────────────────────────────────────

  ipcMain.handle('settings:get', (_e, key: string) => ctx.settings[key]);
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    if (typeof value === 'function' || typeof value === 'symbol') return;
    setSetting(ctx.settings, key, value);
    ctx.renderWin?.webContents.send('settings:changed', key, value);
    ctx.settingsWindow?.webContents.send('settings:changed', key, value);
    if (key === 'locale') {
      deps.updateTrayTooltip();
      deps.updateTrayMenu();
    }
  });
  ipcMain.handle('settings:get-all', () => ctx.settings);

  // ── Window controls (frameless titlebar) ─────────────────

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

  // ── App / Agent ──────────────────────────────────────────

  ipcMain.handle('app:open-settings', () => deps.openSettings());
  ipcMain.handle('app:is-paused', () => ctx.isPaused);

  function runAgentInstaller(agentId: unknown, action: 'install' | 'uninstall'): Promise<{ success: boolean; output?: string; error?: string }> | { success: false; error: string } {
    if (typeof agentId !== 'string' || !ALLOWED_AGENT_IDS.has(agentId)) {
      return { success: false, error: `Unknown agent "${String(agentId)}". Available: ${[...ALLOWED_AGENT_IDS].join(', ')}` };
    }

    const scriptPath = join(deps.dir, '..', '..', 'hooks', 'install-hooks.js');
    const args = action === 'install'
      ? [scriptPath, '--agent', agentId]
      : [scriptPath, '--agent', agentId, '--uninstall'];

    return new Promise<{ success: boolean; output?: string; error?: string }>((resolve) => {
      execFile(
        process.execPath,
        args,
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
  }

  ipcMain.handle('agent:install', async (_e, agentId: unknown) => runAgentInstaller(agentId, 'install'));
  ipcMain.handle('agent:uninstall', async (_e, agentId: unknown) => runAgentInstaller(agentId, 'uninstall'));

  // ── Adapter IPC ──────────────────────────────────────────

  ipcMain.handle('adapter:start-all', async (_e, enabledIds: string[]) => {
    const started: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
      ctx.adapterBus = new EventBus();
      ctx.adapterRegistry = new AdapterRegistry();

      for (const def of BUILTIN_AGENTS) {
        if (def.id === 'claude-code') {
          ctx.adapterRegistry.register(new ClaudeCodeAdapter());
        } else {
          ctx.adapterRegistry.register(new HookBasedAdapter(def));
        }
      }
      ctx.adapterRegistry.register(new MCPAdapter());
      ctx.adapterRegistry.register(new HTTPAdapter());
      ctx.adapterRegistry.register(new GitAdapter());

      ctx.adapterBus.on((event: PetEvent) => {
        if (ctx.isDnd && event.type !== 'permission') return;
        ctx.renderWin?.webContents.send('pet:event', event);
      });

      const result = await ctx.adapterRegistry.startAll(ctx.adapterBus, (id: string) => ({
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
      await ctx.adapterRegistry?.stopAll();
    } catch { /* ignore */ }
    ctx.adapterRegistry = null;
    ctx.adapterBus?.clear?.();
    ctx.adapterBus = null;
  });
}
