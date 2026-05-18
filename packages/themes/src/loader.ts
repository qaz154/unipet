/**
 * Theme Loader
 *
 * Discovers, loads, and validates themes.
 * Applies variant patches and user overrides.
 * Inspired by clawd-on-desk's theme-loader.js.
 */

import {
  type ThemeDefinition,
  type ValidationError,
  validateTheme,
  DEFAULT_TIMINGS,
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
