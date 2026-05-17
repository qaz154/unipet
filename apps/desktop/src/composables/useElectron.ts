/**
 * Electron IPC bridge composable.
 *
 * Provides typed access to the preload-exposed APIs. The global Window type
 * augmentation lives in src/types/unipet.d.ts, so we no longer need to cast
 * `window as any` here.
 */

import type { UniPetBridge, UniPetEventChannel } from '../types/unipet';

const getEp = (): UniPetBridge | undefined => window.unipet;

export function useElectron() {
  const electron = getEp();
  const isElectron = !!electron;

  return {
    isElectron,

    show: () => electron?.show() ?? Promise.resolve(),
    hide: () => electron?.hide() ?? Promise.resolve(),
    setAlwaysOnTop: (enabled: boolean) => electron?.setAlwaysOnTop(enabled) ?? Promise.resolve(),
    setClickThrough: (enabled: boolean) => electron?.setClickThrough(enabled) ?? Promise.resolve(),
    setContentProtection: (enabled: boolean) =>
      electron?.setContentProtection(enabled) ?? Promise.resolve(),
    move: (x: number, y: number) => electron?.move(x, y) ?? Promise.resolve(),
    getPosition: () => electron?.getPosition() ?? Promise.resolve<[number, number]>([0, 0]),
    openSettings: () => electron?.openSettings() ?? Promise.resolve(),
    isPaused: () => electron?.isPaused() ?? Promise.resolve(false),
    on: (channel: UniPetEventChannel, cb: (...args: unknown[]) => void) =>
      electron?.on(channel, cb),
  };
}
