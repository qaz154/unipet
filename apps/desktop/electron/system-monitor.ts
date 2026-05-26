/**
 * System Monitor — collects CPU, memory, battery, and focus metrics
 * and streams them to the renderer via IPC.
 *
 * Uses only Node.js built-in APIs (os, child_process) and Electron's
 * powerMonitor. No native npm dependencies required.
 *
 * Emits 'system-metrics' to the render window every POLL_INTERVAL_MS.
 */

import { app, powerMonitor, BrowserWindow } from 'electron';
import { cpus, freemem, totalmem } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 5_000;
const CPU_HIGH_THRESHOLD = 80;
const MEMORY_LOW_THRESHOLD = 20;
const BATTERY_LOW_THRESHOLD = 20;

// ─── Types ─────────────────────────────────────────────────

export interface SystemMetrics {
  cpu: number;            // 0-100 percentage
  memory: number;         // 0-100 percentage used
  memoryFree: number;     // bytes free
  memoryTotal: number;    // bytes total
  battery: number | null; // 0-100 or null (desktop/no battery)
  onBattery: boolean;
  focusedWindow: string | null; // title of last focused window
  focusedApp: string | null;    // process name of last focused app
  timestamp: number;
}

// ─── CPU ───────────────────────────────────────────────────

let prevCpuTimes: { idle: number; total: number } | null = null;

function readCpuUsage(): number {
  const cores = cpus();
  let idle = 0;
  let total = 0;
  for (const core of cores) {
    const times = core.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  if (prevCpuTimes) {
    const idleDelta = idle - prevCpuTimes.idle;
    const totalDelta = total - prevCpuTimes.total;
    prevCpuTimes = { idle, total };
    return totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
  }

  prevCpuTimes = { idle, total };
  return 0;
}

// ─── Memory ────────────────────────────────────────────────

function readMemoryUsage(): { usedPercent: number; free: number; total: number } {
  const total = totalmem();
  const free = freemem();
  return { usedPercent: Math.round(((total - free) / total) * 100), free, total };
}

// ─── Battery ───────────────────────────────────────────────

async function readBatteryLevel(): Promise<number | null> {
  try {
    if (process.platform === 'linux') {
      const { stdout } = await execFileAsync('cat', ['/sys/class/power_supply/BAT0/capacity'], { timeout: 2000 });
      return parseInt(stdout.trim(), 10) || null;
    }
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        '(Get-WmiObject Win32_Battery).EstimatedChargeRemaining',
      ], { timeout: 3000 });
      const val = parseInt(stdout.trim(), 10);
      return Number.isFinite(val) ? val : null;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('pmset', ['-g', 'batt'], { timeout: 2000 });
      const match = stdout.match(/(\d+)%/);
      return match ? parseInt(match[1], 10) : null;
    }
  } catch {
    return null;
  }
  return null;
}

// ─── Focus detection ───────────────────────────────────────

function getFocusedWindowTitle(): string | null {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (win.isFocused() && !win.isDestroyed()) {
      return win.getTitle() || null;
    }
  }
  return null;
}

function classifyFocusedApp(title: string | null): string | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  if (lower.includes('visual studio code') || lower.includes('vscode') || lower.includes('.vscode')) return 'vscode';
  if (lower.includes('cursor')) return 'cursor';
  if (lower.includes('terminal') || lower.includes('powershell') || lower.includes('cmd') || lower.includes('iterm')) return 'terminal';
  if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('edge') || lower.includes('safari') || lower.includes('brave')) return 'browser';
  if (lower.includes('slack') || lower.includes('discord') || lower.includes('teams')) return 'chat';
  if (lower.includes('figma') || lower.includes('sketch') || lower.includes('photoshop')) return 'design';
  if (lower.includes('spotify') || lower.includes('music')) return 'music';
  return 'other';
}

// ─── Main loop ─────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startSystemMonitor(win: BrowserWindow): void {
  // Initial CPU baseline
  readCpuUsage();

  pollTimer = setInterval(async () => {
    if (win.isDestroyed()) {
      stopSystemMonitor();
      return;
    }

    const cpu = readCpuUsage();
    const mem = readMemoryUsage();
    const battery = await readBatteryLevel();
    const onBattery = powerMonitor.isOnBatteryPower();
    const focusedTitle = getFocusedWindowTitle();
    const focusedApp = classifyFocusedApp(focusedTitle);

    const metrics: SystemMetrics = {
      cpu,
      memory: mem.usedPercent,
      memoryFree: mem.free,
      memoryTotal: mem.total,
      battery,
      onBattery,
      focusedWindow: focusedTitle,
      focusedApp,
      timestamp: Date.now(),
    };

    win.webContents.send('system-metrics', metrics);
  }, POLL_INTERVAL_MS);

  // Also send metrics on window focus changes
  app.on('browser-window-focus', (_event, focusedWin) => {
    if (focusedWin === win || focusedWin.isDestroyed()) return;
    const title = focusedWin.getTitle() || null;
    const app_ = classifyFocusedApp(title);
    win.webContents.send('system-metrics', {
      cpu: readCpuUsage(),
      memory: readMemoryUsage().usedPercent,
      memoryFree: freemem(),
      memoryTotal: totalmem(),
      battery: null,
      onBattery: powerMonitor.isOnBatteryPower(),
      focusedWindow: title,
      focusedApp: app_,
      timestamp: Date.now(),
    } satisfies SystemMetrics);
  });
}

export function stopSystemMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Export thresholds for renderer-side use
export const THRESHOLDS = {
  CPU_HIGH: CPU_HIGH_THRESHOLD,
  MEMORY_LOW: MEMORY_LOW_THRESHOLD,
  BATTERY_LOW: BATTERY_LOW_THRESHOLD,
} as const;
