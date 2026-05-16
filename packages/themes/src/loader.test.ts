import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeLoader } from './loader.js';
import type { ThemeDefinition } from './schema.js';

function createValidTheme(overrides: Partial<ThemeDefinition> = {}): ThemeDefinition {
  return {
    schemaVersion: 1,
    id: 'test-pet',
    displayName: 'Test Pet',
    description: 'A test',
    author: 'test',
    license: 'MIT',
    renderer: 'css-pixel',
    rendererConfig: { gridSize: 16, upscale: 8, palette: {}, body: [], faces: {} },
    states: {
      idle: { files: ['idle.svg'] },
      working: { files: ['working.svg'] },
      thinking: { files: ['thinking.svg'] },
      error: { files: ['error.svg'] },
      attention: { files: ['happy.svg'] },
      sleeping: { files: ['sleeping.svg'] },
    },
    timings: {
      minDisplayMs: 500,
      autoReturnMs: 3000,
      sleepPhaseMs: 3000,
      mouseIdleTimeoutMs: 300000,
      idleCycleMs: 10000,
    },
    ...overrides,
  };
}

describe('ThemeLoader', () => {
  let loader: ThemeLoader;

  beforeEach(() => {
    loader = new ThemeLoader();
  });

  it('registers and retrieves themes', () => {
    const theme = createValidTheme();
    loader.register(theme);
    expect(loader.get('test-pet')).toBe(theme);
  });

  it('lists registered themes', () => {
    loader.register(createValidTheme({ id: 'a', displayName: 'A' }));
    loader.register(createValidTheme({ id: 'b', displayName: 'B' }));
    const list = loader.list();
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('loads from data with validation', () => {
    const result = loader.loadFromData(createValidTheme());
    expect(result.theme).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid data', () => {
    const result = loader.loadFromData({ schemaVersion: 2 });
    expect(result.theme).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('sets and gets active theme', () => {
    loader.register(createValidTheme());
    expect(loader.setActive('test-pet')).toBe(true);
    expect(loader.getActive()?.id).toBe('test-pet');
  });

  it('rejects unknown theme id for active', () => {
    expect(loader.setActive('nonexistent')).toBe(false);
  });

  it('applies variant', () => {
    const theme = createValidTheme({
      variants: {
        dark: {
          timings: { minDisplayMs: 1000, autoReturnMs: 5000, sleepPhaseMs: 5000, mouseIdleTimeoutMs: 600000, idleCycleMs: 20000 },
        },
      },
    });
    loader.register(theme);

    const merged = loader.applyVariant('test-pet', 'dark');
    expect(merged).not.toBeNull();
    expect(merged!.timings.minDisplayMs).toBe(1000);
    // Non-overridden fields preserved
    expect(merged!.id).toBe('test-pet');
  });

  it('applies user overrides', () => {
    loader.register(createValidTheme());
    loader.setActive('test-pet');

    const overridden = loader.applyOverrides({ displayName: 'Custom Name' });
    expect(overridden).not.toBeNull();
    expect(overridden!.displayName).toBe('Custom Name');
    expect(overridden!.id).toBe('test-pet'); // preserved
  });

  it('unregisters theme', () => {
    loader.register(createValidTheme());
    expect(loader.unregister('test-pet')).toBe(true);
    expect(loader.get('test-pet')).toBeUndefined();
  });

  it('clears active when unregistering active theme', () => {
    loader.register(createValidTheme());
    loader.setActive('test-pet');
    loader.unregister('test-pet');
    expect(loader.getActive()).toBeUndefined();
  });
});
