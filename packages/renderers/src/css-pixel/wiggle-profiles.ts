/**
 * Per-row Pixel Wiggle Profiles
 *
 * Ported from qq-slime-pet's sprite.js WIGGLE_PROFILES.
 * Each profile defines sinusoidal offsets per row for a given state.
 */

export interface WiggleProfile {
  /** Horizontal shift amplitude per row (pixels) */
  shiftXAmp: number;
  /** Vertical offset amplitude per row (pixels) */
  offsetYAmp: number;
  /** Frequency multiplier */
  freq: number;
  /** Phase offset per row (radians) */
  phasePerRow: number;
  /** Depth weighting: higher rows move more */
  depthWeighted: boolean;
}

export const WIGGLE_PROFILES: Record<string, WiggleProfile> = {
  idle: {
    shiftXAmp: 0.3,
    offsetYAmp: 0.5,
    freq: 1.0,
    phasePerRow: 0.15,
    depthWeighted: true,
  },
  thinking: {
    shiftXAmp: 0.4,
    offsetYAmp: 0.3,
    freq: 0.8,
    phasePerRow: 0.2,
    depthWeighted: true,
  },
  working: {
    shiftXAmp: 0.6,
    offsetYAmp: 0.4,
    freq: 1.5,
    phasePerRow: 0.3,
    depthWeighted: true,
  },
  editing: {
    shiftXAmp: 0.5,
    offsetYAmp: 0.3,
    freq: 2.0,
    phasePerRow: 0.25,
    depthWeighted: true,
  },
  testing: {
    shiftXAmp: 0.8,
    offsetYAmp: 0.5,
    freq: 2.5,
    phasePerRow: 0.4,
    depthWeighted: false,
  },
  walking: {
    shiftXAmp: 1.2,
    offsetYAmp: 0.6,
    freq: 2.0,
    phasePerRow: 0.5,
    depthWeighted: false,
  },
  crawling: {
    shiftXAmp: 1.0,
    offsetYAmp: 0.4,
    freq: 1.8,
    phasePerRow: 0.6,
    depthWeighted: false,
  },
  sleeping: {
    shiftXAmp: 0.0,
    offsetYAmp: 0.4,
    freq: 0.3,
    phasePerRow: 0.1,
    depthWeighted: true,
  },
  yawning: {
    shiftXAmp: 0.2,
    offsetYAmp: 0.8,
    freq: 0.5,
    phasePerRow: 0.1,
    depthWeighted: true,
  },
  dozing: {
    shiftXAmp: 0.1,
    offsetYAmp: 0.3,
    freq: 0.4,
    phasePerRow: 0.08,
    depthWeighted: true,
  },
  waking: {
    shiftXAmp: 0.5,
    offsetYAmp: 0.6,
    freq: 1.2,
    phasePerRow: 0.2,
    depthWeighted: true,
  },
  shocked: {
    shiftXAmp: 1.5,
    offsetYAmp: 1.0,
    freq: 8.0,
    phasePerRow: 0.0,
    depthWeighted: false,
  },
  happy: {
    shiftXAmp: 0.8,
    offsetYAmp: 0.6,
    freq: 1.5,
    phasePerRow: 0.3,
    depthWeighted: true,
  },
  angry: {
    shiftXAmp: 1.2,
    offsetYAmp: 0.8,
    freq: 5.0,
    phasePerRow: 0.1,
    depthWeighted: false,
  },
  love: {
    shiftXAmp: 0.4,
    offsetYAmp: 0.5,
    freq: 0.7,
    phasePerRow: 0.2,
    depthWeighted: true,
  },
  dragging: {
    shiftXAmp: 1.8,
    offsetYAmp: 1.0,
    freq: 0.6,
    phasePerRow: 0.3,
    depthWeighted: true,
  },
  celebrating: {
    shiftXAmp: 1.0,
    offsetYAmp: 0.8,
    freq: 2.0,
    phasePerRow: 0.4,
    depthWeighted: false,
  },
  idle_alt: {
    shiftXAmp: 0.2,
    offsetYAmp: 0.3,
    freq: 0.6,
    phasePerRow: 0.12,
    depthWeighted: true,
  },
};

/** Default profile for states without specific animation */
export const DEFAULT_WIGGLE: WiggleProfile = WIGGLE_PROFILES['idle'];

/**
 * Calculate per-row offsets for a given profile at time t.
 * Returns an array of {shiftX, offsetY} for each row.
 */
export function calculateRowOffsets(
  profile: WiggleProfile,
  rowCount: number,
  t: number,
): Array<{ shiftX: number; offsetY: number }> {
  const rows: Array<{ shiftX: number; offsetY: number }> = [];

  for (let row = 0; row < rowCount; row++) {
    const depthFactor = profile.depthWeighted
      ? (rowCount - row) / rowCount
      : 1.0;

    const phase = t * profile.freq * Math.PI * 2 + row * profile.phasePerRow;

    const shiftX = Math.sin(phase) * profile.shiftXAmp * depthFactor;
    const offsetY = Math.cos(phase * 0.7) * profile.offsetYAmp * depthFactor;

    rows.push({ shiftX, offsetY });
  }

  return rows;
}
