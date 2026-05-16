/**
 * Sprite renderer tests
 *
 * Focuses on the public API contract:
 * - The `id` matches the directory ('sprite', not the old 'spritesheet').
 * - The default state-row table covers the externally-allowed states that
 *   ship with spritesheet themes.
 * - setScale re-applies imageSmoothingEnabled (the canvas resize wipes context state).
 * - DEFAULT_SPRITE_STATE_ROWS shape is sane.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpriteRenderer, DEFAULT_SPRITE_STATE_ROWS } from './renderer.js';

interface StubCanvasContext {
  imageSmoothingEnabled: boolean;
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

function makeCanvasStub() {
  const ctx: StubCanvasContext = {
    imageSmoothingEnabled: true, // start truthy — the renderer must flip it false
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: vi.fn(() => ctx),
    remove: vi.fn(),
  };
  return { canvas, ctx };
}

let lastCanvas: ReturnType<typeof makeCanvasStub> | null = null;

beforeEach(() => {
  lastCanvas = null;
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`Unexpected createElement(${tag})`);
      lastCanvas = makeCanvasStub();
      return lastCanvas.canvas;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SpriteRenderer', () => {
  it('id is "sprite" so it matches the directory and registry convention', () => {
    const r = new SpriteRenderer();
    expect(r.id).toBe('sprite');
  });

  it('DEFAULT_SPRITE_STATE_ROWS covers core behavior states', () => {
    const keys = Object.keys(DEFAULT_SPRITE_STATE_ROWS);
    // Spot-check: any sprite theme without these is missing must-have animations.
    for (const required of ['idle', 'working', 'thinking', 'error', 'attention']) {
      expect(keys).toContain(required);
    }
    // Frame counts > 0 and frameRate > 0
    for (const [name, row] of Object.entries(DEFAULT_SPRITE_STATE_ROWS)) {
      expect(row.frames, `${name}.frames`).toBeGreaterThan(0);
      expect(row.frameRate, `${name}.frameRate`).toBeGreaterThan(0);
      expect(row.row, `${name}.row`).toBeGreaterThanOrEqual(0);
    }
  });

  it('init() disables imageSmoothingEnabled on the canvas context', async () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const r = new SpriteRenderer();
    await r.init(container, { scale: 1, opacity: 1 }, {
      imageUrl: '', // intentionally skip image load
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 9,
      stateRows: DEFAULT_SPRITE_STATE_ROWS,
    });
    expect(lastCanvas!.ctx.imageSmoothingEnabled).toBe(false);
  });

  it('setScale() rewrites canvas size AND re-disables imageSmoothing', async () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const r = new SpriteRenderer();
    await r.init(container, { scale: 1, opacity: 1 }, {
      imageUrl: '',
      frameWidth: 100,
      frameHeight: 100,
      columns: 8,
      rows: 9,
      stateRows: DEFAULT_SPRITE_STATE_ROWS,
    });
    // Simulate a browser quirk: canvas resize wipes context state
    lastCanvas!.ctx.imageSmoothingEnabled = true;
    r.setScale(2);
    expect(lastCanvas!.canvas.width).toBe(200);
    expect(lastCanvas!.canvas.height).toBe(200);
    expect(lastCanvas!.ctx.imageSmoothingEnabled).toBe(false);
  });
});
