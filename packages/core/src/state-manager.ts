/**
 * Priority-based State Manager
 *
 * Resolves the dominant pet state across multiple agent sessions.
 * Ported from clawd-on-desk's state machine with improvements:
 * - XState-inspired but lighter (no dependency)
 * - Multi-session dominant state resolution
 * - Sleep sequence management
 * - Oneshot auto-return
 */

import {
  type PetState,
  STATE_PRIORITY,
  ONESHOT_STATES,
  ONESHOT_DURATION_MS,
} from './events.js';
import type { EventBus } from './event-bus.js';

export interface SessionState {
  sessionId: string;
  source: string;
  state: PetState;
  updatedAt: number;
  headless: boolean;
}

export interface StateManagerConfig {
  /** Duration to show oneshot states before auto-return (ms) */
  oneshotDurationMs?: number;
  /** Idle timeout before entering sleep sequence (ms) */
  idleTimeoutMs?: number;
  /** Whether to use full sleep sequence or direct sleep */
  sleepSequence?: 'full' | 'direct';
  /** Durations for each sleep phase (ms) */
  sleepPhaseDurationMs?: number;
}

const DEFAULT_CONFIG: Required<StateManagerConfig> = {
  oneshotDurationMs: ONESHOT_DURATION_MS,
  idleTimeoutMs: 2 * 60 * 1000, // 2 minutes (was 5, shortened for liveness)
  sleepSequence: 'full',
  sleepPhaseDurationMs: 3000,
};

export type StateChangeListener = (
  newState: PetState,
  previousState: PetState,
  source: string,
) => void;

export class StateManager {
  private readonly sessions = new Map<string, SessionState>();
  private currentState: PetState = 'idle';
  private previousState: PetState = 'idle';
  private oneshotTimer: ReturnType<typeof setTimeout> | undefined;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;
  private sleepPhase: PetState | undefined;
  private readonly config: Required<StateManagerConfig>;
  private readonly listeners: StateChangeListener[] = [];
  private suspended = false;

  constructor(
    private readonly bus: EventBus,
    config?: StateManagerConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupSubscriptions();
  }

  /** Current resolved state */
  get state(): PetState {
    return this.currentState;
  }

  /** All tracked sessions */
  get activeSessions(): readonly SessionState[] {
    return [...this.sessions.values()];
  }

  /** Check if a session is still alive (updated within maxAge) */
  isSessionAlive(sessionId: string, maxAgeMs = 120_000): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    return Date.now() - s.updatedAt < maxAgeMs;
  }

  /** Get stale session ids that haven't been updated within maxAge */
  getStaleSessions(maxAgeMs = 120_000): string[] {
    const now = Date.now();
    return [...this.sessions.entries()]
      .filter(([, s]) => now - s.updatedAt > maxAgeMs)
      .map(([id]) => id);
  }

  /** Register a state change listener */
  onChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /** Manually update a session state */
  updateSession(
    sessionId: string,
    source: string,
    state: PetState,
    headless = false,
  ): void {
    const existing = this.sessions.get(sessionId);
    this.sessions.set(sessionId, {
      sessionId,
      source,
      state,
      updatedAt: Date.now(),
      headless,
    });
    if (!existing) {
      this.bus.emit({
        type: 'session_start',
        source,
        sessionId,
        timestamp: Date.now(),
      });
    }
    this.resolveState();
  }

  /** Remove a session */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    this.bus.emit({
      type: 'session_end',
      source: session.source,
      sessionId,
      timestamp: Date.now(),
    });
    this.resolveState();
  }

  /** Suspend state transitions (e.g. settings overlay open) */
  suspend(): void {
    this.suspended = true;
  }

  /** Resume state transitions */
  resume(): void {
    this.suspended = false;
    this.resolveState();
  }

  /** Clean up stale sessions (no update for given duration) */
  cleanStale(maxAgeMs: number): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > maxAgeMs) {
        this.removeSession(id);
        removed++;
      }
    }
    return removed;
  }

  /** Reset to idle, clear all sessions */
  reset(): void {
    this.sessions.clear();
    this.clearTimers();
    this.transition('idle', 'system');
  }

  /**
   * Apply partial config changes at runtime.
   * Picks up the new values on the next sleep/oneshot timer reset, so existing
   * sessions keep running but the next idle cycle uses the new idleTimeoutMs /
   * sleepSequence. Useful for reactive settings UIs.
   */
  updateConfig(partial: Partial<StateManagerConfig>): void {
    if (partial.idleTimeoutMs !== undefined) this.config.idleTimeoutMs = partial.idleTimeoutMs;
    if (partial.sleepSequence !== undefined) this.config.sleepSequence = partial.sleepSequence;
    if (partial.oneshotDurationMs !== undefined) this.config.oneshotDurationMs = partial.oneshotDurationMs;
    if (partial.sleepPhaseDurationMs !== undefined) this.config.sleepPhaseDurationMs = partial.sleepPhaseDurationMs;
    // Re-evaluate the sleep timer with the new threshold; safe whether or not
    // a sleep is currently scheduled.
    this.resetSleepTimer();
  }

  // ─── Private ──────────────────────────────────────────────

  private setupSubscriptions(): void {
    // Listen for state_change events from adapters
    this.bus.on((event) => {
      if (event.type === 'state_change' && event.state) {
        const sessionId = event.sessionId ?? event.source;
        this.updateSession(sessionId, event.source, event.state);
      }
      if (event.type === 'session_end' && event.sessionId) {
        this.removeSession(event.sessionId);
      }
    });
  }

  private resolveState(): void {
    if (this.suspended) return;

    const dominated = this.resolveDominant();
    if (dominated !== this.currentState) {
      this.transition(dominated, 'resolution');
    }
    this.resetSleepTimer();
  }

  /** Pick the highest-priority state across all non-headless sessions */
  private resolveDominant(): PetState {
    let best: PetState = 'idle';
    let bestPriority = -1;

    for (const session of this.sessions.values()) {
      if (session.headless) continue;
      const priority = STATE_PRIORITY[session.state] ?? 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        best = session.state;
      }
    }

    return best;
  }

  private transition(newState: PetState, reason: string): void {
    if (this.suspended) return;
    if (newState === this.currentState) return;

    this.previousState = this.currentState;
    this.currentState = newState;

    // Set up oneshot auto-return
    if (ONESHOT_STATES.has(newState)) {
      this.startOneshotTimer();
    } else {
      this.clearOneshotTimer();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      listener(newState, this.previousState, reason);
    }
  }

  private startOneshotTimer(): void {
    this.clearOneshotTimer();
    this.oneshotTimer = setTimeout(() => {
      const baseState = this.hasActiveSessions() ? 'working' : 'idle';
      this.transition(baseState, 'oneshot_timeout');
    }, this.config.oneshotDurationMs);
  }

  private clearOneshotTimer(): void {
    if (this.oneshotTimer) {
      clearTimeout(this.oneshotTimer);
      this.oneshotTimer = undefined;
    }
  }

  private resetSleepTimer(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = undefined;
    }
    this.sleepPhase = undefined;

    if (this.hasActiveSessions()) return;

    this.sleepTimer = setTimeout(() => {
      this.startSleepSequence();
    }, this.config.idleTimeoutMs);
  }

  private startSleepSequence(): void {
    if (this.hasActiveSessions()) return;
    if (this.currentState === 'sleeping') return;

    if (this.config.sleepSequence === 'direct') {
      this.transition('sleeping', 'sleep_sequence');
      return;
    }

    // Full sequence: yawning -> dozing -> sleeping
    this.transition('yawning', 'sleep_sequence');
    this.sleepPhase = 'yawning';

    setTimeout(() => {
      if (this.sleepPhase !== 'yawning' || this.hasActiveSessions()) return;
      this.transition('dozing', 'sleep_sequence');
      this.sleepPhase = 'dozing';

      setTimeout(() => {
        if (this.sleepPhase !== 'dozing' || this.hasActiveSessions()) return;
        this.transition('sleeping', 'sleep_sequence');
        this.sleepPhase = undefined;
      }, this.config.sleepPhaseDurationMs);
    }, this.config.sleepPhaseDurationMs);
  }

  /** Wake from sleep on any user interaction */
  wake(): void {
    if (
      this.currentState === 'sleeping' ||
      this.currentState === 'yawning' ||
      this.currentState === 'dozing'
    ) {
      this.transition('waking', 'user_interaction');
      setTimeout(() => {
        if (this.currentState === 'waking') {
          this.transition('idle', 'wake_complete');
        }
      }, 1000);
    }
  }

  private hasActiveSessions(): boolean {
    for (const session of this.sessions.values()) {
      if (!session.headless) return true;
    }
    return false;
  }

  private clearTimers(): void {
    this.clearOneshotTimer();
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = undefined;
    }
    this.sleepPhase = undefined;
  }
}
