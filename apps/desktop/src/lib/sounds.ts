/**
 * Sound effect synthesizer — generates WAV blobs from recipes.
 * Falls back to oscillator tones when AudioContext is unavailable.
 */

type OscType = 'sine' | 'square' | 'triangle' | 'sawtooth';

interface SoundRecipe {
  freq: number;
  duration: number;
  type: OscType;
  volume?: number;
}

export interface SoundSet {
  click: SoundRecipe[];
  happy: SoundRecipe[];
  error: SoundRecipe[];
  attention: SoundRecipe[];
  notification: SoundRecipe[];
  love: SoundRecipe[];
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
};

const SOUND_COOLDOWN_MS = 5000;
let lastSoundTime = 0;

export function createSoundPlayer() {
  let audioCtx: AudioContext | null = null;

  const getCtx = (): AudioContext => {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  };

  const playTone = (recipe: SoundRecipe, ctx: AudioContext, delay = 0): void => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = recipe.type;
    const vol = recipe.volume ?? 0.08;
    osc.frequency.setValueAtTime(recipe.freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + recipe.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + recipe.duration + 0.01);
  };

  return {
    play(recipes: SoundRecipe[]): void {
      const now = Date.now();
      if (now - lastSoundTime < SOUND_COOLDOWN_MS) return;
      lastSoundTime = now;
      try {
        const ctx = getCtx();
        let delay = 0;
        for (const r of recipes) {
          playTone(r, ctx, delay);
          delay += r.duration * 0.6;
        }
      } catch { /* audio unavailable */ }
    },

    playState(state: string, sounds: SoundSet = DEFAULT_SOUNDS): void {
      const key = state as keyof SoundSet;
      if (sounds[key]) {
        this.play(sounds[key]);
      }
    },

    playClick(): void {
      this.play(DEFAULT_SOUNDS.click);
    },
  };
}
