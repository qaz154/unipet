import { describe, it, expect } from 'vitest';
import { validateTheme } from './schema.js';

describe('validateTheme', () => {
  it('validates a correct theme', () => {
    const theme = {
      schemaVersion: 1,
      id: 'test-pet',
      displayName: 'Test Pet',
      description: 'A test pet',
      author: 'test',
      license: 'MIT',
      renderer: 'css-pixel',
      rendererConfig: { gridSize: 16, upscale: 8, palette: {}, body: [], faces: {} },
      states: {
        idle: { files: ['idle.svg'] },
        working: { files: ['working.svg'] },
      },
    };
    const result = validateTheme(theme);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    const result = validateTheme('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('object');
  });

  it('rejects invalid schemaVersion', () => {
    const result = validateTheme({ schemaVersion: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'schemaVersion')).toBe(true);
  });

  it('rejects invalid id format', () => {
    const result = validateTheme({
      schemaVersion: 1,
      id: 'Invalid_ID!',
      displayName: 'Test',
      renderer: 'css-pixel',
      rendererConfig: {},
      states: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'id')).toBe(true);
  });

  it('accepts valid id formats', () => {
    const validIds = ['abc', 'my-pet', 'pet_01', 'a1b2c3'];
    for (const id of validIds) {
      const result = validateTheme({
        schemaVersion: 1,
        id,
        displayName: 'Test',
        renderer: 'css-pixel',
        rendererConfig: {},
        states: {},
      });
      expect(result.errors.filter((e) => e.path === 'id')).toHaveLength(0);
    }
  });

  it('rejects invalid renderer type', () => {
    const result = validateTheme({
      schemaVersion: 1,
      id: 'test',
      displayName: 'Test',
      renderer: 'invalid-renderer',
      rendererConfig: {},
      states: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'renderer')).toBe(true);
  });

  it('rejects missing rendererConfig', () => {
    const result = validateTheme({
      schemaVersion: 1,
      id: 'test',
      displayName: 'Test',
      renderer: 'svg',
      states: {},
    });
    expect(result.valid).toBe(false);
  });

  it('validates state definitions have files array', () => {
    const result = validateTheme({
      schemaVersion: 1,
      id: 'test',
      displayName: 'Test',
      renderer: 'svg',
      rendererConfig: {},
      states: {
        idle: { files: 'not-an-array' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'states.idle.files')).toBe(true);
  });
});
