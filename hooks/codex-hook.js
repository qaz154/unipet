#!/usr/bin/env node
/**
 * Codex CLI Hook Script for UniPet
 *
 * Config: ~/.codex/hooks.json
 * Events: session_start, tool_use, tool_result, permission, turn_end, error
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('codex', eventName, payload);
