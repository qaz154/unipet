/**
 * SVG renderer tests
 *
 * We mock just enough DOM to exercise the variant-selection / fade-cancellation
 * paths; we explicitly *don't* try to run the full SMIL pipeline since that
 * would require a real browser. Tests run in the default vitest node env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SVGRenderer } from './renderer.js';

// ─── DOM stub ─────────────────────────────────────────────

interface StubNode {
  tagName: string;
  data?: string;
  src?: string;
  type?: string;
  style: Record<string, string>;
  parentNode: StubNode | null;
  children: StubNode[];
  contentDocument?: { querySelector: (sel: string) => unknown };
  appendChild: (n: StubNode) => StubNode;
  remove: () => void;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number; right: number; bottom: number };
}

function makeNode(tagName: string): StubNode {
  const node: StubNode = {
    tagName,
    style: new Proxy({} as Record<string, string>, {
      // Ensure transform/opacity assignments persist as strings
      set(t, k, v) { t[k as string] = String(v); return true; },
      get(t, k) { return t[k as string]; },
    }),
    parentNode: null,
    children: [],
    appendChild(n) {
      n.parentNode = node;
      node.children.push(n);
      return n;
    },
    remove() {
      if (node.parentNode) {
        const i = node.parentNode.children.indexOf(node);
        if (i >= 0) node.parentNode.children.splice(i, 1);
      }
      node.parentNode = null;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  };
  return node;
}

let mouseListeners: Array<(e: MouseEvent) => void> = [];

beforeEach(() => {
  mouseListeners = [];
  // Stub document
  vi.stubGlobal('document', {
    createElement: (tag: string) => makeNode(tag),
    addEventListener: (event: string, listener: (e: MouseEvent) => void) => {
      if (event === 'mousemove') mouseListeners.push(listener);
    },
    removeEventListener: (event: string, listener: (e: MouseEvent) => void) => {
      if (event === 'mousemove') mouseListeners = mouseListeners.filter((l) => l !== listener);
    },
  });
  // requestAnimationFrame: run synchronously on next tick
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queueMicrotask(() => cb(performance.now()));
    return 1;
  });
  // HTMLObjectElement constructor / instanceof check used in updateEyeTracking
  class StubObject {}
  vi.stubGlobal('HTMLObjectElement', StubObject);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
});

describe('SVGRenderer', () => {
  it('selects variants deterministically when given an RNG', async () => {
    const container = makeNode('div') as unknown as HTMLElement;
    const r = new SVGRenderer();
    let calls = 0;
    await r.init(container, { scale: 1, opacity: 1 }, {
      stateFiles: { happy: ['a.svg', 'b.svg', 'c.svg'] },
      rng: () => { calls++; return 0.99; }, // always picks last
    });
    await r.setState('happy');
    // c.svg is last; the appended <object> should have data === 'c.svg'.
    const wrapper = (container as unknown as StubNode).children[0];
    const child = wrapper.children[0];
    expect(child.data).toBe('c.svg');
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('removes the previous element after a cross-fade', async () => {
    vi.useFakeTimers();
    const container = makeNode('div') as unknown as HTMLElement;
    const r = new SVGRenderer();
    await r.init(container, { scale: 1, opacity: 1 }, {
      stateFiles: { happy: ['a.svg'], idle: ['b.svg'] },
      rng: () => 0,
    });
    await r.setState('idle');
    // Trigger cross-fade
    const fadePromise = r.setState('happy', { duration: 50 });
    // Advance microtasks so requestAnimationFrame fires, then time for setTimeout
    await vi.runAllTimersAsync();
    await fadePromise;

    const wrapper = (container as unknown as StubNode).children[0];
    // After fade, only the new element should remain
    expect(wrapper.children).toHaveLength(1);
    expect(wrapper.children[0].data).toBe('a.svg');
    vi.useRealTimers();
  });

  it('cancels pending fades on destroy', async () => {
    vi.useFakeTimers();
    const container = makeNode('div') as unknown as HTMLElement;
    const r = new SVGRenderer();
    await r.init(container, { scale: 1, opacity: 1 }, {
      stateFiles: { idle: ['a.svg'], happy: ['b.svg'] },
      rng: () => 0,
    });
    await r.setState('idle');
    // Start a long fade; do not await it
    void r.setState('happy', { duration: 5000 });
    // Allow rAF to fire so the setTimeout is registered
    await Promise.resolve();
    await Promise.resolve();
    r.destroy();
    // Advance timers to simulate the 5000ms delay completing (but destroy() already cancelled it)
    await vi.advanceTimersByTimeAsync(5100);
    // Wrapper was removed from container
    expect((container as unknown as StubNode).children).toHaveLength(0);
    vi.useRealTimers();
  });

  it('removes the mousemove listener on destroy', async () => {
    const container = makeNode('div') as unknown as HTMLElement;
    const r = new SVGRenderer();
    await r.init(container, { scale: 1, opacity: 1 }, {
      stateFiles: { idle: ['a.svg'] },
      eyeTracking: { eyeSelector: '.eye', states: ['idle'], maxOffset: 5 },
    });
    expect(mouseListeners).toHaveLength(1);
    r.destroy();
    expect(mouseListeners).toHaveLength(0);
  });

  it('applies initial scale and opacity from RendererConfig', async () => {
    const container = makeNode('div') as unknown as HTMLElement;
    const r = new SVGRenderer();
    await r.init(container, { scale: 1.5, opacity: 0.4 }, { stateFiles: {} });
    const wrapper = (container as unknown as StubNode).children[0];
    expect(wrapper.style.transform).toContain('scale(1.5)');
    expect(wrapper.style.opacity).toBe('0.4');
  });

  it('getHitBoxes returns wrapper-relative coordinates with non-zero origin', async () => {
    const container = makeNode('div') as unknown as HTMLElement;
    const r = new SVGRenderer();
    await r.init(container, { scale: 1, opacity: 1 }, { stateFiles: {} });
    // Make wrapper report non-origin bbox
    const wrapper = (container as unknown as StubNode).children[0];
    wrapper.getBoundingClientRect = () =>
      ({ left: 42, top: 73, width: 64, height: 80, right: 106, bottom: 153 });
    const [box] = r.getHitBoxes();
    expect(box).toEqual({ x: 42, y: 73, width: 64, height: 80 });
  });
});
