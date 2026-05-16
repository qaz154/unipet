#!/usr/bin/env node
/**
 * Kiro CLI (AWS) Hook Script for UniPet
 *
 * Config: ~/.kiro/agents/unipet.json
 * Events: agentSpawn, userPromptSubmit, preToolUse, postToolUse, stop
 * Note: Kiro has no global hooks — user must switch to unipet agent
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('kiro', eventName, payload);
