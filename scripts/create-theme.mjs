#!/usr/bin/env node

/**
 * Theme Scaffolding Tool
 *
 * Usage: node scripts/create-theme.mjs <theme-id>
 *
 * Creates a new theme directory under themes/ with a skeleton theme.json.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const themeId = process.argv[2];

if (!themeId) {
  console.error('Usage: node scripts/create-theme.mjs <theme-id>');
  console.error('  theme-id must match /^[a-z0-9][a-z0-9_-]{0,63}$/');
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(themeId)) {
  console.error(`Error: Invalid theme id "${themeId}"`);
  console.error('  theme-id must match /^[a-z0-9][a-z0-9_-]{0,63}$/');
  process.exit(1);
}

const themeDir = join(ROOT, 'themes', themeId);

if (existsSync(themeDir)) {
  console.error(`Error: Theme directory already exists: themes/${themeId}`);
  process.exit(1);
}

const displayName = themeId
  .split(/[-_]/)
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const skeleton = {
  schemaVersion: 1,
  id: themeId,
  displayName: displayName,
  description: '',
  author: '',
  license: 'MIT',
  renderer: 'css-pixel',
  rendererConfig: {
    gridSize: 16,
    upscale: 8,
    palette: {
      '.': 'transparent',
      '#': '#2d2d2d',
    },
    body: [],
    faces: {},
  },
  states: {
    idle: { files: ['idle'] },
    working: { files: ['working'] },
    thinking: { files: ['thinking'] },
    error: { files: ['error'], autoReturnMs: 5000 },
    attention: { files: ['attention'], autoReturnMs: 3000 },
    sleeping: { files: ['sleeping'] },
  },
  timings: {
    minDisplayMs: 500,
    autoReturnMs: 3000,
    sleepPhaseMs: 3000,
    mouseIdleTimeoutMs: 300000,
    idleCycleMs: 10000,
  },
};

mkdirSync(themeDir, { recursive: true });
writeFileSync(join(themeDir, 'theme.json'), JSON.stringify(skeleton, null, 2) + '\n', 'utf-8');

console.log(`Theme scaffold created: themes/${themeId}/theme.json`);
console.log(`  id:          ${themeId}`);
console.log(`  displayName: ${displayName}`);
console.log(`  renderer:    css-pixel`);
console.log('');
console.log('Next steps:');
console.log(`  1. Edit themes/${themeId}/theme.json — fill in description, author, rendererConfig`);
console.log(`  2. Add state files (idle, working, thinking, error, attention, sleeping)`);
console.log(`  3. Validate with: node scripts/validate-theme.mjs themes/${themeId}`);
