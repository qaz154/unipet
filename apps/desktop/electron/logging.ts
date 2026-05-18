/**
 * File-backed logging for the Electron main process.
 *
 * Wraps the @unipet/core logger so that every message is also
 * appended to on-disk log files (out.log / error.log).
 */

import { app } from 'electron';
import { join } from 'path';
import { mkdirSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { createLogger } from '@unipet/core';
import type { Logger } from '@unipet/core';

// ─── Log directory ───────────────────────────────────────

function getLogDir(): string {
  try {
    return app.getPath('logs');
  } catch {
    return join(homedir(), '.unipet', 'logs');
  }
}

let _logDir: string | null = null;

export function logDir(): string {
  if (!_logDir) {
    _logDir = getLogDir();
    mkdirSync(_logDir, { recursive: true });
  }
  return _logDir;
}

// ─── File appender ───────────────────────────────────────

export function logToFile(level: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
  try {
    const file = join(logDir(), level === 'error' ? 'error.log' : 'out.log');
    appendFileSync(file, line);
  } catch {
    // Best effort — don't crash if log write fails
  }
}

// ─── Enhanced logger ─────────────────────────────────────

function fmtArgs(args: unknown[]): string {
  return args.map(a => a instanceof Error ? a.stack || a.message : String(a)).join(' ');
}

/**
 * Creates a Logger whose methods write to both stdout (via
 * @unipet/core createLogger) and on-disk log files.
 */
export function createEnhancedLogger(): Logger {
  const log: Logger = createLogger('debug', 'unipet');
  const origDebug = log.debug.bind(log);
  const origInfo = log.info.bind(log);
  const origWarn = log.warn.bind(log);
  const origError = log.error.bind(log);

  log.debug = (msg, ...args) => { origDebug(msg, ...args); logToFile('debug', args.length ? `${msg} ${fmtArgs(args)}` : msg); };
  log.info = (msg, ...args) => { origInfo(msg, ...args); logToFile('info', args.length ? `${msg} ${fmtArgs(args)}` : msg); };
  log.warn = (msg, ...args) => { origWarn(msg, ...args); logToFile('warn', args.length ? `${msg} ${fmtArgs(args)}` : msg); };
  log.error = (msg, ...args) => { origError(msg, ...args); logToFile('error', args.length ? `${msg} ${fmtArgs(args)}` : msg); };

  return log;
}
