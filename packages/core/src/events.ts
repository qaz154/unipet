import { SPEECH_MAX_LENGTH } from './constants.js';

/**
 * Unified Pet Event System
 *
 * The single source of truth for all pet states and events.
 * Merges state systems from clawd-on-desk (priority-based),
 * openpets (reactions), and qq-slime-pet (AI-driven).
 */

// ─── Pet States ───────────────────────────────────────────────

export const PET_STATES = [
  // Sleep sequence
  'sleeping', 'yawning', 'dozing', 'waking',
  // Base states
  'idle', 'thinking', 'working',
  // Agent activity
  'editing', 'testing', 'juggling', 'waiting',
  // Completion / attention
  'attention', 'celebrating', 'sweeping',
  // Alerts
  'notification', 'error', 'shocked',
  // AI-driven emotional
  'happy', 'angry', 'love', 'walking', 'crawling',
  // Interaction
  'dragging', 'peeking', 'talking', 'waving',
] as const;

export type PetState = (typeof PET_STATES)[number];

export const STATE_SET = new Set<string>(PET_STATES);

/** Priority map — higher number overrides lower */
export const STATE_PRIORITY: Record<PetState, number> = {
  error: 10,
  notification: 9,
  shocked: 9,
  sweeping: 8,
  attention: 8,
  celebrating: 8,
  juggling: 7,
  testing: 7,
  working: 6,
  editing: 6,
  talking: 6,
  thinking: 5,
  waiting: 5,
  happy: 4,
  angry: 4,
  love: 4,
  waving: 3,
  walking: 3,
  crawling: 3,
  yawning: 2,
  dozing: 2,
  waking: 2,
  peeking: 1,
  dragging: 1,
  idle: 1,
  sleeping: 0,
};

/** States that auto-return to base after a timeout */
export const ONESHOT_STATES = new Set<PetState>([
  'attention', 'error', 'sweeping', 'notification',
  'celebrating', 'shocked', 'waving',
]);

/** Default auto-return duration for oneshot states (ms) */
export const ONESHOT_DURATION_MS = 3000;

/**
 * Subset of states that external agents (HTTP/MCP/hooks) are allowed to push.
 * Excludes:
 * - Sleep machinery (`sleeping`, `yawning`, `dozing`, `waking`) — controlled
 *   by StateManager, not agents
 * - Interaction primitives (`dragging`, `peeking`) — driven by input
 * - `crawling`, `walking`, `talking` — reserved for theme-driven animations
 *
 * Use `isExternallyAllowed(state)` for the runtime check.
 */
export const EXTERNALLY_ALLOWED_STATES: readonly PetState[] = [
  'idle', 'thinking', 'working', 'editing', 'testing', 'waiting',
  'juggling', 'attention', 'celebrating', 'sweeping',
  'notification', 'error', 'shocked',
  'happy', 'angry', 'love', 'waving',
] as const;

const EXTERNALLY_ALLOWED_SET = new Set<string>(EXTERNALLY_ALLOWED_STATES);

export function isExternallyAllowedState(state: string): state is PetState {
  return EXTERNALLY_ALLOWED_SET.has(state);
}

// ─── Emotion Vector (PAD model) ───────────────────────────────

export interface EmotionVector {
  /** -1 (negative) to +1 (positive) */
  valence: number;
  /** 0 (calm) to 1 (excited) */
  arousal: number;
  /** 0 (submissive) to 1 (dominant) */
  dominance: number;
}

export const NEUTRAL_EMOTION: EmotionVector = {
  valence: 0,
  arousal: 0.1,
  dominance: 0.5,
};

// ─── Movement ─────────────────────────────────────────────────

export type MoveTarget =
  | 'stay' | 'center'
  | 'edge-left' | 'edge-right' | 'edge-top' | 'edge-bottom'
  | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br';

// ─── Pet Event ────────────────────────────────────────────────

export type PetEventType =
  | 'state_change'
  | 'speech'
  | 'emotion'
  | 'move'
  | 'command'
  | 'permission'
  | 'session_start'
  | 'session_end';

export interface PetEvent {
  type: PetEventType;
  /** Adapter id that produced this event */
  source: string;
  /** Target pet state */
  state?: PetState;
  /** Speech bubble text (max 140 chars, sanitized) */
  message?: string;
  /** Emotion vector override */
  emotion?: EmotionVector;
  /** Movement target */
  move?: MoveTarget;
  /** Command name (plugin-specific) */
  command?: string;
  /** Session identifier */
  sessionId?: string;
  /** Permission request id (for permission events) */
  permissionId?: string;
  /** Tool name that triggered permission request */
  permissionTool?: string;
  /** Arbitrary metadata */
  meta?: Record<string, unknown>;
  /** Unix timestamp */
  timestamp: number;
}

export interface PermissionResponse {
  permissionId: string;
  action: 'allow' | 'deny' | 'allow-once' | 'deny-once';
}

// ─── Event Factories ──────────────────────────────────────────

export function createStateEvent(
  source: string,
  state: PetState,
  meta?: Record<string, unknown>,
): PetEvent {
  return {
    type: 'state_change',
    source,
    state,
    meta,
    timestamp: Date.now(),
  };
}

export function createSpeechEvent(
  source: string,
  message: string,
  state?: PetState,
): PetEvent {
  return {
    type: 'speech',
    source,
    message: message.slice(0, SPEECH_MAX_LENGTH),
    state,
    timestamp: Date.now(),
  };
}

export function createEmotionEvent(
  source: string,
  emotion: EmotionVector,
): PetEvent {
  return {
    type: 'emotion',
    source,
    emotion,
    timestamp: Date.now(),
  };
}

export function createPermissionEvent(
  source: string,
  permissionId: string,
  toolName: string,
  message?: string,
): PetEvent {
  return {
    type: 'permission',
    source,
    permissionId,
    permissionTool: toolName,
    message,
    timestamp: Date.now(),
  };
}

export function createMoveEvent(
  source: string,
  move: MoveTarget,
): PetEvent {
  return {
    type: 'move',
    source,
    move,
    timestamp: Date.now(),
  };
}

// ─── Validation ───────────────────────────────────────────────

export function isValidState(value: string): value is PetState {
  return STATE_SET.has(value);
}

export function isValidEmotionVector(v: unknown): v is EmotionVector {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.valence === 'number' &&
    typeof obj.arousal === 'number' &&
    typeof obj.dominance === 'number' &&
    obj.valence >= -1 && obj.valence <= 1 &&
    obj.arousal >= 0 && obj.arousal <= 1 &&
    obj.dominance >= 0 && obj.dominance <= 1
  );
}
