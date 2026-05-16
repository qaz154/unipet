import { describe, it, expect } from 'vitest';
import { WIGGLE_PROFILES, DEFAULT_WIGGLE, calculateRowOffsets } from './wiggle-profiles.js';

describe('wiggle-profiles', () => {
  it('has profiles for all common states', () => {
    const expectedStates = [
      'idle', 'thinking', 'working', 'editing', 'testing',
      'walking', 'sleeping', 'shocked', 'happy', 'angry',
      'love', 'dragging', 'celebrating',
    ];
    for (const state of expectedStates) {
      expect(WIGGLE_PROFILES[state]).toBeDefined();
    }
  });

  it('all profiles have valid amplitudes', () => {
    for (const [name, profile] of Object.entries(WIGGLE_PROFILES)) {
      expect(profile.shiftXAmp).toBeGreaterThanOrEqual(0);
      expect(profile.offsetYAmp).toBeGreaterThanOrEqual(0);
      expect(profile.freq).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_WIGGLE is the idle profile', () => {
    expect(DEFAULT_WIGGLE).toBe(WIGGLE_PROFILES['idle']);
  });

  it('calculateRowOffsets returns correct number of rows', () => {
    const offsets = calculateRowOffsets(WIGGLE_PROFILES['idle'], 16, 0);
    expect(offsets).toHaveLength(16);
  });

  it('each row offset has shiftX and offsetY', () => {
    const offsets = calculateRowOffsets(WIGGLE_PROFILES['idle'], 8, 1.0);
    for (const offset of offsets) {
      expect(typeof offset.shiftX).toBe('number');
      expect(typeof offset.offsetY).toBe('number');
      expect(Number.isFinite(offset.shiftX)).toBe(true);
      expect(Number.isFinite(offset.offsetY)).toBe(true);
    }
  });

  it('sleeping profile has lower amplitude than idle', () => {
    const sleepProfile = WIGGLE_PROFILES['sleeping'];
    const idleProfile = WIGGLE_PROFILES['idle'];
    expect(sleepProfile.offsetYAmp).toBeLessThanOrEqual(idleProfile.offsetYAmp);
  });

  it('shocked profile has high frequency', () => {
    expect(WIGGLE_PROFILES['shocked'].freq).toBeGreaterThan(5);
  });

  it('depth-weighted profiles have decreasing movement for lower rows', () => {
    const offsets = calculateRowOffsets(WIGGLE_PROFILES['idle'], 16, 0.5);
    // First row (top) should have larger absolute offset than last row
    const topRowMovement = Math.abs(offsets[0].offsetY);
    const bottomRowMovement = Math.abs(offsets[15].offsetY);
    expect(topRowMovement).toBeGreaterThanOrEqual(bottomRowMovement);
  });
});
