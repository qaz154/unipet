#!/usr/bin/env node
/**
 * UniPet CLI
 *
 * Usage:
 *   unipet              — Start the MCP server (default)
 *   unipet mcp          — Start the MCP server
 *   unipet status [--json]    — Check if desktop app is running
 *   unipet doctor [--json]    — Diagnose CLI and desktop connectivity
 *   unipet react <state>      — Set pet reaction
 *   unipet say <message...>   — Show speech bubble
 *   unipet install [--agent <name>] [--uninstall] — Install/uninstall hooks
 *   unipet theme list [--json]       — List available themes
 *   unipet theme validate <path> [--json] — Validate a theme JSON file
 *   unipet --help | -h        — Show help
 *   unipet --version | -V     — Print version
 *
 * Exit codes:
 *   0  success
 *   1  user error (missing arg / unknown command)
 *   2  invalid argument value (e.g. unknown state)
 *   3  desktop app not running / network error
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EXTERNALLY_ALLOWED_STATES, isExternallyAllowedState, DEFAULT_HTTP_PORT } from '@unipet/core';

const require = createRequire(import.meta.url);
const PKG_VERSION: string = require('../package.json').version;
const HTTP_TIMEOUT_MS = 3000;

// ─── Path constants ──────────────────────────────────────
const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const HOOKS_SCRIPT = join(CLI_DIR, '..', '..', 'hooks', 'install-hooks.js');
const THEMES_DIR = join(CLI_DIR, '..', '..', 'themes');

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

type DoctorStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
  details?: Record<string, unknown>;
}

interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

interface DiscoveryScan {
  paths: string[];
  selectedPath?: string;
  data?: Record<string, unknown>;
  error?: string;
}

function httpRequest(method: 'GET' | 'POST', path: string, body?: unknown, port = getServerPort()): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
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

const httpGet = (path: string, port?: number) => httpRequest('GET', path, undefined, port);
const httpPost = (path: string, body: unknown) => httpRequest('POST', path, body);

// ─── Output helpers ───────────────────────────────────────

function explainHttpError(err: unknown, port = cachedPort ?? DEFAULT_HTTP_PORT): { message: string; hint?: string } {
  const e = err as NodeJS.ErrnoException;
  if (e?.code === 'ECONNREFUSED') {
    return {
      message: `Cannot connect to UniPet on 127.0.0.1:${port}`,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scanDiscovery(): DiscoveryScan {
  const paths = discoveryPaths();
  for (const p of paths) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(p, 'utf-8'));
      if (!isRecord(parsed)) return { paths, selectedPath: p, error: 'Discovery file is not a JSON object' };
      return { paths, selectedPath: p, data: parsed };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === 'ENOENT') continue;
      return { paths, selectedPath: p, error: e?.message || String(err) };
    }
  }
  return { paths };
}

function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function formatDoctorCheck(check: DoctorCheck): string {
  const label = check.status === 'pass' ? 'ok' : check.status;
  return `[${label}] ${check.message}\n`;
}

function printHelp(): void {
  process.stdout.write(`UniPet — Universal Desktop Pet Framework  (v${PKG_VERSION})

Usage:
  unipet                       Start MCP server (stdio transport)
  unipet mcp                   Start MCP server explicitly
  unipet status [--json]       Print desktop-app status
  unipet doctor [--json]       Diagnose CLI and desktop connectivity
  unipet react <state>         Set the pet's visual reaction
  unipet say <message...>      Show a speech bubble
  unipet install [--agent <name>] [--uninstall]
                               Install or uninstall hooks
  unipet theme list [--json]   List available themes
  unipet theme validate <path> [--json]
                               Validate a theme JSON file

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

async function cmdDoctor(parsed: ParsedArgs): Promise<number> {
  const checks: DoctorCheck[] = [
    {
      id: 'cli',
      status: 'pass',
      message: `CLI unipet ${PKG_VERSION}`,
      details: { node: process.version, platform: process.platform, arch: process.arch },
    },
  ];

  const discovery = scanDiscovery();
  let port = DEFAULT_HTTP_PORT;
  if (!discovery.selectedPath) {
    checks.push({
      id: 'discovery',
      status: 'warn',
      message: `Discovery file not found; probing fallback port ${DEFAULT_HTTP_PORT}`,
      details: { paths: discovery.paths },
    });
  } else if (discovery.error) {
    checks.push({
      id: 'discovery',
      status: 'fail',
      message: `Discovery file is invalid: ${discovery.error}`,
      details: { path: discovery.selectedPath, paths: discovery.paths },
    });
  } else if (!validPort(discovery.data?.['httpPort'])) {
    checks.push({
      id: 'discovery',
      status: 'fail',
      message: 'Discovery file does not contain a valid httpPort',
      details: { path: discovery.selectedPath, paths: discovery.paths },
    });
  } else {
    port = discovery.data['httpPort'];
    checks.push({
      id: 'discovery',
      status: 'pass',
      message: `Discovery file found at ${discovery.selectedPath}`,
      details: {
        path: discovery.selectedPath,
        httpPort: port,
        pid: discovery.data['pid'],
        startedAt: discovery.data['startedAt'],
        version: discovery.data['version'],
      },
    });
  }

  if (!checks.some((check) => check.id === 'discovery' && check.status === 'fail')) {
    try {
      const { status, body } = await httpGet('/api/status', port);
      const ok = status >= 200 && status < 300;
      checks.push({
        id: 'desktop-http',
        status: ok ? 'pass' : 'fail',
        message: ok ? `Desktop HTTP reachable on 127.0.0.1:${port}` : `Desktop HTTP returned status ${status}`,
        details: { port, status, body },
      });
    } catch (err) {
      const { message, hint } = explainHttpError(err, port);
      checks.push({
        id: 'desktop-http',
        status: 'fail',
        message: 'Desktop HTTP unreachable',
        details: { port, error: message, hint },
      });
    }
  }

  const report: DoctorReport = {
    ok: !checks.some((check) => check.status === 'fail'),
    checks,
  };

  if (parsed.flags.has('json')) {
    printJson(report);
  } else {
    process.stdout.write(checks.map(formatDoctorCheck).join(''));
    const failed = checks.find((check) => check.status === 'fail' && check.details?.['hint']);
    if (failed) process.stdout.write(`${failed.details?.['hint']}\n`);
  }

  return report.ok ? 0 : 3;
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

// ─── Install command ────────────────────────────────────

function cmdInstall(parsed: ParsedArgs): Promise<number> {
  if (!existsSync(HOOKS_SCRIPT)) {
    process.stderr.write(`Hooks script not found: ${HOOKS_SCRIPT}\n`);
    return Promise.resolve(1);
  }

  const args: string[] = [];
  if (parsed.flags.has('uninstall')) args.push('--uninstall');
  if (parsed.flags.has('agent') && parsed.positional.length > 0) {
    args.push('--agent', parsed.positional[0]);
  }

  return new Promise((resolvePromise) => {
    execFile('node', [HOOKS_SCRIPT, ...args], { cwd: CLI_DIR }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      resolvePromise(error ? 1 : 0);
    });
  });
}

// ─── Theme commands ─────────────────────────────────────

interface ThemeEntry {
  id: string;
  renderer: string;
  description: string;
}

function cmdThemeList(parsed: ParsedArgs): number {
  if (!existsSync(THEMES_DIR)) {
    process.stderr.write(`Themes directory not found: ${THEMES_DIR}\n`);
    return 1;
  }

  // Themes live in subdirectories as theme.json (e.g. themes/pixel-slime/theme.json)
  const entries = readdirSync(THEMES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  const themes: ThemeEntry[] = entries.map((e) => {
    const themeFile = join(THEMES_DIR, e.name, 'theme.json');
    try {
      const data: Record<string, unknown> = JSON.parse(readFileSync(themeFile, 'utf-8'));
      return {
        id: String(data['id'] ?? e.name),
        renderer: String(data['renderer'] ?? '?'),
        description: String(data['description'] ?? ''),
      };
    } catch {
      return { id: e.name, renderer: 'error', description: 'Failed to parse' };
    }
  });

  if (parsed.flags.has('json')) {
    printJson(themes);
  } else {
    const idW = 20;
    const renW = 12;
    const header = `${'ID'.padEnd(idW)} ${'Renderer'.padEnd(renW)} Description`;
    process.stdout.write(header + '\n');
    process.stdout.write('-'.repeat(header.length) + '\n');
    for (const t of themes) {
      process.stdout.write(`${t.id.padEnd(idW)} ${t.renderer.padEnd(renW)} ${t.description}\n`);
    }
    if (themes.length === 0) process.stdout.write('(no themes found)\n');
  }

  return 0;
}

function cmdThemeValidate(parsed: ParsedArgs): number {
  const filePath = parsed.positional[0];
  if (!filePath) {
    process.stderr.write('Usage: unipet theme validate <path>\n');
    return 1;
  }

  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    process.stderr.write(`File not found: ${resolved}\n`);
    return 1;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(resolved, 'utf-8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Invalid JSON: ${msg}\n`);
    return 1;
  }

  const VALID_RENDERERS = ['css-pixel', 'svg', 'sprite', 'live2d'];
  const errors: string[] = [];

  if (data['schemaVersion'] === undefined) errors.push('Missing required field: schemaVersion');
  if (data['id'] === undefined) errors.push('Missing required field: id');
  if (data['renderer'] === undefined) {
    errors.push('Missing required field: renderer');
  } else if (!VALID_RENDERERS.includes(String(data['renderer']))) {
    errors.push(`Invalid renderer: '${data['renderer']}'. Must be one of: ${VALID_RENDERERS.join(', ')}`);
  }

  const result = { valid: errors.length === 0, errors, file: resolved };

  if (parsed.flags.has('json')) {
    printJson(result);
  } else {
    if (result.valid) {
      process.stdout.write(`Theme is valid: ${data['id']} (${data['renderer']})\n`);
    } else {
      process.stdout.write('Theme validation failed:\n');
      for (const e of errors) process.stdout.write(`  - ${e}\n`);
    }
  }

  return result.valid ? 0 : 1;
}

function cmdTheme(parsed: ParsedArgs): number {
  const sub = parsed.positional[0];
  const subParsed: ParsedArgs = {
    command: parsed.command,
    positional: parsed.positional.slice(1),
    flags: parsed.flags,
  };
  switch (sub) {
    case 'list':     return cmdThemeList(subParsed);
    case 'validate': return cmdThemeValidate(subParsed);
    default:
      process.stderr.write(`Unknown theme subcommand: ${sub ?? '(none)'}\n`);
      process.stderr.write('Usage: unipet theme list [--json]\n       unipet theme validate <path> [--json]\n');
      return 1;
  }
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
    case 'mcp':     return cmdMcp();
    case 'status':  return cmdStatus(parsed);
    case 'doctor':  return cmdDoctor(parsed);
    case 'react':   return cmdReact(parsed);
    case 'say':     return cmdSay(parsed);
    case 'install': return cmdInstall(parsed);
    case 'theme':   return cmdTheme(parsed);
    default:
      process.stderr.write(`Unknown command: ${parsed.command}\n\n`);
      printHelp();
      return 1;
  }
}

// Only invoke main when run directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

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
