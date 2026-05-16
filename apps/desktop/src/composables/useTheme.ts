/**
 * Shared ThemeLoader composable.
 *
 * Returns a singleton ThemeLoader instance that persists across component mounts.
 * On first use it eagerly loads every theme.json found under <repo>/themes/ via
 * Vite's import.meta.glob — previously these files were dead code because the
 * loader was instantiated but never fed.
 */

import { ThemeLoader } from '@unipet/themes';

let loader: ThemeLoader | undefined;
let themesLoaded = false;

// Eager-load every theme.json under <repo-root>/themes/*/theme.json.
// Path is relative to this file: src/composables/useTheme.ts → ../../../themes
const themeModules = import.meta.glob('../../../themes/*/theme.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function loadBuiltinThemes(target: ThemeLoader): void {
  if (themesLoaded) return;
  themesLoaded = true;
  for (const [path, data] of Object.entries(themeModules)) {
    const { theme, errors } = target.loadFromData(data);
    if (!theme) {
      console.warn(`[useTheme] Failed to load ${path}:`, errors);
    }
  }
}

export function useTheme(): ThemeLoader {
  if (!loader) {
    loader = new ThemeLoader();
    loadBuiltinThemes(loader);
  }
  return loader;
}
