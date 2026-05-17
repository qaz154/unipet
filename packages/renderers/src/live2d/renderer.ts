/**
 * Live2D Renderer — placeholder stub
 *
 * Live2D rendering is not yet implemented. When a theme with
 * `renderer: 'live2d'` is selected, this stub shows a fallback
 * message so the pet window does not appear empty.
 */

import type { PetState, EmotionVector } from '@unipet/core';
import type { RendererPlugin, RendererConfig, TransitionOptions, HitBox } from '../renderer.js';

export interface Live2DConfig {
  modelFile: string;
  modelConfig: string;
  parameterMap?: Record<string, unknown>;
}

export class Live2DRenderer implements RendererPlugin {
  readonly id = 'live2d';
  readonly name = 'Live2D Renderer';
  readonly supportedFormats = ['live2d', 'moc3', 'model3'];

  private wrapper!: HTMLDivElement;

  async init(
    container: HTMLElement,
    config: RendererConfig,
    _config?: Live2DConfig,
  ): Promise<void> {
    this.wrapper = document.createElement('div');
    this.wrapper.style.width = `${256 * config.scale}px`;
    this.wrapper.style.height = `${256 * config.scale}px`;
    this.wrapper.style.display = 'flex';
    this.wrapper.style.alignItems = 'center';
    this.wrapper.style.justifyContent = 'center';
    this.wrapper.style.color = '#888';
    this.wrapper.style.fontSize = '12px';
    this.wrapper.style.fontFamily = 'sans-serif';
    this.wrapper.textContent = 'Live2D coming soon';
    container.appendChild(this.wrapper);
    console.warn('[unipet/live2d] Live2D renderer not yet implemented — showing placeholder');
  }

  async setState(_state: PetState, _options?: TransitionOptions): Promise<void> {}
  setEmotion(_emotion: EmotionVector): void {}
  setVisible(vis: boolean): void { this.wrapper.style.display = vis ? 'flex' : 'none'; }
  setScale(scale: number): void { this.wrapper.style.transform = `scale(${scale})`; }
  setOpacity(opacity: number): void { this.wrapper.style.opacity = String(opacity); }
  update(_dt: number): void {}
  getHitBoxes(): readonly HitBox[] { return [{ x: 0, y: 0, width: 256, height: 256 }]; }
  destroy(): void { this.wrapper.remove(); }
}
