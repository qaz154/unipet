import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live2DRenderer, type Live2DSdkAdapter } from './renderer.js';

interface StubCanvas {
  width: number;
  height: number;
  style: Record<string, string>;
  removed: boolean;
  getContext: (kind: string) => CanvasRenderingContext2D | null;
  remove: () => void;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
}

interface StubContainer {
  children: StubCanvas[];
  appendChild: (node: StubCanvas) => StubCanvas;
}

function makeCanvas(): StubCanvas {
  return {
    width: 0,
    height: 0,
    style: {},
    removed: false,
    getContext: (kind: string) => kind === '2d' ? makeCanvasContext() : null,
    remove() { this.removed = true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 256 }),
  };
}

function makeCanvasContext(): CanvasRenderingContext2D {
  const noop = () => undefined;
  return {
    save: noop,
    restore: noop,
    translate: noop,
    beginPath: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    arc: noop,
    clearRect: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

function makeContainer(): StubContainer {
  return {
    children: [],
    appendChild(node: StubCanvas) {
      this.children = [...this.children, node];
      return node;
    },
  };
}

describe('Live2DRenderer', () => {
  let animationFrameCallbacks: FrameRequestCallback[];
  let removeEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animationFrameCallbacks = [];
    removeEventListener = vi.fn();

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`Unexpected tag: ${tag}`);
        return makeCanvas();
      },
      addEventListener: vi.fn(),
      removeEventListener,
    });

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      animationFrameCallbacks = [...animationFrameCallbacks, cb];
      return animationFrameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a canvas and applies initial scale and opacity', async () => {
    const renderer = new Live2DRenderer();
    const container = makeContainer();

    await renderer.init(container as unknown as HTMLElement, { scale: 1.5, opacity: 0.75 }, {
      modelFile: 'avatar.moc3',
      modelConfig: 'avatar.model3.json',
    });

    expect(container.children).toHaveLength(1);
    const canvas = container.children[0]!;
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
    expect(canvas.style.transform).toBe('scale(1.5)');
    expect(canvas.style.opacity).toBe('0.75');
    expect(animationFrameCallbacks).toHaveLength(1);
  });

  it('switches state without requiring SDK assets', async () => {
    const renderer = new Live2DRenderer();
    const container = makeContainer();

    await renderer.init(container as unknown as HTMLElement, { scale: 1, opacity: 1 });
    await expect(renderer.setState('thinking')).resolves.toBeUndefined();
    await expect(renderer.setState('error')).resolves.toBeUndefined();
  });

  it('removes canvas and event listeners on destroy', async () => {
    const renderer = new Live2DRenderer();
    const container = makeContainer();

    await renderer.init(container as unknown as HTMLElement, { scale: 1, opacity: 1 });
    const canvas = container.children[0]!;

    renderer.destroy();

    expect(canvas.removed).toBe(true);
    expect(removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });

  it('delegates to SDK adapter when one is provided and preferSdk is true', async () => {
    const renderer = new Live2DRenderer();
    const container = makeContainer();
    const calls: Array<[string, unknown?]> = [];
    const adapter: Live2DSdkAdapter = {
      async init() { calls.push(['init']); },
      async setState(state) { calls.push(['setState', state]); },
      setOpacity(value) { calls.push(['setOpacity', value]); },
      setScale(value) { calls.push(['setScale', value]); },
      setVisible(value) { calls.push(['setVisible', value]); },
      destroy() { calls.push(['destroy']); },
    };

    await renderer.init(
      container as unknown as HTMLElement,
      { scale: 1, opacity: 1 },
      { modelFile: 'a.moc3', modelConfig: 'a.model3.json', preferSdk: true },
      adapter,
    );
    await renderer.setState('thinking');
    renderer.setOpacity(0.5);
    renderer.destroy();

    expect(calls.map((c) => c[0])).toContain('init');
    expect(calls.map((c) => c[0])).toContain('setState');
    expect(calls.map((c) => c[0])).toContain('setOpacity');
    expect(calls.map((c) => c[0])).toContain('destroy');
  });

  it('falls back to canvas when SDK adapter init throws', async () => {
    const renderer = new Live2DRenderer();
    const container = makeContainer();
    const adapter: Live2DSdkAdapter = {
      init: vi.fn().mockRejectedValue(new Error('sdk load failed')),
      setState: vi.fn(),
      setOpacity: vi.fn(),
      setScale: vi.fn(),
      setVisible: vi.fn(),
      destroy: vi.fn(),
    };

    await renderer.init(
      container as unknown as HTMLElement,
      { scale: 1, opacity: 1 },
      { modelFile: 'a.moc3', modelConfig: 'a.model3.json', preferSdk: true },
      adapter,
    );

    expect(container.children).toHaveLength(1);
    expect(animationFrameCallbacks).toHaveLength(1);
  });
});
