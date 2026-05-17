/**
 * Theme Loader
 *
 * Discovers, loads, and validates themes.
 * Applies variant patches and user overrides.
 * Inspired by clawd-on-desk's theme-loader.js.
 */

import {
  type ThemeDefinition,
  type ThemeVariant,
  type ThemeTimings,
  type ValidationError,
  validateTheme,
  DEFAULT_TIMINGS,
  REQUIRED_STATES,
} from './schema.js';
import { mergeVariant } from './variants.js';

export interface ThemeManifest {
  id: string;
  displayName: string;
  description: string;
  renderer: string;
  path: string;
}

export interface LoaderConfig {
  /** Paths to search for themes */
  searchPaths: string[];
  /** Built-in theme ids */
  builtInThemes: string[];
}

export class ThemeLoader {
  private readonly themes = new Map<string, ThemeDefinition>();
  private activeThemeId: string | undefined;

  /** Register a theme from a validated definition */
  register(theme: ThemeDefinition): void {
    this.themes.set(theme.id, theme);
  }

  /** Load and validate a theme from JSON data */
  loadFromData(data: unknown): { theme: ThemeDefinition | null; errors: ValidationError[] } {
    const validation = validateTheme(data);
    if (!validation.valid) {
      return { theme: null, errors: validation.errors };
    }

    const raw = data as ThemeDefinition;
    const theme: ThemeDefinition = {
      ...raw,
      timings: { ...DEFAULT_TIMINGS, ...raw.timings },
      states: { ...raw.states },
    };

    const missingStates = REQUIRED_STATES.filter(
      (s) => !theme.states[s],
    );
    if (missingStates.length > 0) {
      console.warn(`[unipet/themes] Theme "${theme.id}" missing states: ${missingStates.join(', ')}`);
    }

    this.themes.set(theme.id, theme);
    return { theme, errors: [] };
  }

  /** Get a theme by id */
  get(id: string): ThemeDefinition | undefined {
    return this.themes.get(id);
  }

  /** List all registered themes */
  list(): ThemeManifest[] {
    return [...this.themes.values()].map((t) => ({
      id: t.id,
      displayName: t.displayName,
      description: t.description,
      renderer: t.renderer,
      path: '',
    }));
  }

  /** Set the active theme */
  setActive(id: string): boolean {
    if (!this.themes.has(id)) return false;
    this.activeThemeId = id;
    return true;
  }

  /** Get the active theme */
  getActive(): ThemeDefinition | undefined {
    return this.activeThemeId ? this.themes.get(this.activeThemeId) : undefined;
  }

  /** Apply a variant to a theme */
  applyVariant(themeId: string, variantName: string): ThemeDefinition | null {
    const base = this.themes.get(themeId);
    if (!base || !base.variants?.[variantName]) return null;

    const variant = base.variants[variantName];
    return mergeVariant(base, variant);
  }

  /** Apply user overrides to the active theme */
  applyOverrides(overrides: Partial<ThemeDefinition>): ThemeDefinition | null {
    const active = this.getActive();
    if (!active) return null;

    return {
      ...active,
      ...overrides,
      timings: { ...active.timings, ...(overrides.timings ?? {}) },
      states: { ...active.states, ...(overrides.states ?? {}) },
    };
  }

  /** Remove a theme */
  unregister(id: string): boolean {
    if (this.activeThemeId === id) {
      this.activeThemeId = undefined;
    }
    return this.themes.delete(id);
  }

  /** Export a theme as JSON string */
  exportTheme(id: string): string | null {
    const theme = this.themes.get(id);
    if (!theme) return null;
    return JSON.stringify(theme, null, 2);
  }

  get count(): number {
    return this.themes.size;
  }
}

/**
 * Node.js-only file utilities for theme import/export.
 *
 * These methods have been moved to `file-utils.ts` to avoid pulling
 * node:fs into the browser bundle.
 *
 * For Node.js usage, import from '@unipet/themes/file-utils' instead:
 *
 *   import { importThemeFromFile, exportThemeToFile, importAndPersistTheme } from '@unipet/themes/file-utils';
 *
 * @deprecated Use the functions from '@unipet/themes/file-utils' instead.
 */
export class NodeFileUtils {
  /**
   * @deprecated Use `importThemeFromFile` from '@unipet/themes/file-utils'
   */
  static importFromFile(_filePath: string): { theme: ThemeDefinition | null; errors: ValidationError[] } {
    throw new Error(
      '[unipet/themes] NodeFileUtils.importFromFile has been removed from the browser bundle. ' +
      'Use import { importThemeFromFile } from "@unipet/themes/file-utils" in Node.js environments.',
    );
  }

  /**
   * @deprecated Use `importAndPersistTheme` from '@unipet/themes/file-utils'
   */
  static async importAndPersist(_filePath: string, _userThemesDir: string): Promise<{ theme: ThemeDefinition | null; errors: ValidationError[] }> {
    throw new Error(
      '[unipet/themes] NodeFileUtils.importAndPersist has been removed from the browser bundle. ' +
      'Use import { importAndPersistTheme } from "@unipet/themes/file-utils" in Node.js environments.',
    );
  }
}
