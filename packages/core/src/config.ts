/**
 * Configuration Schema
 *
 * Defines the shape of the UniPet configuration.
 * Serializable to/from JSON for persistent storage.
 */

export interface UniPetConfig {
  /** Pet appearance */
  appearance: AppearanceConfig;
  /** Agent integrations */
  agents: AgentsConfig;
  /** Behavior settings */
  behavior: BehaviorConfig;
  /** AI perception (optional) */
  perception?: PerceptionConfig;
  /** Window settings */
  window: WindowConfig;
}

export interface AppearanceConfig {
  /** Active theme id */
  themeId: string;
  /** Active variant name (optional) */
  variant?: string;
  /** Pet scale (0.5 - 3.0) */
  scale: number;
  /** Window opacity (0.1 - 1.0) */
  opacity: number;
}

export interface AgentsConfig {
  /** List of enabled adapter ids */
  enabled: string[];
  /** Per-adapter configuration */
  overrides: Record<string, Record<string, unknown>>;
}

export interface BehaviorConfig {
  /** Sleep sequence mode */
  sleepSequence: 'full' | 'direct';
  /** Idle timeout before sleep (ms) */
  idleTimeoutMs: number;
  /** Enable click reactions */
  clickReactions: boolean;
  /** Enable drag interaction */
  dragEnabled: boolean;
  /** Enable eye tracking (mouse follow) */
  eyeTracking: boolean;
  /** Enable sound effects */
  soundEnabled: boolean;
  /** Default speech bubble duration (ms) */
  speechDurationMs: number;
}

export interface PerceptionConfig {
  /** Screenshot capture interval (seconds) */
  captureIntervalSec: number;
  /** AI backend protocol */
  protocol: 'messages' | 'chat' | 'responses';
  /** API endpoint */
  endpoint: string;
  /** API key (stored securely, never exposed to renderer) */
  apiKey: string;
  /** Model id */
  model: string;
  /** Whether pet is invisible to its own screenshots */
  contentProtection: boolean;
  /** Max screenshot width */
  maxScreenshotWidth: number;
}

export interface WindowConfig {
  /** Always on top */
  alwaysOnTop: boolean;
  /** Click through (transparent regions) */
  clickThrough: boolean;
  /** Skip taskbar */
  skipTaskbar: boolean;
  /** Start position */
  position: { x: number; y: number };
  /** Remember position across restarts */
  rememberPosition: boolean;
}

/** Sensible defaults */
export const DEFAULT_CONFIG: UniPetConfig = {
  appearance: {
    themeId: 'pixel-slime',
    scale: 1.0,
    opacity: 1.0,
  },
  agents: {
    enabled: [],
    overrides: {},
  },
  behavior: {
    sleepSequence: 'full',
    idleTimeoutMs: 5 * 60 * 1000,
    clickReactions: true,
    dragEnabled: true,
    eyeTracking: true,
    soundEnabled: false,
    speechDurationMs: 5000,
  },
  window: {
    alwaysOnTop: true,
    clickThrough: false,
    skipTaskbar: true,
    position: { x: -1, y: -1 }, // -1 = auto (bottom-right)
    rememberPosition: true,
  },
};

/** Strip sensitive fields for renderer consumption */
export function getPublicConfig(config: UniPetConfig): Omit<UniPetConfig, 'perception'> & { perception?: Omit<PerceptionConfig, 'apiKey'> & { hasApiKey: boolean } } {
  const { perception, ...rest } = config;
  if (!perception) return rest;
  const { apiKey, ...publicPerception } = perception;
  return {
    ...rest,
    perception: {
      ...publicPerception,
      hasApiKey: apiKey.length > 0,
    },
  };
}
