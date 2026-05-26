/**
 * Ambient type declarations for the preload-exposed APIs.
 *
 * The preload script (`electron/preload.ts`) puts `window.unipet`.
 * Without this declaration, every renderer-side access required `(window as any).unipet.foo`,
 * which silently lost type safety throughout the codebase.
 */

export type UniPetEventChannel =
  | 'pet:pause-toggled'
  | 'pet:event'
  | 'pet:mini-mode'
  | 'pet:size-changed'
  | 'pet:clicked'
  | 'pet:dnd-changed'
  | 'permission:resolved'
  | 'settings:loaded'
  | 'settings:changed'
  | 'mouse-move'
  | 'drag:started'
  | 'drag:ended'
  | 'throw-pet'
  | 'shortcut'
  | 'user-idle'
  | 'system-metrics'
  | 'mesh:event';

export interface SystemMetrics {
  cpu: number;
  memory: number;
  memoryFree: number;
  memoryTotal: number;
  battery: number | null;
  onBattery: boolean;
  focusedWindow: string | null;
  focusedApp: string | null;
  timestamp: number;
}

/** Shape of pet:event payload received by the renderer */
export interface PetEventPayload {
  type: string;
  source: string;
  state?: string;
  message?: string;
  permissionId?: string;
  permissionTool?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface UniPetBridge {
  // ─── Window control ─────────────────────────────────
  show: () => Promise<void>;
  hide: () => Promise<void>;
  move: (x: number, y: number) => Promise<void>;
  startDrag: () => Promise<void>;
  getPosition: () => Promise<[number, number]>;

  // Fire-and-forget drag (no await, smooth)
  dragLock: (cursorX: number, cursorY: number) => void;
  dragMove: (cursorX: number, cursorY: number) => void;
  dragEnd: () => void;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  setContentProtection: (enabled: boolean) => Promise<void>;
  openSettings: () => Promise<void>;
  isPaused: () => Promise<boolean>;
  isDnd: () => Promise<boolean>;
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
  uninstallAgent: (agentId: string) => Promise<{
    success: boolean;
    output?: string;
    error?: string;
  }>;

  // ─── Generic IPC invoke ────────────────────────────
  /** Low-level IPC invoke for channels not yet typed. Prefer typed methods. */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;

  // ─── Permission ────────────────────────────────────
  respondToPermission: (permissionId: string, action: string) => Promise<unknown>;

  // ─── Settings persistence ──────────────────────────
  getSetting: <T = unknown>(key: string) => Promise<T | undefined>;
  setSetting: (key: string, value: unknown) => Promise<void>;
  getAllSettings: () => Promise<Record<string, unknown>>;

  // ─── Events ────────────────────────────────────────
  /** Subscribe to a renderer-visible IPC channel. */
  on: (channel: UniPetEventChannel, callback: (...args: unknown[]) => void) => void;
}

declare global {
  const __UNIPET_VERSION__: string;

  interface Window {
    /** Defined by `electron/preload.ts` in the renderer/settings windows. */
    unipet?: UniPetBridge;
  }
}

export {};
