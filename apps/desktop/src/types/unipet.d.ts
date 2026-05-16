/**
 * Ambient type declarations for the preload-exposed APIs.
 *
 * The preload script (`electron/preload.ts`) puts `window.unipet`, and
 * `electron/preload-hit.js` puts `window.hitAPI`. Without this declaration,
 * every renderer-side access required `(window as any).unipet.foo`, which
 * silently lost type safety throughout the codebase.
 */

export type UniPetEventChannel =
  | 'pet:pause-toggled'
  | 'pet:event'
  | 'pet:mini-mode'
  | 'pet:size-changed'
  | 'pet:clicked'
  | 'settings:loaded'
  | 'settings:changed'
  | 'mouse-move'
  | 'drag:started'
  | 'drag:ended'
  | 'throw-pet'
  | 'shortcut';

export interface UniPetBridge {
  // ─── Window control ─────────────────────────────────
  show: () => Promise<void>;
  hide: () => Promise<void>;
  move: (x: number, y: number) => Promise<void>;
  startDrag: () => Promise<void>;
  getPosition: () => Promise<[number, number]>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  setContentProtection: (enabled: boolean) => Promise<void>;
  openSettings: () => Promise<void>;
  isPaused: () => Promise<boolean>;
  setState: (state: string) => Promise<void>;

  // ─── Frameless window controls ─────────────────────
  windowClose: () => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;

  // ─── Agents ────────────────────────────────────────
  installAgent: (agentId: string) => Promise<{
    success: boolean;
    output?: string;
    error?: string;
  }>;

  // ─── Generic IPC invoke ────────────────────────────
  /** Low-level IPC invoke for channels not yet typed. Prefer typed methods. */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;

  // ─── Settings persistence ──────────────────────────
  getSetting: <T = unknown>(key: string) => Promise<T | undefined>;
  setSetting: (key: string, value: unknown) => Promise<void>;
  getAllSettings: () => Promise<Record<string, unknown>>;

  // ─── Events ────────────────────────────────────────
  /** Subscribe to a renderer-visible IPC channel. Untyped args; cast at call site. */
  on: (channel: UniPetEventChannel, callback: (...args: unknown[]) => void) => void;
}

export interface HitAPI {
  dragLock: (cursorX: number, cursorY: number) => void;
  dragMove: (cursorX: number, cursorY: number) => void;
  dragEnd: () => void;
  click: (x: number, y: number) => void;
  contextMenu: () => void;
  openSettings: () => void;
  mouseMove: (x: number, y: number) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    /** Defined by `electron/preload.ts` in the renderer/settings windows. */
    unipet?: UniPetBridge;
    /** Defined by `electron/preload-hit.js` in the hit window only. */
    hitAPI?: HitAPI;
  }
}

export {};
