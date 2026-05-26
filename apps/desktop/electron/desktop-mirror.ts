/**
 * Desktop Mirror — system monitoring as pet emotional responses.
 *
 * Maps system metrics (CPU, memory, battery, focused app) to pet states
 * and visual behaviors. The pet becomes an emotional mirror of your
 * development environment.
 *
 * Runs in the Electron main process and sends IPC events to the renderer.
 *
 * Design:
 * - High CPU (>80%) → pet pants, sweats (working + arousal↑)
 * - Memory critical (>90%) → pet moves slowly, looks heavy
 * - Battery low (<20%) → pet yawns, finds charger
 * - IDE focused → pet coding; browser → reading; terminal → testing
 * - No input for 5min → pet sleeps
 */

import { powerMonitor } from 'electron';
import type { BrowserWindow } from 'electron';
import type { PetState } from '@unipet/core';

export interface SystemMetrics {
  cpuUsage: number;       // 0-1
  memoryUsage: number;    // 0-1
  batteryLevel: number;   // 0-1 (1 = full)
  isCharging: boolean;
  focusedApp: string;     // process name or empty
  idleSeconds: number;
}

export interface MirrorConfig {
  /** How often to sample system metrics (ms, default: 5000) */
  sampleIntervalMs: number;
  /** CPU threshold for "heavy load" state (default: 0.8) */
  cpuHighThreshold: number;
  /** Memory threshold for "heavy load" state (default: 0.9) */
  memoryHighThreshold: number;
  /** Battery level for "low battery" (default: 0.2) */
  batteryLowThreshold: number;
  /** Idle seconds before pet sleeps (default: 300) */
  idleSleepThreshold: number;
  /** Whether Desktop Mirror is enabled */
  enabled: boolean;
}

const DEFAULT_CONFIG: MirrorConfig = {
  sampleIntervalMs: 5000,
  cpuHighThreshold: 0.8,
  memoryHighThreshold: 0.9,
  batteryLowThreshold: 0.2,
  idleSleepThreshold: 300,
  enabled: false,
};

// App categories → pet states
const APP_STATE_MAP: Record<string, PetState> = {
  'code': 'working',
  'code-insiders': 'working',
  'cursor': 'working',
  'idea64': 'working',
  'webstorm64': 'working',
  'devenv': 'working',
  'chrome': 'thinking',
  'firefox': 'thinking',
  'safari': 'thinking',
  'edge': 'thinking',
  'brave-browser': 'thinking',
  'terminal': 'testing',
  'iterm2': 'testing',
  'wt': 'testing',
  'powershell': 'testing',
  'slack': 'idle',
  'discord': 'idle',
  'spotify': 'idle',
};

export type MirrorListener = (metrics: SystemMetrics, suggestedState: PetState) => void;

export class DesktopMirror {
  private config: MirrorConfig;
  private renderer: BrowserWindow | null = null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: MirrorListener[] = [];

  constructor(config: Partial<MirrorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start monitoring and sending updates to the renderer */
  start(renderer: BrowserWindow): void {
    if (!this.config.enabled) return;
    this.renderer = renderer;

    this.sampleTimer = setInterval(() => {
      this.sample();
    }, this.config.sampleIntervalMs);

    // Also listen for power state changes
    powerMonitor.on('on-battery', () => this.sample());
    powerMonitor.on('on-ac', () => this.sample());
  }

  /** Stop monitoring */
  stop(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    this.renderer = null;
  }

  /** Get the current metrics without starting monitoring */
  getMetrics(): SystemMetrics {
    return this.collectMetrics();
  }

  /** Register a listener for metric updates */
  onMetrics(listener: MirrorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Update config */
  updateConfig(config: Partial<MirrorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Clean up */
  destroy(): void {
    this.stop();
    this.listeners = [];
  }

  // ─── Private ────────────────────────────────────────────

  private sample(): void {
    const metrics = this.collectMetrics();

    const state = this.metricsToState(metrics);

    // Send to renderer via IPC
    this.renderer?.webContents.send('system-metrics', {
      ...metrics,
      suggestedState: state,
    });

    // Notify listeners
    for (const listener of this.listeners) {
      listener(metrics, state);
    }
  }

  private collectMetrics(): SystemMetrics {
    const idleSeconds = powerMonitor.getSystemIdleTime();

    // CPU and memory are approximated from system info
    // In a real implementation, use os.cpus() or a system info library
    // For now, use powerMonitor idle time as a proxy
    const cpuUsage = idleSeconds < 2 ? 0.8 : idleSeconds < 10 ? 0.4 : 0.1;
    const memoryUsage = 0.5; // Placeholder — real impl would use os.freemem()
    const batteryLevel = 1.0; // Placeholder — real impl would use powerMonitor.getBatteryLevel()
    const isCharging = true; // Placeholder

    return {
      cpuUsage,
      memoryUsage,
      batteryLevel,
      isCharging,
      focusedApp: '', // Would need platform-specific APIs
      idleSeconds,
    };
  }

  private metricsToState(metrics: SystemMetrics): PetState {
    // Priority 1: Critical system state
    if (metrics.batteryLevel < this.config.batteryLowThreshold && !metrics.isCharging) {
      return 'idle'; // Pet gets sleepy
    }

    // Priority 2: Heavy load
    if (metrics.cpuUsage > this.config.cpuHighThreshold || metrics.memoryUsage > this.config.memoryHighThreshold) {
      return 'working'; // Pet is struggling
    }

    // Priority 3: Idle → sleep
    if (metrics.idleSeconds > this.config.idleSleepThreshold) {
      return 'idle'; // Will eventually trigger sleep sequence
    }

    // Priority 4: App-based state
    for (const [app, state] of Object.entries(APP_STATE_MAP)) {
      if (metrics.focusedApp.toLowerCase().includes(app)) {
        return state;
      }
    }

    return 'idle';
  }
}
