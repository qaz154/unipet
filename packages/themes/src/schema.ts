/**
 * Theme Schema
 *
 * Defines the structure of a UniPet theme.
 * Merges clawd-on-desk's rich theme schema with openpets' pet pack format.
 */

import type { PetState, EmotionVector } from '@unipet/core';

export interface ThemeDefinition {
  schemaVersion: 1;
  id: string;
  displayName: string;
  description: string;
  author: string;
  license: string;
  /** Which renderer to use */
  renderer: 'css-pixel' | 'svg' | 'spritesheet' | 'live2d';
  /** Renderer-specific configuration */
  rendererConfig: CSSPixelThemeConfig | SVGThemeConfig | SpriteThemeConfig;
  /** State → visual resource mapping */
  states: Record<string, StateDefinition>;
  /** Variants (partial overrides) */
  variants?: Record<string, ThemeVariant>;
  /** Timing configuration */
  timings: ThemeTimings;
  /** Clickable areas */
  hitBoxes?: Record<string, HitBox>;
  /** Sound effects */
  sounds?: Record<string, string>;
  /** Sleep sequence mode */
  sleepSequence?: 'full' | 'direct';
  /** Idle animation cycling */
  idleAnimations?: string[];
  /** Click/drag reaction animations */
  reactions?: Record<string, string>;
}

export interface StateDefinition {
  /** Visual file(s) for this state */
  files: string[];
  /** Fallback state if files are missing */
  fallbackTo?: string;
  /** Minimum display duration (ms) */
  minDurationMs?: number;
  /** Auto-return timeout for oneshot states (ms) */
  autoReturnMs?: number;
}

export interface ThemeVariant {
  /** Partial state overrides */
  states?: Record<string, Partial<StateDefinition>>;
  /** Partial timing overrides */
  timings?: Partial<ThemeTimings>;
  /** Partial hitbox overrides */
  hitBoxes?: Record<string, HitBox>;
  /** Partial idle animation overrides */
  idleAnimations?: string[];
}

export interface ThemeTimings {
  /** Minimum time to display a state (ms) */
  minDisplayMs: number;
  /** Auto-return timeout for oneshot states (ms) */
  autoReturnMs: number;
  /** Sleep sequence phase duration (ms) */
  sleepPhaseMs: number;
  /** Mouse idle timeout before sleep (ms) */
  mouseIdleTimeoutMs: number;
  /** Idle animation cycle interval (ms) */
  idleCycleMs: number;
}

export const DEFAULT_TIMINGS: ThemeTimings = {
  minDisplayMs: 500,
  autoReturnMs: 3000,
  sleepPhaseMs: 3000,
  mouseIdleTimeoutMs: 5 * 60 * 1000,
  idleCycleMs: 10000,
};

export interface HitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Renderer-specific configs ────────────────────────────────

export interface CSSPixelThemeConfig {
  gridSize: number;
  upscale: number;
  palette: Record<string, string>;
  body: string[];
  faces: Record<string, { eyes: string[]; eyePos: { row: number; col: number }; mouth?: string[]; mouthPos?: { row: number; col: number } }>;
}

export interface SVGThemeConfig {
  viewBox: string;
  renderMode?: 'object' | 'img';
  eyeTracking?: {
    eyeSelector: string;
    states: string[];
    maxOffset: number;
  };
}

export interface SpriteThemeConfig {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  stateRows: Record<string, { row: number; frames: number; frameRate: number }>;
}

// ─── Validation ───────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

export function validateTheme(data: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ path: 'root', message: 'Theme must be an object' }] };
  }

  const theme = data as Record<string, unknown>;

  // Required fields
  if (theme['schemaVersion'] !== 1) {
    errors.push({ path: 'schemaVersion', message: 'Must be 1' });
  }
  if (typeof theme['id'] !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(theme['id'])) {
    errors.push({ path: 'id', message: 'Must match /^[a-z0-9][a-z0-9_-]{0,63}$/' });
  }
  if (typeof theme['displayName'] !== 'string' || theme['displayName'].length === 0) {
    errors.push({ path: 'displayName', message: 'Must be a non-empty string' });
  }
  if (!['css-pixel', 'svg', 'spritesheet', 'live2d'].includes(theme['renderer'] as string)) {
    errors.push({ path: 'renderer', message: 'Must be one of: css-pixel, svg, spritesheet, live2d' });
  }
  if (!theme['rendererConfig'] || typeof theme['rendererConfig'] !== 'object') {
    errors.push({ path: 'rendererConfig', message: 'Must be an object' });
  }
  if (!theme['states'] || typeof theme['states'] !== 'object') {
    errors.push({ path: 'states', message: 'Must be an object mapping state names to definitions' });
  }

  // Validate state definitions
  if (theme['states'] && typeof theme['states'] === 'object') {
    const states = theme['states'] as Record<string, unknown>;
    for (const [key, value] of Object.entries(states)) {
      if (!value || typeof value !== 'object') {
        errors.push({ path: `states.${key}`, message: 'Must be an object' });
        continue;
      }
      const state = value as Record<string, unknown>;
      if (!Array.isArray(state['files'])) {
        errors.push({ path: `states.${key}.files`, message: 'Must be an array of file paths' });
      }
    }
  }

  // Validate timings (optional)
  if (theme['timings'] !== undefined) {
    if (typeof theme['timings'] !== 'object') {
      errors.push({ path: 'timings', message: 'Must be an object' });
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Required states that every theme must define */
export const REQUIRED_STATES: PetState[] = ['idle', 'working', 'thinking', 'error', 'attention', 'sleeping'];

/** Required states for full sleep sequence */
export const SLEEP_SEQUENCE_STATES: PetState[] = ['yawning', 'dozing', 'waking'];
