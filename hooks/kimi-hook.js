#!/usr/bin/env node
/**
 * Kimi CLI (Moonshot AI) Hook Script for UniPet
 *
 * Config: ~/.kimi/config.toml (TOML format)
 * Events: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse,
 *         PostToolUseFailure, Stop, StopFailure, SubagentStart, SubagentStop,
 *         PreCompact, PostCompact, Notification
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('kimi', eventName, payload);
