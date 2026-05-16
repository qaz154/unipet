/**
 * Bubble Manager
 *
 * Manages speech/notification/permission bubbles.
 * Sanitizes messages, enforces length limits, applies cooldowns.
 * Inspired by openpets' message sanitization and clawd-on-desk's bubble policy.
 */

import type { EventBus } from './event-bus.js';
import { SPEECH_MAX_LENGTH } from './constants.js';

export type BubbleKind = 'speech' | 'notification' | 'permission' | 'update';

export interface Bubble {
  id: string;
  kind: BubbleKind;
  text: string;
  source: string;
  createdAt: number;
  expiresAt: number | null;
  dismissed: boolean;
}

export interface BubbleManagerConfig {
  /** Max speech message length */
  maxSpeechLength?: number;
  /** Auto-close duration for notifications (ms, 0 = manual) */
  notificationDurationMs?: number;
  /** Auto-close duration for permission bubbles (ms, 0 = manual) */
  permissionDurationMs?: number;
  /** Auto-close duration for update bubbles (ms) */
  updateDurationMs?: number;
  /** Cooldown between speech events from same source (ms) */
  speechCooldownMs?: number;
  /** Max concurrent bubbles */
  maxBubbles?: number;
}

const DEFAULT_CONFIG: Required<BubbleManagerConfig> = {
  maxSpeechLength: SPEECH_MAX_LENGTH,
  notificationDurationMs: 3000,
  permissionDurationMs: 0,
  updateDurationMs: 9000,
  speechCooldownMs: 5000,
  maxBubbles: 5,
};

/**
 * Patterns to redact in agent messages.
 *
 * Each entry has a descriptive label so the replacement says `[secret]` /
 * `[url]` / `[path]` rather than collapsing every match to the same opaque
 * `[redacted]` token. The patterns use the `g` flag so multiple occurrences
 * within one message are all caught — previously only the first match per
 * pattern was replaced.
 */
const REJECTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // Secrets — try to redact only the value to keep the surrounding context readable.
  {
    pattern: /(api[_-]?key|secret|password|token)(\s*[:=]\s*)(\S+)/gi,
    replacement: '$1$2[secret]',
  },
  // base64 blobs — likely accidental dump of binary / private key material
  { pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, replacement: '[base64]' },
  // Long code blocks
  { pattern: /`[^`\n]{20,}`/g, replacement: '`[code]`' },
  // URLs
  { pattern: /https?:\/\/\S+/g, replacement: '[url]' },
  // Windows file paths (C:\foo\bar)
  {
    pattern: /\b[A-Za-z]:[\\/](?:[A-Za-z0-9_.\-一-鿿 ]+[\\/])+[A-Za-z0-9_.\-一-鿿 ]+/g,
    replacement: '[path]',
  },
  // UNC paths (\\server\share)
  { pattern: /\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_.\-\\ ]+/g, replacement: '[path]' },
  // Unix file paths — placed last so a /foo/bar prefix inside a URL doesn't
  // double-redact after the URL pattern already collapsed it.
  { pattern: /(?:\/[a-zA-Z0-9_.-]+){2,}\/[a-zA-Z0-9_.-]+/g, replacement: '[path]' },
];

// Backward-compat: callers (and tests) that imported the previous flat array
// still get an array of RegExp. Tagged with `g` flag for multi-match.
export const REJECTED_PATTERNS: readonly RegExp[] = REJECTION_RULES.map((r) => r.pattern);

/**
 * Pure sanitizer suitable for callers outside BubbleManager (e.g. the HTTP
 * server which forwards directly to the renderer). Returns `null` when the
 * input is empty after trimming. Long input is truncated with an ellipsis.
 *
 * NOTE: this collapses newlines and runs of whitespace into single spaces.
 */
export function sanitizeBubbleText(text: string, maxLength = SPEECH_MAX_LENGTH): string | null {
  if (typeof text !== 'string') return null;
  let cleaned = text.trim();
  if (cleaned.length === 0) return null;

  for (const { pattern, replacement } of REJECTION_RULES) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  cleaned = cleaned.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 1) + '…';
  }

  return cleaned.length > 0 ? cleaned : null;
}

export type BubbleListener = (bubble: Bubble) => void;

export class BubbleManager {
  private readonly bubbles = new Map<string, Bubble>();
  private readonly cooldowns = new Map<string, number>();
  private readonly config: Required<BubbleManagerConfig>;
  private readonly listeners: BubbleListener[] = [];
  private idCounter = 0;

  constructor(
    private readonly bus: EventBus,
    config?: BubbleManagerConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupSubscriptions();
  }

  /** All active bubbles */
  get activeBubbles(): readonly Bubble[] {
    return [...this.bubbles.values()].filter((b) => !b.dismissed);
  }

  /** Register a bubble listener */
  onBubble(listener: BubbleListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /** Add a speech bubble from an event */
  addSpeech(source: string, text: string): Bubble | null {
    if (!this.checkCooldown(source)) return null;

    const sanitized = this.sanitize(text);
    if (!sanitized) return null;

    const bubble = this.createBubble('speech', sanitized, source, this.config.speechCooldownMs);
    return bubble;
  }

  /** Add a notification bubble */
  addNotification(text: string, source: string): Bubble {
    return this.createBubble('notification', text, source, this.config.notificationDurationMs);
  }

  /** Add a permission bubble (manual dismiss) */
  addPermission(text: string, source: string): Bubble {
    return this.createBubble('permission', text, source, this.config.permissionDurationMs);
  }

  /** Dismiss a bubble by id */
  dismiss(id: string): void {
    const bubble = this.bubbles.get(id);
    if (bubble) {
      bubble.dismissed = true;
      this.bubbles.delete(id);
    }
  }

  /** Dismiss all bubbles */
  dismissAll(): void {
    for (const bubble of this.bubbles.values()) {
      bubble.dismissed = true;
    }
    this.bubbles.clear();
  }

  /** Clean expired bubbles */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, bubble] of this.bubbles) {
      if (bubble.expiresAt !== null && now > bubble.expiresAt) {
        this.dismiss(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  // ─── Private ──────────────────────────────────────────────

  private setupSubscriptions(): void {
    this.bus.on((event) => {
      if (event.type === 'speech' && event.message) {
        this.addSpeech(event.source, event.message);
      }
    });
  }

  private createBubble(
    kind: BubbleKind,
    text: string,
    source: string,
    durationMs: number,
  ): Bubble {
    // Enforce max bubbles
    if (this.bubbles.size >= this.config.maxBubbles) {
      const oldest = this.bubbles.values().next().value;
      if (oldest) this.dismiss(oldest.id);
    }

    const now = Date.now();
    const bubble: Bubble = {
      id: `bubble-${++this.idCounter}`,
      kind,
      text: text.slice(0, this.config.maxSpeechLength),
      source,
      createdAt: now,
      expiresAt: durationMs > 0 ? now + durationMs : null,
      dismissed: false,
    };

    this.bubbles.set(bubble.id, bubble);

    // Notify listeners
    for (const listener of this.listeners) {
      listener(bubble);
    }

    return bubble;
  }

  private checkCooldown(source: string): boolean {
    const now = Date.now();
    const last = this.cooldowns.get(source) ?? 0;
    if (now - last < this.config.speechCooldownMs) return false;
    this.cooldowns.set(source, now);
    return true;
  }

  private sanitize(text: string): string | null {
    return sanitizeBubbleText(text, this.config.maxSpeechLength);
  }
}
