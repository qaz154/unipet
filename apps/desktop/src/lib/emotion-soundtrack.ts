/**
 * Emotion Soundtrack — real-time ambient music driven by the pet's emotional state.
 *
 * Uses Web Audio API to synthesize ambient music that responds to the
 * pet's PAD (Valence/Arousal/Dominance) emotion vector. No pre-recorded
 * audio files needed — everything is generated in real-time.
 *
 * Design:
 * - Valence → major/minor tonality (happy vs. sad)
 * - Arousal → tempo and rhythm density (calm vs. energetic)
 * - Dominance → volume and filter brightness (submissive vs. dominant)
 *
 * Runs in the Electron renderer process.
 */

import type { EmotionVector } from '@unipet/core';

export interface SoundtrackConfig {
  /** Master volume 0-1 (default: 0.3) */
  masterVolume: number;
  /** Whether the soundtrack is enabled */
  enabled: boolean;
}

const DEFAULT_CONFIG: SoundtrackConfig = {
  masterVolume: 0.3,
  enabled: false,
};

// Musical scales (frequencies in Hz)
const MAJOR_SCALE = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88]; // C4 major
const MINOR_SCALE = [261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 466.16]; // C4 minor
const PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00]; // C4 pentatonic (neutral)

export class EmotionSoundtrack {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private config: SoundtrackConfig;
  private currentEmotion: EmotionVector = { valence: 0, arousal: 0, dominance: 0 };
  private running = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private oscillators: OscillatorNode[] = [];

  constructor(config: Partial<SoundtrackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Initialize the audio context (must be called from a user gesture) */
  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.config.masterVolume;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 800;
    this.filter.Q.value = 1;

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  /** Start the ambient soundtrack loop */
  start(): void {
    if (this.running || !this.config.enabled) return;
    this.init();
    this.running = true;
    this.tick();
    this.tickTimer = setInterval(() => this.tick(), 2000);
  }

  /** Stop all audio */
  stop(): void {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.stopOscillators();
  }

  /** Update the emotional state (call this when emotion changes) */
  setEmotion(emotion: EmotionVector): void {
    this.currentEmotion = emotion;
    if (this.running) this.updateAudioParams();
  }

  /** Set master volume */
  setVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.config.masterVolume, this.ctx!.currentTime, 0.1);
    }
  }

  /** Enable or disable the soundtrack */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled && !this.running) this.start();
    if (!enabled && this.running) this.stop();
  }

  /** Clean up all resources */
  destroy(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  // ─── Private ────────────────────────────────────────────

  private tick(): void {
    if (!this.running || !this.ctx || !this.filter) return;
    this.stopOscillators();
    this.playAmbientChord();
  }

  private playAmbientChord(): void {
    if (!this.ctx || !this.filter) return;

    const { valence, arousal } = this.currentEmotion;
    const scale = valence >= 0.2 ? MAJOR_SCALE : valence <= -0.2 ? MINOR_SCALE : PENTATONIC;

    // Pick 2-3 notes from the scale
    const numNotes = arousal > 0.3 ? 3 : 2;
    const notes: number[] = [];
    for (let i = 0; i < numNotes; i++) {
      const idx = Math.floor(Math.random() * scale.length);
      notes.push(scale[idx]!);
    }

    const now = this.ctx.currentTime;
    const duration = 3 + (1 - Math.abs(arousal)) * 4; // 3-7 seconds

    for (const freq of notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      // Add slight detune for warmth
      osc.detune.value = (Math.random() - 0.5) * 10;

      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.08, now, 0.5);
      gain.gain.setTargetAtTime(0, now + duration * 0.7, 0.5);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(now);
      osc.stop(now + duration);

      this.oscillators.push(osc);
    }
  }

  private stopOscillators(): void {
    for (const osc of this.oscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.oscillators = [];
  }

  private updateAudioParams(): void {
    if (!this.filter || !this.ctx) return;

    const { arousal, dominance } = this.currentEmotion;

    // Arousal → filter cutoff (calm = dark, energetic = bright)
    const cutoff = 400 + arousal * 1200;
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.3);

    // Dominance → volume (submissive = quiet, dominant = loud)
    const volume = this.config.masterVolume * (0.5 + dominance * 0.5);
    this.masterGain?.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.3);
  }
}
