#!/usr/bin/env node
/**
 * Cursor Agent Hook Script for UniPet
 *
 * Config: ~/.cursor/hooks.json
 * Events: prompt_submit, tool_start, tool_end, agent_start, agent_end, error
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('cursor', eventName, payload);
