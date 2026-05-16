export {
  SPEECH_MAX_LENGTH,
  DEFAULT_HTTP_PORT,
} from './constants.js';

export {
  PET_STATES,
  STATE_PRIORITY,
  STATE_SET,
  ONESHOT_STATES,
  ONESHOT_DURATION_MS,
  EXTERNALLY_ALLOWED_STATES,
  isExternallyAllowedState,
  NEUTRAL_EMOTION,
  createStateEvent,
  createSpeechEvent,
  createEmotionEvent,
  createPermissionEvent,
  createMoveEvent,
  type PermissionResponse,
  isValidState,
  isValidEmotionVector,
  type PetState,
  type PetEvent,
  type PetEventType,
  type EmotionVector,
  type MoveTarget,
} from './events.js';

export { EventBus, type EventHandler, type EventFilter } from './event-bus.js';

export {
  StateManager,
  type SessionState,
  type StateManagerConfig,
  type StateChangeListener,
} from './state-manager.js';

export {
  EmotionEngine,
  type EmotionEngineConfig,
  type EmotionChangeListener,
} from './emotion-engine.js';

export {
  BubbleManager,
  sanitizeBubbleText,
  type Bubble,
  type BubbleKind,
  type BubbleManagerConfig,
  type BubbleListener,
} from './bubble-manager.js';

export {
  DEFAULT_CONFIG,
  getPublicConfig,
  type UniPetConfig,
  type AppearanceConfig,
  type AgentsConfig,
  type BehaviorConfig,
  type PerceptionConfig,
  type WindowConfig,
} from './config.js';

export { createLogger, type Logger, type LogLevel } from './logger.js';
