/**
 * CSS Pixel Renderer
 *
 * Renders a pet as a pixel grid on an HTML5 Canvas.
 * Ported from qq-slime-pet's sprite.js with enhancements.
 *
 * Features:
 * - 16x16 pixel grid with customizable palette
 * - Per-row sinusoidal deformation ("jelly blob" effect)
 * - Face patches for different emotions
 * - 60fps requestAnimationFrame rendering
 * - Low-power idle pause after 5 seconds of inactivity
 */

import type { PetState, EmotionVector } from '@unipet/core';
import type { RendererPlugin, RendererConfig, TransitionOptions, HitBox } from '../renderer.js';
import {
  WIGGLE_PROFILES,
  DEFAULT_WIGGLE,
  calculateRowOffsets,
} from './wiggle-profiles.js';

export interface CSSPixelConfig {
  /** Grid size (e.g. 16 for 16x16) */
  gridSize: number;
  /** Upscale factor */
  upscale: number;
  /** Character → color palette */
  palette: Record<string, string>;
  /** Body grid (array of strings, each string = one row) */
  body: string[];
  /** Face patches per state */
  faces: Record<string, FacePatch>;
}

export interface FacePatch {
  /** Eye grid rows */
  eyes: string[];
  /** Eye position {row, col} in the body grid */
  eyePos: { row: number; col: number };
  /** Mouth grid rows (optional) */
  mouth?: string[];
  /** Mouth position */
  mouthPos?: { row: number; col: number };
}

/** Default ink-wash slime configuration (from qq-slime-pet) */
export const DEFAULT_SLIME_CONFIG: CSSPixelConfig = {
  gridSize: 16,
  upscale: 8,
  palette: {
    '.': 'transparent',
    '#': '#1a1a22',
    W: '#f8f8ff',
    M: '#9a98a2',
    L: '#3e3d48',
    R: '#9c2e24',
  },
  body: [
    '....######......',
    '...#WWWWWW#.....',
    '..#WWWWWWWW#....',
    '..#WWWWWWWW#....',
    '.#WWWWWWWWWW#...',
    '.#WWWWWWWWWW#...',
    '.#WWWWWWWWWW#...',
    '.#WWWWWWWWWW#...',
    '.#WWWWWWWWWW#...',
    '.#WWWWWWWWWW#...',
    '.#WWMMMMMMWW#...',
    '..#MMLLLMMW#....',
    '..#MMLLLMMW#....',
    '...#MLLLMW#.....',
    '....######......',
    '................',
  ],
  faces: {
    idle: {
      eyes: ['LLL', 'L.L'],
      eyePos: { row: 5, col: 5 },
      mouth: ['L...L', 'LLLLL'],
      mouthPos: { row: 8, col: 5 },
    },
    happy: {
      eyes: ['.L.', 'LLL'],
      eyePos: { row: 5, col: 5 },
      mouth: ['L....L', 'LLLLLL'],
      mouthPos: { row: 8, col: 5 },
    },
    shocked: {
      eyes: ['L.L', 'LLL', 'LLL'],
      eyePos: { row: 4, col: 5 },
      mouth: ['.L.', 'LLL', '.L.'],
      mouthPos: { row: 8, col: 6 },
    },
    angry: {
      eyes: ['L..', '.LL', 'LLL'],
      eyePos: { row: 5, col: 5 },
      mouth: ['LL....LL', '.LLLLLL.'],
      mouthPos: { row: 8, col: 4 },
    },
    sleeping: {
      eyes: ['...'],
      eyePos: { row: 5, col: 5 },
    },
    love: {
      eyes: ['R.R', 'RRR', '.R.'],
      eyePos: { row: 5, col: 5 },
      mouth: ['L....L', 'LLLLLL'],
      mouthPos: { row: 8, col: 5 },
    },
  },
};

export class CSSPixelRenderer implements RendererPlugin {
  readonly id = 'css-pixel';
  readonly name = 'CSS Pixel Renderer';
  readonly supportedFormats = ['pixel', 'canvas'];

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private config!: CSSPixelConfig;
  private rendererConfig!: RendererConfig;

  private currentState: PetState = 'idle';
  private animationId: number | undefined;
  private startTime = 0;
  private lastUpdateTime = 0;
  private idlePauseTimer: ReturnType<typeof setTimeout> | undefined;
  private isPaused = false;
  private visible = true;
  private currentEmotion: EmotionVector = { valence: 0, arousal: 0.1, dominance: 0.5 };

  async init(
    container: HTMLElement,
    config: RendererConfig,
    pixelConfig?: CSSPixelConfig,
    canvas?: HTMLCanvasElement,
  ): Promise<void> {
    this.rendererConfig = config;
    this.config = pixelConfig ?? DEFAULT_SLIME_CONFIG;

    const size = this.config.gridSize * this.config.upscale * config.scale;

    if (canvas) {
      this.canvas = canvas;
      this.canvas.width = this.config.gridSize;
      this.canvas.height = this.config.gridSize;
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
      this.canvas.style.imageRendering = 'pixelated';
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.config.gridSize;
      this.canvas.height = this.config.gridSize;
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
      this.canvas.style.imageRendering = 'pixelated';
      container.appendChild(this.canvas);
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.startTime = performance.now() / 1000;
    if (!canvas) this.startAnimation();
  }

  async setState(state: PetState, _options?: TransitionOptions): Promise<void> {
    this.currentState = state;
    this.resumeFromPause();
  }

  setEmotion(emotion: EmotionVector): void {
    this.currentEmotion = emotion;
  }

  setVisible(vis: boolean): void {
    this.visible = vis;
    this.canvas.style.display = vis ? 'block' : 'none';
    if (vis) this.resumeFromPause();
  }

  setScale(scale: number): void {
    const size = this.config.gridSize * this.config.upscale * scale;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  setOpacity(opacity: number): void {
    this.canvas.style.opacity = String(opacity);
  }

  update(_dt: number): void {
    // Animation is handled by requestAnimationFrame
  }

  getHitBoxes(): readonly HitBox[] {
    const size = this.config.gridSize * this.config.upscale * this.rendererConfig.scale;
    return [{ x: 0, y: 0, width: size, height: size }];
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
    if (this.idlePauseTimer) {
      clearTimeout(this.idlePauseTimer);
    }
    this.canvas.remove();
  }

  // ─── Public rendering (for external animation loops) ─────────

  getGridSize(): number { return this.config.gridSize; }

  renderFrame(time?: number): void {
    const { gridSize, palette, body, faces } = this.config;
    const t = (time ?? (performance.now() / 1000)) - this.startTime;

    // Get wiggle profile for current state
    const profile = WIGGLE_PROFILES[this.currentState] ?? DEFAULT_WIGGLE;
    const rowOffsets = calculateRowOffsets(profile, gridSize, t);

    // Clear canvas
    this.ctx.clearRect(0, 0, gridSize, gridSize);

    // Get face patch for current state
    const face = this.getFaceForState();

    // Render body rows with deformation
    for (let row = 0; row < gridSize; row++) {
      const bodyRow = body[row];
      if (!bodyRow) continue;

      const { shiftX, offsetY } = rowOffsets[row] ?? { shiftX: 0, offsetY: 0 };

      for (let col = 0; col < gridSize; col++) {
        const char = bodyRow[col];
        if (!char || char === '.') continue;

        const color = palette[char];
        if (!color || color === 'transparent') continue;

        // Apply per-row deformation
        const drawX = Math.round(col + shiftX);
        const drawY = Math.round(row + offsetY);

        if (drawX >= 0 && drawX < gridSize && drawY >= 0 && drawY < gridSize) {
          this.ctx.fillStyle = color;
          this.ctx.fillRect(drawX, drawY, 1, 1);
        }
      }

      // Render face patches at their row
      if (face) {
        this.renderFacePatch(face, row, shiftX, offsetY);
      }
    }
  }

  private renderFacePatch(
    face: FacePatch,
    currentRow: number,
    shiftX: number,
    offsetY: number,
  ): void {
    const { gridSize, palette } = this.config;

    // Render eyes
    const eyeRelRow = currentRow - face.eyePos.row;
    if (eyeRelRow >= 0 && eyeRelRow < face.eyes.length) {
      const eyeRow = face.eyes[eyeRelRow];
      if (eyeRow) {
        for (let i = 0; i < eyeRow.length; i++) {
          const char = eyeRow[i];
          if (!char || char === '.') continue;
          const color = palette[char];
          if (!color || color === 'transparent') continue;

          const drawX = Math.round(face.eyePos.col + i + shiftX);
          const drawY = Math.round(currentRow + offsetY);

          if (drawX >= 0 && drawX < gridSize && drawY >= 0 && drawY < gridSize) {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(drawX, drawY, 1, 1);
          }
        }
      }
    }

    // Render mouth
    if (face.mouth && face.mouthPos) {
      const mouthRelRow = currentRow - face.mouthPos.row;
      if (mouthRelRow >= 0 && mouthRelRow < face.mouth.length) {
        const mouthRow = face.mouth[mouthRelRow];
        if (mouthRow) {
          for (let i = 0; i < mouthRow.length; i++) {
            const char = mouthRow[i];
            if (!char || char === '.') continue;
            const color = palette[char];
            if (!color || color === 'transparent') continue;

            const drawX = Math.round(face.mouthPos.col + i + shiftX);
            const drawY = Math.round(currentRow + offsetY);

            if (drawX >= 0 && drawX < gridSize && drawY >= 0 && drawY < gridSize) {
              this.ctx.fillStyle = color;
              this.ctx.fillRect(drawX, drawY, 1, 1);
            }
          }
        }
      }
    }
  }

  private getFaceForState(): FacePatch | undefined {
    const allFaces = this.config.faces;

    // Direct state → face mapping
    if (allFaces[this.currentState]) return allFaces[this.currentState];

    // Fallback based on emotion
    const { valence, arousal } = this.currentEmotion;
    if (arousal > 0.7 && valence > 0.3) return allFaces['happy'];
    if (arousal > 0.7 && valence < -0.3) return allFaces['angry'];
    if (arousal < 0.15) return allFaces['sleeping'];
    if (valence > 0.7) return allFaces['love'];
    if (arousal > 0.8) return allFaces['shocked'];

    return allFaces['idle'];
  }

  private startAnimation(): void {
    const render = () => {
      if (!this.isPaused) this.renderFrame();
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  private resumeFromPause(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.startTime = performance.now() / 1000 - this.lastUpdateTime;
    }
    this.resetIdlePauseTimer();
  }

  private resetIdlePauseTimer(): void {
    if (this.idlePauseTimer) clearTimeout(this.idlePauseTimer);
    this.idlePauseTimer = setTimeout(() => {
      if (this.currentState === 'idle' || this.currentState === 'sleeping') {
        this.isPaused = true;
        this.lastUpdateTime = performance.now() / 1000 - this.startTime;
      }
    }, 5000);
  }
}
