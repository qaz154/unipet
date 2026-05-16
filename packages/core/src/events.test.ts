import { describe, it, expect } from 'vitest';
import {
  PET_STATES,
  STATE_PRIORITY,
  STATE_SET,
  createStateEvent,
  createSpeechEvent,
  createEmotionEvent,
  createMoveEvent,
  isValidState,
  isValidEmotionVector,
} from './events.js';

describe('events', () => {
  describe('state definitions', () => {
    it('has all states in the set', () => {
      for (const state of PET_STATES) {
        expect(STATE_SET.has(state)).toBe(true);
      }
    });

    it('has priority for every state', () => {
      for (const state of PET_STATES) {
        expect(typeof STATE_PRIORITY[state]).toBe('number');
      }
    });

    it('error has highest priority', () => {
      const maxPriority = Math.max(...Object.values(STATE_PRIORITY));
      expect(STATE_PRIORITY['error']).toBe(maxPriority);
    });

    it('sleeping has lowest priority', () => {
      const minPriority = Math.min(...Object.values(STATE_PRIORITY));
      expect(STATE_PRIORITY['sleeping']).toBe(minPriority);
    });
  });

  describe('event factories', () => {
    it('creates state events', () => {
      const event = createStateEvent('test', 'working', { key: 'value' });
      expect(event.type).toBe('state_change');
      expect(event.source).toBe('test');
      expect(event.state).toBe('working');
      expect(event.meta).toEqual({ key: 'value' });
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('creates speech events with truncation', () => {
      const longMsg = 'a'.repeat(200);
      const event = createSpeechEvent('test', longMsg);
      expect(event.type).toBe('speech');
      expect(event.message!.length).toBeLessThanOrEqual(140);
    });

    it('creates emotion events', () => {
      const event = createEmotionEvent('test', {
        valence: 0.5,
        arousal: 0.3,
        dominance: 0.7,
      });
      expect(event.type).toBe('emotion');
      expect(event.emotion!.valence).toBe(0.5);
    });

    it('creates move events', () => {
      const event = createMoveEvent('test', 'corner-br');
      expect(event.type).toBe('move');
      expect(event.move).toBe('corner-br');
    });
  });

  describe('validation', () => {
    it('validates known states', () => {
      expect(isValidState('idle')).toBe(true);
      expect(isValidState('working')).toBe(true);
      expect(isValidState('not-a-state')).toBe(false);
    });

    it('validates emotion vectors', () => {
      expect(isValidEmotionVector({ valence: 0, arousal: 0.5, dominance: 0.5 })).toBe(true);
      expect(isValidEmotionVector({ valence: -1, arousal: 0, dominance: 1 })).toBe(true);
      expect(isValidEmotionVector({ valence: 2, arousal: 0, dominance: 0 })).toBe(false);
      expect(isValidEmotionVector(null)).toBe(false);
      expect(isValidEmotionVector('hello')).toBe(false);
    });
  });
});
