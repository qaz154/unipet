/**
 * Sound effect synthesizer — generates tones from recipes.
 * Supports volume control and per-source cooldown.
 */

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth';

interface SoundRecipe {
  freq: number;
  duration: number;
  type: OscType;
  volume?: number;
}

export interface SoundSet {
  [key: string]: SoundRecipe[];
}

export const DEFAULT_SOUNDS: SoundSet = {
  click: [{ freq: 660, duration: 0.06, type: 'sine', volume: 0.10 }],
  happy: [
    { freq: 523, duration: 0.12, type: 'sine' },
    { freq: 659, duration: 0.12, type: 'sine', volume: 0.08 },
  ],
  error: [{ freq: 200, duration: 0.25, type: 'sawtooth', volume: 0.10 }],
  attention: [
    { freq: 659, duration: 0.08, type: 'triangle' },
    { freq: 784, duration: 0.12, type: 'triangle', volume: 0.08 },
  ],
  notification: [{ freq: 880, duration: 0.10, type: 'sine', volume: 0.07 }],
  love: [
    { freq: 523, duration: 0.10, type: 'sine' },
    { freq: 659, duration: 0.10, type: 'sine', volume: 0.07 },
    { freq: 784, duration: 0.12, type: 'sine', volume: 0.07 },
  ],
  thinking: [{ freq: 440, duration: 0.15, type: 'sine', volume: 0.04 }],
  working: [{ freq: 330, duration: 0.08, type: 'triangle', volume: 0.05 }],
  editing: [{ freq: 550, duration: 0.06, type: 'sine', volume: 0.04 }],
  testing: [
    { freq: 392, duration: 0.06, type: 'triangle', volume: 0.05 },
    { freq: 523, duration: 0.08, type: 'triangle', volume: 0.05 },
  ],
  celebrating: [
    { freq: 523, duration: 0.08, type: 'sine', volume: 0.08 },
    { freq: 659, duration: 0.08, type: 'sine', volume: 0.08 },
    { freq: 784, duration: 0.10, type: 'sine', volume: 0.08 },
    { freq: 1047, duration: 0.15, type: 'sine', volume: 0.06 },
  ],
  sleeping: [{ freq: 220, duration: 0.30, type: 'sine', volume: 0.02 }],
};

const SOUND_COOLDOWN_MS = 800;

export function createSoundPlayer(customSounds?: Partial<SoundSet>) {
  const sounds: SoundSet = { ...DEFAULT_SOUNDS, ...(customSounds ?? {}) } as SoundSet;
  let audioCtx: AudioContext | null = null;
  let masterVolume = 1.0;
  const lastPlayed = new Map<string, number>();

  const getCtx = (): AudioContext => {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  };

  const playTone = (recipe: SoundRecipe, ctx: AudioContext, delay = 0): void => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = recipe.type;
    const vol = (recipe.volume ?? 0.08) * masterVolume;
    osc.frequency.setValueAtTime(recipe.freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + recipe.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + recipe.duration + 0.01);
  };

  return {
    play(key: string, recipes: SoundRecipe[]): void {
      if (masterVolume <= 0) return;
      const now = Date.now();
      const last = lastPlayed.get(key) || 0;
      if (now - last < SOUND_COOLDOWN_MS) return;
      lastPlayed.set(key, now);
      try {
        const ctx = getCtx();
        let delay = 0;
        for (const r of recipes) {
          playTone(r, ctx, delay);
          delay += r.duration * 0.6;
        }
      } catch { /* audio unavailable */ }
    },

    playState(state: string): void {
      if (sounds[state]) {
        this.play(state, sounds[state]);
      }
    },

    playClick(): void {
      this.play('click', sounds.click ?? DEFAULT_SOUNDS.click);
    },

    setVolume(volume: number): void {
      masterVolume = Math.max(0, Math.min(1, volume));
    },

    getVolume(): number {
      return masterVolume;
    },

    destroy(): void {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    },
  };
}
