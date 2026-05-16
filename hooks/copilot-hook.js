#!/usr/bin/env node
/**
 * GitHub Copilot CLI Hook Script for UniPet
 *
 * Config: ~/.copilot/hooks/hooks.json
 * Events: sessionStart, userPromptSubmitted, preToolUse, postToolUse, sessionEnd
 * Note: Copilot uses camelCase event names
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('copilot', eventName, payload);
