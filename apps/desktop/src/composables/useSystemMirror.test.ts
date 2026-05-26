import { describe, expect, it } from 'vitest';
import { useSystemMirror } from '../composables/useSystemMirror.js';
import type { SystemMetrics } from '../types/unipet.js';

function metrics(overrides: Partial<SystemMetrics> = {}): SystemMetrics {
  return {
    cpu: 0,
    memory: 0,
    memoryFree: 8_000_000_000,
    memoryTotal: 16_000_000_000,
    battery: null,
    onBattery: false,
    focusedWindow: null,
    focusedApp: null,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('useSystemMirror', () => {
  it('starts with no metrics and no state override', () => {
    const mirror = useSystemMirror();
    expect(mirror.latest.value).toBeNull();
    expect(mirror.stateOverride.value).toBeNull();
    expect(mirror.speedMultiplier.value).toBe(1.0);
  });

  it('detects CPU stress and overrides to working', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ cpu: 85 }));
    expect(mirror.isCpuStressed.value).toBe(true);
    expect(mirror.stateOverride.value).toBe('working');
    expect(mirror.shouldSweat.value).toBe(true);
    expect(mirror.breathAmplitude.value).toBe(2.5);
    expect(mirror.statusText.value).toContain('CPU 85%');
  });

  it('detects medium CPU load', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ cpu: 60 }));
    expect(mirror.isCpuStressed.value).toBe(false);
    expect(mirror.isCpuMedium.value).toBe(true);
    expect(mirror.breathAmplitude.value).toBe(1.5);
    expect(mirror.stateOverride.value).toBeNull();
  });

  it('detects low memory and reduces speed', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ memory: 85 }));
    expect(mirror.isMemoryLow.value).toBe(true);
    expect(mirror.speedMultiplier.value).toBe(0.4);
    expect(mirror.isHeavy.value).toBe(true);
    expect(mirror.statusText.value).toContain('Memory 85%');
  });

  it('medium memory reduces speed to 0.7', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ memory: 75 }));
    expect(mirror.speedMultiplier.value).toBe(0.7);
    expect(mirror.isMemoryLow.value).toBe(false);
  });

  it('detects low battery and overrides to sleeping', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ battery: 10 }));
    expect(mirror.isBatteryLow.value).toBe(true);
    expect(mirror.stateOverride.value).toBe('sleeping');
    expect(mirror.statusText.value).toContain('Battery 10%');
  });

  it('battery 0 is also low', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ battery: 0 }));
    expect(mirror.isBatteryLow.value).toBe(true);
    expect(mirror.stateOverride.value).toBe('sleeping');
  });

  it('null battery is not low', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ battery: null }));
    expect(mirror.isBatteryLow.value).toBe(false);
  });

  it('maps focused app to pose', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ focusedApp: 'vscode' }));
    expect(mirror.stateOverride.value).toBe('working');
    expect(mirror.eyeDirection.value).toBe('left');
  });

  it('maps browser to thinking pose', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ focusedApp: 'browser' }));
    expect(mirror.stateOverride.value).toBe('thinking');
    expect(mirror.eyeDirection.value).toBe('right');
  });

  it('maps terminal to thinking pose with down eye direction', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ focusedApp: 'terminal' }));
    expect(mirror.stateOverride.value).toBe('thinking');
    expect(mirror.eyeDirection.value).toBe('down');
  });

  it('unknown app returns no state override', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ focusedApp: 'spotify' }));
    expect(mirror.stateOverride.value).toBeNull();
    expect(mirror.eyeDirection.value).toBeNull();
  });

  it('low battery takes priority over high CPU', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ cpu: 95, battery: 5 }));
    expect(mirror.stateOverride.value).toBe('sleeping');
  });

  it('statusText returns null when everything is normal', () => {
    const mirror = useSystemMirror();
    mirror.update(metrics({ cpu: 20, memory: 40, battery: 80 }));
    expect(mirror.statusText.value).toBeNull();
  });
});
