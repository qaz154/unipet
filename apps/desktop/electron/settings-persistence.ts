/**
 * User settings persistence — reads/writes ~/.unipet/settings.json.
 *
 * All functions that mutate settings take the settings record by
 * reference so every module sharing the same object stays in sync.
 */

import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

// ─── Paths ───────────────────────────────────────────────

export const CONFIG_DIR = join(homedir(), '.unipet');
export const CONFIG_FILE = join(CONFIG_DIR, 'settings.json');

// ─── Helpers ─────────────────────────────────────────────

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadSettings(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch { /* corrupt file, start fresh */ }
  return {};
}

export function saveSettings(data: Record<string, unknown>): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

// ─── Typed accessors ─────────────────────────────────────

export function getSetting<T>(
  settings: Record<string, unknown>,
  key: string,
  fallback: T,
): T {
  return (settings[key] as T) ?? fallback;
}

export function setSetting(
  settings: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  settings[key] = value;
  saveSettings(settings);
}
