import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from './event-bus.js';
import { EmotionEngine } from './emotion-engine.js';
import { createStateEvent, NEUTRAL_EMOTION } from './events.js';

describe('EmotionEngine', () => {
  let bus: EventBus;
  let engine: EmotionEngine;

  beforeEach(() => {
    bus = new EventBus();
    engine = new EmotionEngine(bus, {
      decayRate: 0.1,
      blendWeight: 0.5,
      updateIntervalMs: 50,
    });
  });

  afterEach(() => {
    engine.stop();
  });

  it('starts at neutral emotion', () => {
    expect(engine.emotion.valence).toBeCloseTo(NEUTRAL_EMOTION.valence);
    expect(engine.emotion.arousal).toBeCloseTo(NEUTRAL_EMOTION.arousal);
    expect(engine.emotion.dominance).toBeCloseTo(NEUTRAL_EMOTION.dominance);
  });

  it('blends with explicit emotion events', () => {
    engine.setEmotion({ valence: 0.8, arousal: 0.6, dominance: 0.7 }, 1.0);

    expect(engine.emotion.valence).toBeCloseTo(0.8);
    expect(engine.emotion.arousal).toBeCloseTo(0.6);
    expect(engine.emotion.dominance).toBeCloseTo(0.7);
  });

  it('infers emotion from state events', () => {
    bus.emit(createStateEvent('test', 'error'));
    // error state implies negative valence, high arousal
    expect(engine.emotion.valence).toBeLessThan(0);
    expect(engine.emotion.arousal).toBeGreaterThan(0.3);
  });

  it('decays toward neutral over time', async () => {
    engine.setEmotion({ valence: 1.0, arousal: 1.0, dominance: 1.0 }, 1.0);

    engine.start();
    await new Promise((r) => setTimeout(r, 200));

    // Should have decayed somewhat
    expect(engine.emotion.valence).toBeLessThan(1.0);
    expect(engine.emotion.arousal).toBeLessThan(1.0);
  });

  it('infers happy state for positive valence + high arousal', () => {
    engine.setEmotion({ valence: 0.8, arousal: 0.8, dominance: 0.5 }, 1.0);
    expect(engine.inferState()).toBe('happy');
  });

  it('infers angry state for negative valence + high arousal', () => {
    engine.setEmotion({ valence: -0.8, arousal: 0.8, dominance: 0.5 }, 1.0);
    expect(engine.inferState()).toBe('angry');
  });

  it('infers idle state for low arousal', () => {
    engine.setEmotion({ valence: 0, arousal: 0.05, dominance: 0.5 }, 1.0);
    expect(engine.inferState()).toBe('idle');
  });

  it('notifies listeners on change', () => {
    const listener = vi.fn();
    engine.onChange(listener);

    engine.setEmotion({ valence: 0.5, arousal: 0.5, dominance: 0.5 }, 1.0);

    expect(listener).toHaveBeenCalled();
  });

  it('reset returns to neutral', () => {
    engine.setEmotion({ valence: 1.0, arousal: 1.0, dominance: 1.0 }, 1.0);
    engine.reset();

    expect(engine.emotion.valence).toBeCloseTo(NEUTRAL_EMOTION.valence);
    expect(engine.emotion.arousal).toBeCloseTo(NEUTRAL_EMOTION.arousal);
  });
});
