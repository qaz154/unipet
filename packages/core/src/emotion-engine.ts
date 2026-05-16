/**
 * Emotion Engine
 *
 * Three-dimensional emotion model (PAD: Pleasure-Arousal-Dominance).
 * Maintains a continuous emotion vector that decays toward neutral
 * over time, blends with incoming events, and can infer discrete
 * pet states for renderers that don't support continuous emotion.
 */

import {
  type EmotionVector,
  type PetState,
  NEUTRAL_EMOTION,
} from './events.js';
import type { EventBus } from './event-bus.js';

export interface EmotionEngineConfig {
  /** Per-second decay rate toward neutral (0-1) */
  decayRate?: number;
  /** Blending weight for incoming events (0-1) */
  blendWeight?: number;
  /** Update interval for decay (ms) */
  updateIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<EmotionEngineConfig> = {
  decayRate: 0.02,
  blendWeight: 0.5,
  updateIntervalMs: 1000,
};

/** Map states to implied emotion vectors */
const STATE_EMOTION_MAP: Partial<Record<PetState, EmotionVector>> = {
  error:       { valence: -0.8, arousal: 0.9, dominance: 0.3 },
  notification:{ valence: 0.0,  arousal: 0.7, dominance: 0.4 },
  shocked:     { valence: -0.3, arousal: 0.95, dominance: 0.2 },
  sweeping:    { valence: 0.1,  arousal: 0.4, dominance: 0.5 },
  attention:   { valence: 0.8,  arousal: 0.6, dominance: 0.7 },
  celebrating: { valence: 0.9,  arousal: 0.8, dominance: 0.8 },
  juggling:    { valence: 0.2,  arousal: 0.6, dominance: 0.6 },
  testing:     { valence: 0.1,  arousal: 0.5, dominance: 0.6 },
  working:     { valence: 0.1,  arousal: 0.5, dominance: 0.6 },
  editing:     { valence: 0.1,  arousal: 0.4, dominance: 0.6 },
  talking:     { valence: 0.3,  arousal: 0.5, dominance: 0.5 },
  thinking:    { valence: 0.0,  arousal: 0.3, dominance: 0.4 },
  waiting:     { valence: -0.1, arousal: 0.2, dominance: 0.3 },
  happy:       { valence: 0.7,  arousal: 0.5, dominance: 0.6 },
  angry:       { valence: -0.6, arousal: 0.8, dominance: 0.7 },
  love:        { valence: 0.9,  arousal: 0.3, dominance: 0.4 },
  waving:      { valence: 0.5,  arousal: 0.4, dominance: 0.5 },
  walking:     { valence: 0.2,  arousal: 0.3, dominance: 0.5 },
  crawling:    { valence: 0.1,  arousal: 0.2, dominance: 0.4 },
  yawning:     { valence: 0.0,  arousal: 0.1, dominance: 0.3 },
  dozing:      { valence: 0.0,  arousal: 0.05, dominance: 0.2 },
  waking:      { valence: 0.1,  arousal: 0.3, dominance: 0.4 },
  dragging:    { valence: 0.0,  arousal: 0.4, dominance: 0.2 },
  peeking:     { valence: 0.2,  arousal: 0.3, dominance: 0.3 },
  idle:        { valence: 0.1,  arousal: 0.1, dominance: 0.5 },
  sleeping:    { valence: 0.0,  arousal: 0.0, dominance: 0.2 },
};

export type EmotionChangeListener = (emotion: EmotionVector) => void;

export class EmotionEngine {
  private current: EmotionVector = { ...NEUTRAL_EMOTION };
  private readonly config: Required<EmotionEngineConfig>;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private readonly listeners: EmotionChangeListener[] = [];

  constructor(
    private readonly bus: EventBus,
    config?: EmotionEngineConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupSubscriptions();
  }

  /** Current emotion vector */
  get emotion(): Readonly<EmotionVector> {
    return this.current;
  }

  /** Register an emotion change listener */
  onChange(listener: EmotionChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /** Start the decay timer */
  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.decay(this.config.updateIntervalMs / 1000);
    }, this.config.updateIntervalMs);
  }

  /** Stop the decay timer */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /** Manually set emotion (e.g. from AI perception) */
  setEmotion(emotion: EmotionVector, weight = 1.0): void {
    this.blend(emotion, weight);
  }

  /** Reset to neutral */
  reset(): void {
    this.current = { ...NEUTRAL_EMOTION };
    this.notifyListeners();
  }

  /** Infer a discrete pet state from the current emotion vector */
  inferState(): PetState {
    const { valence, arousal } = this.current;

    if (arousal > 0.7 && valence > 0.3) return 'happy';
    if (arousal > 0.7 && valence < -0.3) return 'angry';
    if (valence > 0.8 && arousal < 0.4) return 'love';
    if (arousal < 0.1) return 'idle';

    return 'idle';
  }

  // ─── Private ──────────────────────────────────────────────

  private setupSubscriptions(): void {
    this.bus.on((event) => {
      if (event.emotion) {
        this.blend(event.emotion, this.config.blendWeight);
      } else if (event.state) {
        const implied = STATE_EMOTION_MAP[event.state];
        if (implied) {
          this.blend(implied, this.config.blendWeight * 0.6);
        }
      }
    });
  }

  private blend(incoming: EmotionVector, weight: number): void {
    const prev = { ...this.current };
    this.current = {
      valence: lerp(this.current.valence, incoming.valence, weight),
      arousal: lerp(this.current.arousal, incoming.arousal, weight),
      dominance: lerp(this.current.dominance, incoming.dominance, weight),
    };
    if (!vectorsEqual(prev, this.current)) {
      this.notifyListeners();
    }
  }

  private decay(dtSeconds: number): void {
    const rate = this.config.decayRate * dtSeconds;
    const prev = { ...this.current };

    this.current = {
      valence: this.current.valence * (1 - rate),
      arousal: this.current.arousal * (1 - rate * 0.5),
      dominance: this.current.dominance + (NEUTRAL_EMOTION.dominance - this.current.dominance) * rate,
    };

    // Snap to neutral when very close
    if (Math.abs(this.current.valence) < 0.01) this.current.valence = 0;
    if (Math.abs(this.current.arousal) < 0.01) this.current.arousal = 0;

    if (!vectorsEqual(prev, this.current)) {
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    const snapshot = { ...this.current };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function vectorsEqual(a: EmotionVector, b: EmotionVector): boolean {
  return (
    Math.abs(a.valence - b.valence) < 0.001 &&
    Math.abs(a.arousal - b.arousal) < 0.001 &&
    Math.abs(a.dominance - b.dominance) < 0.001
  );
}
