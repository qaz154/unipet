/**
 * Voice Companion — speech recognition + synthesis for pet interaction.
 *
 * Allows users to speak to the pet and receive voice responses.
 * Uses the Web Speech API (SpeechRecognition + SpeechSynthesis)
 * which is available in Electron's Chromium renderer.
 *
 * Features:
 * - Wake-word detection ("Hey UniPet")
 * - Command parsing (git summary, state change, etc.)
 * - Voice responses with personality
 * - Continuous or push-to-talk modes
 */

export type VoiceCommand =
  | { type: 'status' }
  | { type: 'git-summary' }
  | { type: 'set-state'; state: string }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'unknown'; transcript: string };

// Web Speech API type declarations for Electron renderer
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

export interface VoiceCompanionConfig {
  /** Enable voice recognition */
  enabled: boolean;
  /** Wake word to activate listening (default: "hey unipet") */
  wakeWord: string;
  /** Language for recognition (default: "en-US") */
  language: string;
  /** Enable voice responses */
  speakResponses: boolean;
  /** Voice pitch 0-2 (default: 1.2 — slightly higher for pet-like voice) */
  pitch: number;
  /** Speech rate 0.1-10 (default: 1) */
  rate: number;
}

const DEFAULT_CONFIG: VoiceCompanionConfig = {
  enabled: false,
  wakeWord: 'hey unipet',
  language: 'en-US',
  speakResponses: true,
  pitch: 1.2,
  rate: 1,
};

const COMMAND_PATTERNS: Array<{ pattern: RegExp; parse: (match: RegExpMatchArray) => VoiceCommand }> = [
  { pattern: /what('?s| is) (the )?status/i, parse: () => ({ type: 'status' }) },
  { pattern: /how (are you|do you feel)/i, parse: () => ({ type: 'status' }) },
  { pattern: /git (summary|log|history)/i, parse: () => ({ type: 'git-summary' }) },
  { pattern: /what did i (do|commit)/i, parse: () => ({ type: 'git-summary' }) },
  { pattern: /(go to|set|switch to) (\w+)/i, parse: (m) => ({ type: 'set-state', state: m[2]!.toLowerCase() }) },
  { pattern: /(sleep|go to sleep|take a nap)/i, parse: () => ({ type: 'sleep' }) },
  { pattern: /(wake up|good morning|hello)/i, parse: () => ({ type: 'wake' }) },
];

export type VoiceListener = (command: VoiceCommand) => void;
export type TranscriptListener = (transcript: string, isFinal: boolean) => void;

export class VoiceCompanion {
  private config: VoiceCompanionConfig;
  private recognition: SpeechRecognition | null = null;
  private commandListeners: VoiceListener[] = [];
  private transcriptListeners: TranscriptListener[] = [];
  private listening = false;
  private wakeWordDetected = false;

  constructor(config: Partial<VoiceCompanionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Check if speech recognition is available in this environment */
  static isSupported(): boolean {
    return typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }

  /** Start listening for voice commands */
  start(): void {
    if (!VoiceCompanion.isSupported() || !this.config.enabled) return;

    const SpeechRecognitionCtor =
      (window as unknown as Record<string, unknown>)['SpeechRecognition'] as SpeechRecognitionConstructor | undefined ??
      (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] as SpeechRecognitionConstructor | undefined;

    if (!SpeechRecognitionCtor) return;

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.config.language;

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const transcript = result[0]!.transcript.trim().toLowerCase();
        const isFinal = result.isFinal;

        this.emitTranscript(transcript, isFinal);

        if (isFinal) {
          this.processTranscript(transcript);
        }
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[VoiceCompanion] Recognition error:', event.error);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (this.listening) {
        try { this.recognition?.start(); } catch { /* ignore */ }
      }
    };

    try {
      this.recognition.start();
      this.listening = true;
    } catch {
      console.warn('[VoiceCompanion] Failed to start recognition');
    }
  }

  /** Stop listening */
  stop(): void {
    this.listening = false;
    this.wakeWordDetected = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
  }

  /** Speak a response using the browser's TTS */
  speak(text: string): void {
    if (!this.config.speakResponses || typeof window === 'undefined' || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = this.config.pitch;
    utterance.rate = this.config.rate;
    utterance.lang = this.config.language;

    // Try to find a friendly voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Female'))
    );
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  }

  /** Parse a voice command from transcript text */
  parseCommand(text: string): VoiceCommand {
    for (const { pattern, parse } of COMMAND_PATTERNS) {
      const match = text.match(pattern);
      if (match) return parse(match);
    }
    return { type: 'unknown', transcript: text };
  }

  /** Register a listener for parsed voice commands */
  onCommand(listener: VoiceListener): () => void {
    this.commandListeners.push(listener);
    return () => {
      this.commandListeners = this.commandListeners.filter((l) => l !== listener);
    };
  }

  /** Register a listener for raw transcripts */
  onTranscript(listener: TranscriptListener): () => void {
    this.transcriptListeners.push(listener);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((l) => l !== listener);
    };
  }

  /** Update config */
  updateConfig(config: Partial<VoiceCompanionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Clean up */
  destroy(): void {
    this.stop();
    this.commandListeners = [];
    this.transcriptListeners = [];
  }

  // ─── Private ────────────────────────────────────────────

  private processTranscript(transcript: string): void {
    // Check for wake word
    if (!this.wakeWordDetected) {
      if (transcript.includes(this.config.wakeWord)) {
        this.wakeWordDetected = true;
        this.speak("Yes?");
        return;
      }
      // If no wake word required, process directly
    }

    const command = this.parseCommand(transcript);
    this.wakeWordDetected = false;

    for (const listener of this.commandListeners) {
      listener(command);
    }
  }

  private emitTranscript(transcript: string, isFinal: boolean): void {
    for (const listener of this.transcriptListeners) {
      listener(transcript, isFinal);
    }
  }
}
