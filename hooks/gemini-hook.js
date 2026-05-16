#!/usr/bin/env node
/**
 * Gemini CLI Hook Script for UniPet
 *
 * Config: ~/.gemini/settings.json
 * Events: SessionStart, SessionEnd, BeforeAgent, AfterAgent,
 *         BeforeTool, AfterTool, Notification, PreCompress
 */
import { readStdinPayload, handleHook } from './shared.mjs';

const eventName = process.argv[2];
const payload = readStdinPayload();
handleHook('gemini', eventName, payload);
