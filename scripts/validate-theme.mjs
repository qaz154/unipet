#!/usr/bin/env node

/**
 * Theme Validation Tool
 *
 * Usage: node scripts/validate-theme.mjs <theme-path>
 *
 * Validates a theme.json file against the theme schema requirements.
 * theme-path can be a directory containing theme.json or the JSON file itself.
 */

import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: node scripts/validate-theme.mjs <theme-path>');
  console.error('  theme-path: path to a theme directory or theme.json file');
  process.exit(1);
}

const resolvedPath = resolve(inputPath);
let jsonPath;

try {
  const stat = statSync(resolvedPath);
  if (stat.isDirectory()) {
    jsonPath = join(resolvedPath, 'theme.json');
  } else {
    jsonPath = resolvedPath;
  }
} catch {
  console.error(`Error: Path does not exist: ${inputPath}`);
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(jsonPath, 'utf-8');
} catch {
  console.error(`Error: Cannot read file: ${jsonPath}`);
  process.exit(1);
}

let theme;
try {
  theme = JSON.parse(raw);
} catch (err) {
  console.error(`Error: Invalid JSON in ${jsonPath}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

// ─── Required fields ──────────────────────────────────────────

const requiredFields = ['schemaVersion', 'id', 'displayName', 'renderer', 'rendererConfig', 'states'];
for (const field of requiredFields) {
  if (theme[field] === undefined || theme[field] === null) {
    errors.push(`Missing required field: ${field}`);
  }
}

// ─── schemaVersion ────────────────────────────────────────────

if (theme.schemaVersion !== undefined && theme.schemaVersion !== 1) {
  errors.push(`schemaVersion must be 1, got: ${theme.schemaVersion}`);
}

// ─── id format ────────────────────────────────────────────────

if (theme.id !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(theme.id)) {
  errors.push(`id "${theme.id}" does not match /^[a-z0-9][a-z0-9_-]{0,63}$/`);
}

// ─── renderer ─────────────────────────────────────────────────

const validRenderers = ['css-pixel', 'svg', 'spritesheet', 'live2d'];
if (theme.renderer !== undefined && !validRenderers.includes(theme.renderer)) {
  errors.push(`renderer must be one of: ${validRenderers.join(', ')}, got: "${theme.renderer}"`);
}

// ─── Required states ──────────────────────────────────────────

const requiredStates = ['idle', 'working', 'thinking', 'error', 'attention', 'sleeping'];
if (theme.states && typeof theme.states === 'object') {
  for (const state of requiredStates) {
    if (!theme.states[state]) {
      errors.push(`Missing required state: ${state}`);
    } else if (!Array.isArray(theme.states[state].files)) {
      errors.push(`State "${state}" is missing a valid "files" array`);
    }
  }

  // Check that every state has files
  for (const [key, def] of Object.entries(theme.states)) {
    if (!def || typeof def !== 'object') {
      errors.push(`State "${key}" is not an object`);
    } else if (!Array.isArray(def.files)) {
      errors.push(`State "${key}" is missing a "files" array`);
    }
  }
} else if (theme.states !== undefined) {
  errors.push('"states" must be an object');
}

// ─── rendererConfig ───────────────────────────────────────────

if (theme.rendererConfig !== undefined && typeof theme.rendererConfig !== 'object') {
  errors.push('"rendererConfig" must be an object');
}

// ─── timings (optional) ──────────────────────────────────────

if (theme.timings !== undefined) {
  if (typeof theme.timings !== 'object') {
    errors.push('"timings" must be an object');
  }
}

// ─── animation tiers (optional) ───────────────────────────────

for (const field of ['workingTiers', 'jugglingTiers']) {
  const tiers = theme[field];
  if (tiers !== undefined) {
    if (!Array.isArray(tiers)) {
      errors.push(`"${field}" must be an array`);
    } else {
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        if (!tier || typeof tier !== 'object') {
          errors.push(`${field}[${i}]: must be an object`);
          continue;
        }
        if (typeof tier.minSessions !== 'number' || tier.minSessions < 1) {
          errors.push(`${field}[${i}].minSessions: must be a positive number`);
        }
        if (!Array.isArray(tier.files)) {
          errors.push(`${field}[${i}].files: must be an array of file paths`);
        }
      }
    }
  }
}

// ─── Sleep sequence states (warning) ──────────────────────────

const sleepSequenceStates = ['yawning', 'dozing', 'waking'];
if (theme.sleepSequence === 'full' && theme.states) {
  for (const state of sleepSequenceStates) {
    if (!theme.states[state]) {
      warnings.push(`sleepSequence is "full" but state "${state}" is not defined`);
    }
  }
}

// ─── Output ───────────────────────────────────────────────────

console.log(`Validating: ${jsonPath}`);
console.log('');

if (errors.length === 0 && warnings.length === 0) {
  console.log('Result: VALID');
  console.log(`  id:       ${theme.id}`);
  console.log(`  renderer: ${theme.renderer}`);
  console.log(`  states:   ${Object.keys(theme.states || {}).length}`);
  process.exit(0);
}

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) {
    console.log(`  - ${w}`);
  }
  console.log('');
}

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  console.log('');
  console.log('Result: INVALID');
  process.exit(1);
} else {
  console.log('Result: VALID (with warnings)');
  process.exit(0);
}
