/**
 * useSystemMirror — composable that receives system metrics from the
 * main process and maps them to pet state, emotion vector, and visual
 * modifiers that the renderer uses to animate the pet.
 *
 * Data flow:
 *   main process (system-monitor.ts)
 *     → IPC 'system-metrics'
 *       → useSystemMirror()
 *         → pet state overrides
 *         → emotion vector tweaks
 *         → visual modifiers (speed, sweat, eye direction)
 */

import { ref, computed } from 'vue';
import type { PetState } from '@unipet/core';
import type { SystemMetrics } from '../types/unipet';

// ─── Thresholds ────────────────────────────────────────────

const CPU_HIGH = 80;
const CPU_MED = 50;
const MEM_LOW = 20;
const BATTERY_LOW = 15;

// ─── Focus → pose mapping ──────────────────────────────────

const FOCUS_POSE: Record<string, PetState> = {
  vscode: 'working',
  cursor: 'working',
  terminal: 'thinking',
  browser: 'thinking',
  chat: 'attention',
  design: 'working',
  music: 'idle',
};

// ─── Composable ────────────────────────────────────────────

export function useSystemMirror() {
  const latest = ref<SystemMetrics | null>(null);

  const cpu = computed(() => latest.value?.cpu ?? 0);
  const memory = computed(() => latest.value?.memory ?? 0);
  const battery = computed(() => latest.value?.battery);
  const focusedApp = computed(() => latest.value?.focusedApp ?? null);

  /** Whether CPU load is high enough to trigger visual stress */
  const isCpuStressed = computed(() => cpu.value >= CPU_HIGH);
  const isCpuMedium = computed(() => cpu.value >= CPU_MED && cpu.value < CPU_HIGH);

  /** Whether memory is critically low */
  const isMemoryLow = computed(() => memory.value >= (100 - MEM_LOW));

  /** Whether battery is low */
  const isBatteryLow = computed(() => {
    const b = battery.value;
    return b != null && b <= BATTERY_LOW;
  });

  /** Movement speed multiplier: 1.0 = normal, lower = heavier/slower */
  const speedMultiplier = computed(() => {
    if (isMemoryLow.value) return 0.4;
    if (memory.value >= 70) return 0.7;
    return 1.0;
  });

  /** Breathing amplitude multiplier: higher when CPU stressed */
  const breathAmplitude = computed(() => {
    if (isCpuStressed.value) return 2.5;
    if (isCpuMedium.value) return 1.5;
    return 1.0;
  });

  /** Eye direction hint: 'left' | 'right' | 'up' | 'down' | null */
  const eyeDirection = computed(() => {
    const app = focusedApp.value;
    if (!app) return null;
    // Pet looks toward the corner associated with the active app
    if (app === 'vscode' || app === 'cursor') return 'left';
    if (app === 'browser') return 'right';
    if (app === 'terminal') return 'down';
    return null;
  });

  /**
   * Determine the pet state override based on system metrics.
   * Returns null when no override is needed (let the normal state machine decide).
   */
  const stateOverride = computed<PetState | null>(() => {
    // Low battery: always override to 'sleeping' (yawning for charger)
    if (isBatteryLow.value) return 'sleeping';

    // High CPU: force 'working' (panting animation)
    if (isCpuStressed.value) return 'working';

    // Focus-based pose
    const app = focusedApp.value;
    if (app && app in FOCUS_POSE) return FOCUS_POSE[app];

    return null;
  });

  /** Whether the pet should emit sweat particles */
  const shouldSweat = computed(() => isCpuStressed.value);

  /** Whether the pet should feel 'heavy' (slow bob, droopy eyes) */
  const isHeavy = computed(() => isMemoryLow.value);

  /** Short status text for the speech bubble */
  const statusText = computed(() => {
    if (isBatteryLow.value) return `Battery ${battery.value}% — need charger!`;
    if (isCpuStressed.value) return `CPU ${cpu.value}% — working hard!`;
    if (isMemoryLow.value) return `Memory ${memory.value}% — running low...`;
    return null;
  });

  /** Update with new metrics from IPC */
  function update(metrics: SystemMetrics) {
    latest.value = metrics;
  }

  return {
    latest,
    cpu,
    memory,
    battery,
    focusedApp,
    isCpuStressed,
    isCpuMedium,
    isMemoryLow,
    isBatteryLow,
    speedMultiplier,
    breathAmplitude,
    eyeDirection,
    stateOverride,
    shouldSweat,
    isHeavy,
    statusText,
    update,
  };
}
