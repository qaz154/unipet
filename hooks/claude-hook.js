#!/usr/bin/env node
/**
 * Claude Code Hook Script for UniPet
 *
 * Config: ~/.claude/settings.json
 * Events: UserPromptSubmit, PreToolUse, PostToolUse, Stop, StopFailure,
 *         Notification, SubagentStart, SubagentStop
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('claude-code', eventName, payload);
