/**
 * SVG Renderer
 *
 * Renders a pet using SVG files with SMIL/CSS animations.
 * Ported from clawd-on-desk's renderer.js with simplifications.
 *
 * Features:
 * - SVG file swapping per state
 * - Eye tracking (mouse-follow for idle states)
 * - Cross-fade transitions between states (cancellable)
 * - Honors initial scale/opacity from RendererConfig
 */

import type { PetState, EmotionVector } from '@unipet/core';
import type { RendererPlugin, RendererConfig, TransitionOptions, HitBox } from '../renderer.js';

export interface SVGConfig {
  /** State → SVG file(s) mapping */
  stateFiles: Record<string, string[]>;
  /** ViewBox for the SVG canvas */
  viewBox?: string;
  /** Whether to use <object> or <img> tag */
  renderMode?: 'object' | 'img';
  /** Eye tracking config */
  eyeTracking?: {
    /** CSS selector for eye element */
    eyeSelector: string;
    /** States that support eye tracking */
    states: string[];
    /** Max eye movement in SVG units */
    maxOffset: number;
  };
  /** Optional RNG for deterministic variant selection (defaults to Math.random) */
  rng?: () => number;
}

export class SVGRenderer implements RendererPlugin {
  readonly id = 'svg';
  readonly name = 'SVG Renderer';
  readonly supportedFormats = ['svg', 'gif', 'apng', 'webp', 'png'];

  private wrapper!: HTMLElement;
  private currentElement: HTMLElement | undefined;
  private svgConfig!: SVGConfig;
  private rng: () => number = Math.random;
  // Track active fade timers so destroy() / re-entrant setState can cancel
  // them — otherwise mid-fade unmount or rapid state churn leaks setTimeouts
  // that resolve into orphaned DOM nodes.
  private pendingFades = new Set<ReturnType<typeof setTimeout>>();
  private destroyed = false;

  private currentState: PetState = 'idle';
  private mouseX = 0;
  private mouseY = 0;
  private eyeTrackingEnabled = false;

  async init(
    container: HTMLElement,
    config: RendererConfig,
    svgConfig?: SVGConfig,
  ): Promise<void> {
    this.svgConfig = svgConfig ?? { stateFiles: {} };
    if (this.svgConfig.rng) this.rng = this.svgConfig.rng;

    // Create wrapper for eye tracking transforms
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'unipet-svg-wrapper';
    this.wrapper.style.position = 'relative';
    this.wrapper.style.width = '100%';
    this.wrapper.style.height = '100%';

    // Inject emotion-driven animation keyframes (guarded for test/SSR envs)
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function' && document.head) {
      if (!document.getElementById('unipet-svg-styles')) {
        const style = document.createElement('style');
        style.id = 'unipet-svg-styles';
        style.textContent = '@keyframes unipet-pulse{from{scale:1}to{scale:1.04}}';
        document.head.appendChild(style);
      }
    }
    container.appendChild(this.wrapper);

    // Apply initial config — previously these were silently dropped, leaving
    // callers to do an extra setScale/setOpacity round-trip after init().
    if (typeof config.scale === 'number') this.setScale(config.scale);
    if (typeof config.opacity === 'number') this.setOpacity(config.opacity);

    // Set up mouse tracking for eye follow
    if (this.svgConfig.eyeTracking) {
      document.addEventListener('mousemove', this.handleMouseMove);
      this.eyeTrackingEnabled = true;
    }
  }

  async setState(state: PetState, options?: TransitionOptions): Promise<void> {
    this.currentState = state;
    const files = this.svgConfig.stateFiles[state];
    if (!files || files.length === 0) return;

    // Pick a variant — deterministic when an RNG was injected (for tests).
    const file = files[Math.floor(this.rng() * files.length)];

    await this.swapVisual(file, options);
    this.updateEyeTracking();
  }

  setEmotion(emotion: EmotionVector): void {
    const { valence, arousal, dominance } = emotion;
    const filters: string[] = [];
    // Red tint for negative valence, green for positive
    if (valence < -0.3) filters.push('hue-rotate(-20deg)');
    else if (valence > 0.3) filters.push('hue-rotate(20deg)');
    // Excited → slight scale pulse via CSS animation
    if (arousal > 0.7) {
      this.wrapper.style.animation = 'unipet-pulse 0.6s ease-in-out infinite alternate';
    } else {
      this.wrapper.style.animation = '';
    }
    // Submissive → slight transparency
    if (dominance < 0.3) this.wrapper.style.opacity = '0.85';
    else this.wrapper.style.opacity = '';
    // Apply combined filters
    this.wrapper.style.filter = filters.join(' ') || '';
  }

  setVisible(vis: boolean): void {
    this.wrapper.style.display = vis ? 'block' : 'none';
  }

  setScale(scale: number): void {
    this.wrapper.style.transform = `scale(${scale})`;
    this.wrapper.style.transformOrigin = 'center bottom';
  }

  setOpacity(opacity: number): void {
    this.wrapper.style.opacity = String(opacity);
  }

  update(_dt: number): void {
    // SVG animations are declarative (SMIL/CSS), no per-frame update needed
    this.updateEyeTracking();
  }

  getHitBoxes(): readonly HitBox[] {
    // Return a viewport-relative hitbox so callers can use the value directly
    // against pointer coords. The previous {x:0, y:0} was wrong for any wrapper
    // not anchored at the viewport origin.
    const rect = this.wrapper.getBoundingClientRect();
    return [{
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }];
  }

  destroy(): void {
    this.destroyed = true;
    if (this.eyeTrackingEnabled) {
      document.removeEventListener('mousemove', this.handleMouseMove);
    }
    // Cancel any in-flight fade timers so they don't resolve after teardown.
    for (const t of this.pendingFades) clearTimeout(t);
    this.pendingFades.clear();
    this.wrapper.remove();
  }

  // ─── Private ──────────────────────────────────────────────

  private handleMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private async swapVisual(file: string, options?: TransitionOptions): Promise<void> {
    if (this.destroyed) return;
    const duration = options?.duration ?? 300;

    const newElement = this.createElement(file);

    if (this.currentElement && duration > 0) {
      // Cross-fade. Remember which element we're fading *out* — if another
      // setState() races us, we should drop the stale fade and remove our
      // outgoing element before the new one starts.
      const outgoing = this.currentElement;
      newElement.style.opacity = '0';
      this.wrapper.appendChild(newElement);

      await this.fadeIn(newElement, duration);
      // After fade, ensure outgoing is still in the DOM and remove it.
      // If destroy() ran during the wait, exit early.
      if (this.destroyed) return;
      if (outgoing.parentNode) outgoing.remove();
    } else {
      if (this.currentElement) this.currentElement.remove();
      this.wrapper.appendChild(newElement);
    }

    this.currentElement = newElement;
  }

  private createElement(file: string): HTMLElement {
    const ext = file.split('.').pop()?.toLowerCase();

    if (ext === 'svg') {
      const obj = document.createElement('object');
      obj.data = file;
      obj.type = 'image/svg+xml';
      obj.style.width = '100%';
      obj.style.height = '100%';
      obj.style.pointerEvents = 'none';
      return obj;
    }

    if (ext === 'gif' || ext === 'apng' || ext === 'webp' || ext === 'png') {
      const img = document.createElement('img');
      img.src = file;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.pointerEvents = 'none';
      return img;
    }

    // Fallback: try as image
    const img = document.createElement('img');
    img.src = file;
    img.style.width = '100%';
    img.style.height = '100%';
    return img;
  }

  private fadeIn(element: HTMLElement, duration: number): Promise<void> {
    return new Promise((resolve) => {
      element.style.transition = `opacity ${duration}ms ease-in-out`;
      requestAnimationFrame(() => {
        element.style.opacity = '1';
        const handle = setTimeout(() => {
          this.pendingFades.delete(handle);
          resolve();
        }, duration);
        this.pendingFades.add(handle);
      });
    });
  }

  private updateEyeTracking(): void {
    if (!this.eyeTrackingEnabled || !this.svgConfig.eyeTracking) return;

    const tracking = this.svgConfig.eyeTracking;
    if (!tracking.states.includes(this.currentState)) return;

    const rect = this.wrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Use the wrapper's own size as the divisor — multi-monitor / virtual
    // screens make window.innerWidth a poor proxy for "how far the eye should
    // travel per pixel of mouse movement".
    const halfW = Math.max(1, rect.width / 2 + 200);
    const halfH = Math.max(1, rect.height / 2 + 200);
    const dx = (this.mouseX - centerX) / halfW;
    const dy = (this.mouseY - centerY) / halfH;

    const clampedX = Math.max(-1, Math.min(1, dx)) * tracking.maxOffset;
    const clampedY = Math.max(-1, Math.min(1, dy)) * tracking.maxOffset;

    // Apply transform to SVG eye element
    const obj = this.currentElement;
    if (obj && obj instanceof HTMLObjectElement) {
      try {
        const svgDoc = obj.contentDocument;
        if (!svgDoc) return;
        const eye = svgDoc.querySelector(tracking.eyeSelector);
        if (eye) {
          (eye as SVGElement).style.transform = `translate(${clampedX}px, ${clampedY}px)`;
        }
      } catch {
        // Cross-origin or not loaded yet
      }
    }
  }
}
