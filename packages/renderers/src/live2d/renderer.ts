/**
 * Live2D Renderer — canvas-based fallback
 *
 * When a theme specifies `renderer: 'live2d'` but the actual Live2D SDK
 * is not available, this renderer draws a simple animated pet using
 * Canvas 2D primitives. It supports eye tracking, state-based animations,
 * and smooth 60fps rendering via requestAnimationFrame.
 */

import type { PetState, EmotionVector } from '@unipet/core';
import type { RendererPlugin, RendererConfig, TransitionOptions, HitBox } from '../renderer.js';

export interface Live2DConfig {
  modelFile: string;
  modelConfig: string;
  parameterMap?: Record<string, unknown>;
}

// ─── Drawing constants ──────────────────────────────────────────

const CANVAS_SIZE = 256;

const BODY_COLOR = '#5bc0be';
const BODY_HIGHLIGHT = '#7ed6d4';
const EYE_WHITE = '#ffffff';
const IRIS_COLOR = '#2d3436';
const PUPIL_COLOR = '#000000';
const MOUTH_COLOR = '#2d3436';
const CHEEK_COLOR = '#ff9ff3';

// ─── State animation profiles ───────────────────────────────────

interface StateProfile {
  bodyColor: string;
  bobAmplitude: number;
  bobSpeed: number;
  eyeOpenness: number;
  shakeAmount: number;
  bounceAmount: number;
  bounceSpeed: number;
  swayAmount: number;
  swaySpeed: number;
  showThinkingDots: boolean;
  colorCycle: boolean;
  errorFlash: boolean;
}

const STATE_PROFILES: Record<string, StateProfile> = {
  idle: {
    bodyColor: BODY_COLOR,
    bobAmplitude: 3,
    bobSpeed: 1.5,
    eyeOpenness: 1,
    shakeAmount: 0,
    bounceAmount: 0,
    bounceSpeed: 0,
    swayAmount: 0,
    swaySpeed: 0,
    showThinkingDots: false,
    colorCycle: false,
    errorFlash: false,
  },
  thinking: {
    bodyColor: BODY_COLOR,
    bobAmplitude: 1,
    bobSpeed: 2,
    eyeOpenness: 1,
    shakeAmount: 0,
    bounceAmount: 0,
    bounceSpeed: 0,
    swayAmount: 2,
    swaySpeed: 3,
    showThinkingDots: true,
    colorCycle: false,
    errorFlash: false,
  },
  working: {
    bodyColor: BODY_COLOR,
    bobAmplitude: 2,
    bobSpeed: 4,
    eyeOpenness: 1,
    shakeAmount: 0,
    bounceAmount: 0,
    bounceSpeed: 0,
    swayAmount: 0,
    swaySpeed: 0,
    showThinkingDots: false,
    colorCycle: true,
    errorFlash: false,
  },
  error: {
    bodyColor: '#e74c3c',
    bobAmplitude: 0,
    bobSpeed: 0,
    eyeOpenness: 0.6,
    shakeAmount: 6,
    bounceAmount: 0,
    bounceSpeed: 0,
    swayAmount: 0,
    swaySpeed: 0,
    showThinkingDots: false,
    colorCycle: false,
    errorFlash: true,
  },
  happy: {
    bodyColor: '#feca57',
    bobAmplitude: 0,
    bobSpeed: 0,
    eyeOpenness: 1,
    shakeAmount: 0,
    bounceAmount: 12,
    bounceSpeed: 5,
    swayAmount: 0,
    swaySpeed: 0,
    showThinkingDots: false,
    colorCycle: false,
    errorFlash: false,
  },
  sleeping: {
    bodyColor: '#a29bfe',
    bobAmplitude: 1,
    bobSpeed: 0.5,
    eyeOpenness: 0,
    shakeAmount: 0,
    bounceAmount: 0,
    bounceSpeed: 0,
    swayAmount: 4,
    swaySpeed: 0.8,
    showThinkingDots: false,
    colorCycle: false,
    errorFlash: false,
  },
};

const DEFAULT_PROFILE: StateProfile = STATE_PROFILES.idle;

// ─── Helpers ────────────────────────────────────────────────────

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function hslFromTime(time: number): string {
  const hue = (time * 60) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

// ─── Renderer ───────────────────────────────────────────────────

export class Live2DRenderer implements RendererPlugin {
  readonly id = 'live2d';
  readonly name = 'Live2D Renderer';
  readonly supportedFormats = ['live2d', 'moc3', 'model3'] as const;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId = 0;
  private destroyed = false;

  // Animation state
  private currentState: PetState = 'idle';
  private elapsed = 0;
  private profile: StateProfile = { ...DEFAULT_PROFILE };

  // Transform
  private scale = 1;
  private opacity = 1;
  private visible = true;

  // Mouse tracking
  private mouseX = CANVAS_SIZE / 2;
  private mouseY = CANVAS_SIZE / 2;
  private onPointerMove: ((e: PointerEvent) => void) | null = null;

  async init(container: HTMLElement, config: RendererConfig): Promise<void> {
    this.scale = config.scale;
    this.opacity = config.opacity;

    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.canvas.style.display = 'block';
    this.applyStyles();

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      throw new Error('[unipet/live2d] Failed to get 2D canvas context');
    }

    container.appendChild(this.canvas);

    // Track pointer for eye-following
    this.onPointerMove = (e: PointerEvent) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    document.addEventListener('pointermove', this.onPointerMove);

    // Start render loop
    this.rafId = requestAnimationFrame(this.tick);
  }

  async setState(state: PetState, _options?: TransitionOptions): Promise<void> {
    this.currentState = state;
    this.profile = { ...(STATE_PROFILES[state] ?? DEFAULT_PROFILE) };
    this.elapsed = 0;
  }

  setEmotion(_emotion: EmotionVector): void {
    // Emotion influence can be applied to visual parameters in the future
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyStyles();
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.applyStyles();
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.applyStyles();
  }

  update(dt: number): void {
    // External update hook — advancing elapsed here as well allows
    // callers who drive the loop externally to keep animations in sync.
    this.elapsed += dt;
  }

  getHitBoxes(): readonly HitBox[] {
    return [{ x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    if (this.onPointerMove) {
      document.removeEventListener('pointermove', this.onPointerMove);
      this.onPointerMove = null;
    }

    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }

    this.ctx = null;
  }

  // ─── Private: styles ──────────────────────────────────────────

  private applyStyles(): void {
    if (!this.canvas) return;
    this.canvas.style.transform = `scale(${this.scale})`;
    this.canvas.style.transformOrigin = 'top left';
    this.canvas.style.opacity = String(this.opacity);
    this.canvas.style.display = this.visible ? 'block' : 'none';
  }

  // ─── Private: render loop ─────────────────────────────────────

  private tick = (timestamp: number): void => {
    if (this.destroyed) return;
    this.elapsed = timestamp / 1000;
    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const p = this.profile;
    const t = this.elapsed;

    // Compute transforms
    let offsetX = 0;
    let offsetY = 0;

    // Bob (idle sway)
    offsetY += Math.sin(t * p.bobSpeed) * p.bobAmplitude;

    // Bounce (happy)
    if (p.bounceAmount > 0) {
      const bounce = Math.abs(Math.sin(t * p.bounceSpeed)) * p.bounceAmount;
      offsetY -= bounce;
    }

    // Sway (sleeping, thinking)
    if (p.swayAmount > 0) {
      offsetX += Math.sin(t * p.swaySpeed) * p.swayAmount;
    }

    // Shake (error)
    if (p.shakeAmount > 0) {
      offsetX += Math.sin(t * 30) * p.shakeAmount;
    }

    ctx.save();
    ctx.translate(CANVAS_SIZE / 2 + offsetX, CANVAS_SIZE / 2 + offsetY);

    // Body color
    let bodyColor = p.bodyColor;
    if (p.colorCycle) {
      bodyColor = hslFromTime(t);
    }
    if (p.errorFlash) {
      const flash = Math.sin(t * 8) > 0;
      bodyColor = flash ? '#e74c3c' : '#ff6b6b';
    }

    // Emotion tint: shift hue slightly based on valence
    // (visual hint only — no complex color math needed)

    this.drawFeet(ctx, bodyColor);
    this.drawBody(ctx, bodyColor);
    this.drawCheeks(ctx);
    this.drawEyes(ctx, p.eyeOpenness);
    this.drawMouth(ctx, p.eyeOpenness);

    if (p.showThinkingDots) {
      this.drawThinkingDots(ctx, t);
    }

    ctx.restore();
  }

  // ─── Private: drawing primitives ──────────────────────────────

  private drawBody(ctx: CanvasRenderingContext2D, color: string): void {
    // Rounded blob body
    ctx.beginPath();
    ctx.ellipse(0, 8, 60, 52, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.ellipse(-18, -12, 18, 12, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = BODY_HIGHLIGHT;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawFeet(ctx: CanvasRenderingContext2D, color: string): void {
    const darker = lerpColor(color, '#000000', 0.15);

    // Left foot
    ctx.beginPath();
    ctx.ellipse(-22, 54, 16, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = darker;
    ctx.fill();

    // Right foot
    ctx.beginPath();
    ctx.ellipse(22, 54, 16, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = darker;
    ctx.fill();
  }

  private drawCheeks(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 0.5;

    // Left cheek
    ctx.beginPath();
    ctx.ellipse(-36, 16, 10, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = CHEEK_COLOR;
    ctx.fill();

    // Right cheek
    ctx.beginPath();
    ctx.ellipse(36, 16, 10, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = CHEEK_COLOR;
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  private drawEyes(ctx: CanvasRenderingContext2D, openness: number): void {
    const eyeY = -6;
    const eyeSpacing = 18;
    const pupilMaxOffset = 4;

    // Compute pupil offset toward mouse
    const canvasRect = this.canvas?.getBoundingClientRect();
    let pupilDx = 0;
    let pupilDy = 0;
    if (canvasRect) {
      const eyeWorldX = canvasRect.left + CANVAS_SIZE / 2 + eyeSpacing;
      const eyeWorldY = canvasRect.top + CANVAS_SIZE / 2 + eyeY;
      const dx = this.mouseX - eyeWorldX;
      const dy = this.mouseY - eyeWorldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const maxDist = 200;
        const factor = Math.min(dist / maxDist, 1);
        pupilDx = (dx / dist) * factor * pupilMaxOffset;
        pupilDy = (dy / dist) * factor * pupilMaxOffset;
      }
    }

    for (const side of [-1, 1]) {
      const ex = side * eyeSpacing;

      if (openness <= 0.05) {
        // Sleeping — draw closed eye arcs
        ctx.beginPath();
        ctx.arc(ex, eyeY, 9, 0.2, Math.PI - 0.2);
        ctx.strokeStyle = MOUTH_COLOR;
        ctx.lineWidth = 2;
        ctx.stroke();
        continue;
      }

      // Sclera
      const eyeHeight = 12 * openness;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 10, eyeHeight, 0, 0, Math.PI * 2);
      ctx.fillStyle = EYE_WHITE;
      ctx.fill();

      // Iris + pupil
      const pupilX = ex + pupilDx;
      const pupilY = eyeY + pupilDy;

      // Iris
      ctx.beginPath();
      ctx.arc(pupilX, pupilY, 5, 0, Math.PI * 2);
      ctx.fillStyle = IRIS_COLOR;
      ctx.fill();

      // Pupil
      ctx.beginPath();
      ctx.arc(pupilX, pupilY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = PUPIL_COLOR;
      ctx.fill();

      // Eye highlight
      ctx.beginPath();
      ctx.arc(pupilX - 1.5, pupilY - 2, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  private drawMouth(ctx: CanvasRenderingContext2D, eyeOpenness: number): void {
    const mouthY = 20;

    if (eyeOpenness <= 0.05) {
      // Sleeping — small 'o' mouth
      ctx.beginPath();
      ctx.arc(0, mouthY, 3, 0, Math.PI * 2);
      ctx.strokeStyle = MOUTH_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    if (this.currentState === 'happy') {
      // Big smile
      ctx.beginPath();
      ctx.arc(0, mouthY - 4, 12, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = MOUTH_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    if (this.currentState === 'error') {
      // Frown
      ctx.beginPath();
      ctx.arc(0, mouthY + 10, 10, Math.PI + 0.4, -0.4);
      ctx.strokeStyle = MOUTH_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    // Default: gentle smile
    ctx.beginPath();
    ctx.arc(0, mouthY - 2, 8, 0.3, Math.PI - 0.3);
    ctx.strokeStyle = MOUTH_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawThinkingDots(ctx: CanvasRenderingContext2D, time: number): void {
    const baseY = -55;
    const spacing = 16;

    for (let i = 0; i < 3; i++) {
      const phase = time * 3 + i * 1.2;
      const y = baseY + Math.sin(phase) * 4;
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(phase));
      const dotSize = 3 + Math.sin(phase + 1) * 1;

      ctx.beginPath();
      ctx.arc(-spacing + i * spacing, y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = MOUTH_COLOR;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}
