/**
 * Node.js file utilities for theme import/export.
 *
 * These functions use Node.js APIs (node:fs, node:path) and should only be
 * imported in Node.js environments (CLI tools, build scripts, Electron main process).
 *
 * DO NOT import this module in browser/renderer code!
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ThemeDefinition, ValidationError } from './schema.js';
import { validateTheme } from './schema.js';

export interface ImportResult {
  theme: ThemeDefinition | null;
  errors: ValidationError[];
}

/**
 * Import a theme from a JSON file.
 * Only available in Node.js environments.
 */
export function importThemeFromFile(filePath: string): ImportResult {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const validation = validateTheme(data);
    if (!validation.valid) {
      return { theme: null, errors: validation.errors };
    }
    return { theme: data as ThemeDefinition, errors: [] };
  } catch (err) {
    return {
      theme: null,
      errors: [{ path: 'file', message: err instanceof Error ? err.message : 'Read error' }],
    };
  }
}

/**
 * Export a theme to a JSON file.
 * Only available in Node.js environments.
 */
export function exportThemeToFile(theme: ThemeDefinition, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(theme, null, 2), 'utf-8');
}

/**
 * Import a theme and persist it to the user themes directory.
 * Creates the directory structure automatically.
 * Only available in Node.js environments.
 */
export function importAndPersistTheme(
  sourcePath: string,
  userThemesDir: string,
): ImportResult {
  const result = importThemeFromFile(sourcePath);
  if (result.theme) {
    const themeDir = join(userThemesDir, result.theme.id);
    mkdirSync(themeDir, { recursive: true });
    exportThemeToFile(result.theme, join(themeDir, 'theme.json'));
  }
  return result;
}
