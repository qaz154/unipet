/**
 * Spritesheet Renderer
 *
 * Renders a pet from a sprite sheet image with frame-based animation.
 * Inspired by openpets' pet-window.ts spritesheet system.
 *
 * Spritesheet layout: grid of frames arranged in rows,
 * each row represents a state, columns are animation frames.
 */

import type { PetState, EmotionVector } from '@unipet/core';
import type { RendererPlugin, RendererConfig, TransitionOptions, HitBox } from '../renderer.js';

export interface SpriteConfig {
  /** Image source URL or path */
  imageUrl: string;
  /** Frame width in pixels */
  frameWidth: number;
  /** Frame height in pixels */
  frameHeight: number;
  /** Number of columns in the spritesheet */
  columns: number;
  /** Number of rows in the spritesheet */
  rows: number;
  /** State → row mapping */
  stateRows: Record<string, { row: number; frames: number; frameRate: number }>;
}

/** Default state → row mapping (from openpets) */
export const DEFAULT_SPRITE_STATE_ROWS: SpriteConfig['stateRows'] = {
  idle:          { row: 0, frames: 6, frameRate: 1.1 },
  working:       { row: 1, frames: 8, frameRate: 7.5 },
  thinking:      { row: 2, frames: 6, frameRate: 5.0 },
  waving:        { row: 3, frames: 4, frameRate: 5.7 },
  celebrating:   { row: 4, frames: 5, frameRate: 6.0 },
  error:         { row: 5, frames: 8, frameRate: 6.5 },
  waiting:       { row: 6, frames: 6, frameRate: 5.9 },
  testing:       { row: 7, frames: 6, frameRate: 7.3 },
  attention:     { row: 8, frames: 6, frameRate: 5.8 },
};

export class SpriteRenderer implements RendererPlugin {
  // id is the registry key; rename from 'spritesheet' → 'sprite' so it matches
  // the directory and convention used by the other renderers ('css-pixel', 'svg').
  // 'spritesheet' is kept as an alias via supportedFormats for asset autodetect.
  readonly id = 'sprite';
  readonly name = 'Spritesheet Renderer';
  readonly supportedFormats = ['spritesheet', 'png', 'webp'];

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private rendererConfig!: RendererConfig;
  private spriteConfig!: SpriteConfig;

  private image: HTMLImageElement | undefined;
  private currentState: PetState = 'idle';
  private currentFrame = 0;
  private frameAccumulator = 0;
  private animationId: number | undefined;
  private visible = true;

  async init(
    container: HTMLElement,
    config: RendererConfig,
    spriteConfig?: SpriteConfig,
  ): Promise<void> {
    this.rendererConfig = config;
    this.spriteConfig = spriteConfig ?? {
      imageUrl: '',
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      stateRows: DEFAULT_SPRITE_STATE_ROWS,
    };

    this.canvas = document.createElement('canvas');
    const scaledWidth = this.spriteConfig.frameWidth * config.scale;
    const scaledHeight = this.spriteConfig.frameHeight * config.scale;
    this.canvas.width = scaledWidth;
    this.canvas.height = scaledHeight;
    this.canvas.style.width = `${scaledWidth}px`;
    this.canvas.style.height = `${scaledHeight}px`;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    container.appendChild(this.canvas);

    // Load spritesheet — be loud if it's missing so callers don't end up with
    // a silently-inert canvas where update() returns early forever.
    if (this.spriteConfig.imageUrl) {
      await this.loadImage(this.spriteConfig.imageUrl);
    } else {
      console.warn('[sprite renderer] init() called without imageUrl; the renderer will be inert until setSprite() is implemented or imageUrl is provided.');
    }
  }

  async setState(state: PetState, _options?: TransitionOptions): Promise<void> {
    this.currentState = state;
    this.currentFrame = 0;
    this.frameAccumulator = 0;
  }

  setEmotion(_emotion: EmotionVector): void {
    // Spritesheet renderer doesn't use emotion vectors directly
    // State mapping handles this
  }

  setVisible(vis: boolean): void {
    this.visible = vis;
    this.canvas.style.display = vis ? 'block' : 'none';
  }

  setScale(scale: number): void {
    // Track the scale on rendererConfig so getHitBoxes stays consistent.
    this.rendererConfig.scale = scale;
    const w = this.spriteConfig.frameWidth * scale;
    const h = this.spriteConfig.frameHeight * scale;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Setting canvas.width resets all 2D context state in most browsers,
    // including imageSmoothingEnabled. Re-apply or sprites blur on rescale.
    this.ctx.imageSmoothingEnabled = false;
  }

  setOpacity(opacity: number): void {
    this.canvas.style.opacity = String(opacity);
  }

  update(dt: number): void {
    if (!this.image || !this.visible) return;

    const stateConfig = this.spriteConfig.stateRows[this.currentState];
    if (!stateConfig) return;

    this.frameAccumulator += dt;
    const frameDuration = 1000 / stateConfig.frameRate;

    if (this.frameAccumulator >= frameDuration) {
      this.frameAccumulator -= frameDuration;
      this.currentFrame = (this.currentFrame + 1) % stateConfig.frames;
    }

    this.renderFrame(stateConfig.row, this.currentFrame);
  }

  getHitBoxes(): readonly HitBox[] {
    const w = this.spriteConfig.frameWidth * this.rendererConfig.scale;
    const h = this.spriteConfig.frameHeight * this.rendererConfig.scale;
    return [{ x: 0, y: 0, width: w, height: h }];
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.canvas.remove();
  }

  // ─── Private ──────────────────────────────────────────────

  private async loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.startAnimation();
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load spritesheet: ${url}`));
      img.src = url;
    });
  }

  private startAnimation(): void {
    let lastTime = performance.now();
    const loop = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      this.update(dt);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private renderFrame(row: number, frame: number): void {
    if (!this.image) return;

    const { frameWidth, frameHeight } = this.spriteConfig;
    const scale = this.rendererConfig.scale;

    const srcX = frame * frameWidth;
    const srcY = row * frameHeight;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      this.image,
      srcX, srcY, frameWidth, frameHeight,
      0, 0, frameWidth * scale, frameHeight * scale,
    );
  }
}
