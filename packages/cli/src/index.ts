#!/usr/bin/env node
/**
 * UniPet CLI
 *
 * Usage:
 *   unipet              — Start the MCP server (default)
 *   unipet mcp          — Start the MCP server
 *   unipet status [--json]    — Check if desktop app is running
 *   unipet react <state>      — Set pet reaction
 *   unipet say <message...>   — Show speech bubble
 *   unipet --help | -h        — Show help
 *   unipet --version | -V     — Print version
 *
 * Exit codes:
 *   0  success
 *   1  user error (missing arg / unknown command)
 *   2  invalid argument value (e.g. unknown state)
 *   3  desktop app not running / network error
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { EXTERNALLY_ALLOWED_STATES, isExternallyAllowedState, DEFAULT_HTTP_PORT } from '@unipet/core';

const require = createRequire(import.meta.url);
const PKG_VERSION: string = require('../package.json').version;
const HTTP_TIMEOUT_MS = 3000;

// ─── Discovery ─────────────────────────────────────────────
// Cached because every CLI invocation reads it at most once. Read on first
// HTTP call to avoid penalising commands that don't need the server (e.g. mcp).

let cachedPort: number | null = null;

function getServerPort(): number {
  if (cachedPort !== null) return cachedPort;
  const paths = discoveryPaths();
  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (typeof data.httpPort === 'number') {
        const port: number = data.httpPort;
        cachedPort = port;
        return port;
      }
    } catch {
      // Try next path
    }
  }
  process.stderr.write(
    `[unipet] discovery file not found in any of:\n  ${paths.join('\n  ')}\n` +
      `         falling back to port ${DEFAULT_HTTP_PORT}\n`,
  );
  cachedPort = DEFAULT_HTTP_PORT;
  return cachedPort;
}

function discoveryPaths(): string[] {
  // Honor XDG_STATE_HOME on Linux, fall back to ~/.local/state.
  const xdg = process.env['XDG_STATE_HOME'];
  const paths: string[] = [];
  if (xdg) paths.push(join(xdg, 'unipet', 'ipc.json'));
  paths.push(join(homedir(), '.local', 'state', 'unipet', 'ipc.json'));
  paths.push(join(homedir(), 'AppData', 'Local', 'unipet', 'ipc.json'));
  if (process.env['UNIPET_IPC_PATH']) paths.unshift(process.env['UNIPET_IPC_PATH']);
  return paths;
}

// ─── HTTP ─────────────────────────────────────────────────

interface HttpResult {
  status: number;
  body: unknown;
}

function httpRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const port = getServerPort();
    const postData = body !== undefined ? JSON.stringify(body) : '';
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: postData
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
          : {},
        timeout: HTTP_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: unknown;
          try { parsed = JSON.parse(data); }
          catch { parsed = { raw: data }; }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`HTTP request timed out after ${HTTP_TIMEOUT_MS}ms`)));
    if (postData) req.write(postData);
    req.end();
  });
}

const httpGet = (path: string) => httpRequest('GET', path);
const httpPost = (path: string, body: unknown) => httpRequest('POST', path, body);

// ─── Output helpers ───────────────────────────────────────

function explainHttpError(err: unknown): { message: string; hint?: string } {
  const e = err as NodeJS.ErrnoException;
  if (e?.code === 'ECONNREFUSED') {
    return {
      message: `Cannot connect to UniPet on 127.0.0.1:${cachedPort ?? DEFAULT_HTTP_PORT}`,
      hint: 'Is the desktop app running? Start it with: pnpm --filter @unipet/desktop dev',
    };
  }
  if (e?.code === 'ETIMEDOUT' || /timed out/i.test(e?.message ?? '')) {
    return { message: 'Request timed out (3s).', hint: 'The desktop app may be unresponsive.' };
  }
  return { message: e?.message || String(err) };
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function printHelp(): void {
  process.stdout.write(`UniPet — Universal Desktop Pet Framework  (v${PKG_VERSION})

Usage:
  unipet                       Start MCP server (stdio transport)
  unipet mcp                   Start MCP server explicitly
  unipet status [--json]       Print desktop-app status
  unipet react <state>         Set the pet's visual reaction
  unipet say <message...>      Show a speech bubble

Options:
  --help, -h                   Show this help
  --version, -V                Print CLI version

Valid states for 'react':
  ${EXTERNALLY_ALLOWED_STATES.join(', ')}

Exit codes:
  0  success
  1  user error
  2  invalid argument value
  3  desktop app unreachable
`);
}

// ─── Commands ─────────────────────────────────────────────

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Set<string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
    else if (a.startsWith('-') && a.length > 1) flags.add(a.slice(1));
    else positional.push(a);
  }
  const command = positional.shift() || 'mcp';
  return { command, positional, flags };
}

async function cmdStatus(parsed: ParsedArgs): Promise<number> {
  try {
    const { status, body } = await httpGet('/api/status');
    if (parsed.flags.has('json')) {
      printJson(body);
    } else {
      const b = body as { running?: boolean; port?: number; sseClients?: number; pid?: number };
      process.stdout.write(
        `UniPet desktop app: ${b.running ? 'running' : 'unknown'}\n` +
          `  HTTP port:   ${b.port ?? '?'}\n` +
          `  PID:         ${b.pid ?? '?'}\n` +
          `  SSE clients: ${b.sseClients ?? 0}\n`,
      );
    }
    return status >= 200 && status < 300 ? 0 : 3;
  } catch (err) {
    const { message, hint } = explainHttpError(err);
    process.stderr.write(`${message}\n` + (hint ? `${hint}\n` : ''));
    return 3;
  }
}

async function cmdReact(parsed: ParsedArgs): Promise<number> {
  const state = parsed.positional[0];
  if (!state) {
    process.stderr.write('Usage: unipet react <state>\n');
    process.stderr.write(`Valid states: ${EXTERNALLY_ALLOWED_STATES.join(', ')}\n`);
    return 1;
  }
  if (!isExternallyAllowedState(state)) {
    process.stderr.write(`Invalid state: '${state}'\n`);
    process.stderr.write(`Valid states: ${EXTERNALLY_ALLOWED_STATES.join(', ')}\n`);
    return 2;
  }
  try {
    const { status, body } = await httpPost('/api/state', { state });
    if (parsed.flags.has('json')) printJson(body);
    else process.stdout.write(status >= 200 && status < 300 ? `OK — reaction: ${state}\n` : `Failed: ${JSON.stringify(body)}\n`);
    return status >= 200 && status < 300 ? 0 : 3;
  } catch (err) {
    const { message, hint } = explainHttpError(err);
    process.stderr.write(`${message}\n` + (hint ? `${hint}\n` : ''));
    return 3;
  }
}

async function cmdSay(parsed: ParsedArgs): Promise<number> {
  const message = parsed.positional.join(' ');
  if (!message) {
    process.stderr.write('Usage: unipet say <message>\n');
    return 1;
  }
  try {
    const { status, body } = await httpPost('/api/speech', { message });
    if (parsed.flags.has('json')) printJson(body);
    else process.stdout.write(status >= 200 && status < 300 ? `OK\n` : `Failed: ${JSON.stringify(body)}\n`);
    return status >= 200 && status < 300 ? 0 : 3;
  } catch (err) {
    const { message: msg, hint } = explainHttpError(err);
    process.stderr.write(`${msg}\n` + (hint ? `${hint}\n` : ''));
    return 3;
  }
}

async function cmdMcp(): Promise<number> {
  const { startMCPServer } = await import('@unipet/mcp-server');
  await startMCPServer();
  return 0;
}

// ─── Entrypoint ───────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  // Global flags
  if (parsed.flags.has('version') || parsed.flags.has('V')) {
    process.stdout.write(`unipet ${PKG_VERSION}\n`);
    return 0;
  }
  if (parsed.flags.has('help') || parsed.flags.has('h') || parsed.command === 'help') {
    printHelp();
    return 0;
  }

  switch (parsed.command) {
    case 'mcp':   return cmdMcp();
    case 'status': return cmdStatus(parsed);
    case 'react': return cmdReact(parsed);
    case 'say':   return cmdSay(parsed);
    default:
      process.stderr.write(`Unknown command: ${parsed.command}\n\n`);
      printHelp();
      return 1;
  }
}

// Only invoke main when run directly (not when imported by tests).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith('/index.js') && process.argv[1]?.endsWith('/index.js');

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${msg}\n`);
      process.exit(1);
    },
  );
}
