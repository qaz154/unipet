/**
 * Renderer Plugin Interface
 *
 * All rendering backends implement this interface.
 * Inspired by qq-slime-pet's canvas rendering, clawd-on-desk's SVG system,
 * and openpets' spritesheet animation.
 */

import type { PetState, EmotionVector } from '@unipet/core';

export interface RendererConfig {
  /** Base scale factor */
  scale: number;
  /** Window opacity */
  opacity: number;
}

export interface TransitionOptions {
  /** Cross-fade duration (ms) */
  duration?: number;
  /** Easing function */
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface HitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RendererPlugin {
  /** Unique renderer identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** What asset formats this renderer uses */
  readonly supportedFormats: readonly string[];

  /** Initialize the renderer in the given container */
  init(container: HTMLElement, config: RendererConfig): Promise<void>;

  /** Switch to a new pet state animation */
  setState(state: PetState, options?: TransitionOptions): Promise<void>;

  /** Apply emotion vector to visual parameters */
  setEmotion(emotion: EmotionVector): void;

  /** Show or hide the pet */
  setVisible(visible: boolean): void;

  /** Set scale factor */
  setScale(scale: number): void;

  /** Set opacity */
  setOpacity(opacity: number): void;

  /** Update animation frame (called every frame for custom animators) */
  update(dt: number): void;

  /** Get clickable hit boxes */
  getHitBoxes(): readonly HitBox[];

  /** Destroy and clean up */
  destroy(): void;
}
