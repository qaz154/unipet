#!/usr/bin/env node
/**
 * CodeBuddy (Tencent) Hook Script for UniPet
 *
 * Config: ~/.codebuddy/settings.json
 * Events: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse,
 *         PostToolUse, Stop, Notification, PreCompact, PermissionRequest
 * Note: PermissionRequest uses HTTP blocking hook to pet server
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('codebuddy', eventName, payload);
