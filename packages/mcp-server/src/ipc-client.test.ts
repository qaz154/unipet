import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { callIPC } from './ipc-client.js';

let originalUnipetIpcPath: string | undefined;
let originalXdgStateHome: string | undefined;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function writeDiscovery(baseDir: string, httpPort: number): string {
  const dir = join(baseDir, '.local', 'state', 'unipet');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'ipc.json');
  writeFileSync(file, JSON.stringify({ httpPort, pid: 1234, startedAt: '2026-05-18T00:00:00.000Z', version: '0.1.6' }));
  return file;
}

function writeToken(baseDir: string, token: string): string {
  const dir = join(baseDir, '.unipet');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'auth-token');
  writeFileSync(file, token);
  return file;
}

beforeEach(() => {
  originalUnipetIpcPath = process.env['UNIPET_IPC_PATH'];
  originalXdgStateHome = process.env['XDG_STATE_HOME'];
  originalHome = process.env['HOME'];
  originalUserProfile = process.env['USERPROFILE'];
});

afterEach(() => {
  if (originalUnipetIpcPath === undefined) delete process.env['UNIPET_IPC_PATH'];
  else process.env['UNIPET_IPC_PATH'] = originalUnipetIpcPath;

  if (originalXdgStateHome === undefined) delete process.env['XDG_STATE_HOME'];
  else process.env['XDG_STATE_HOME'] = originalXdgStateHome;

  if (originalHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = originalHome;

  if (originalUserProfile === undefined) delete process.env['USERPROFILE'];
  else process.env['USERPROFILE'] = originalUserProfile;
});

describe('callIPC', () => {
  test('sends bearer token for protected POST requests and parses JSON', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'unipet-home-'));
    process.env['HOME'] = homeDir;
    process.env['USERPROFILE'] = homeDir;
    process.env['XDG_STATE_HOME'] = homeDir;

    const token = 'test-token-123';
    writeToken(homeDir, token);

    let seenAuth: string | undefined;
    let seenBody = '';
    const server = createServer((req: IncomingMessage, res) => {
      seenAuth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
      req.on('data', (chunk) => { seenBody += chunk.toString(); });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, echo: JSON.parse(seenBody) }));
      });
    });
    const port = await listen(server);
    writeDiscovery(homeDir, port);

    try {
      const result = await callIPC('pet.react', { state: 'working' });

      expect(seenAuth).toBe(`Bearer ${token}`);
      expect(JSON.parse(seenBody)).toEqual({ state: 'working' });
      expect(result).toEqual({ success: true, echo: { state: 'working' } });
    } finally {
      await close(server);
    }
  });

  test('uses the same auth flow for speech requests', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'unipet-home-'));
    process.env['HOME'] = homeDir;
    process.env['USERPROFILE'] = homeDir;
    process.env['XDG_STATE_HOME'] = homeDir;

    writeToken(homeDir, 'speech-token');

    let seenAuth: string | undefined;
    const server = createServer((req: IncomingMessage, res) => {
      seenAuth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'ok' }));
    });
    const port = await listen(server);
    writeDiscovery(homeDir, port);

    try {
      const result = await callIPC('pet.say', { message: 'Hello' });

      expect(seenAuth).toBe('Bearer speech-token');
      expect(result).toEqual({ success: true, message: 'ok' });
    } finally {
      await close(server);
    }
  });

  test('returns a clear error when discovery is missing', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'unipet-home-'));
    process.env['HOME'] = homeDir;
    process.env['USERPROFILE'] = homeDir;
    process.env['XDG_STATE_HOME'] = homeDir;

    const result = await callIPC('status', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('desktop app is not running');
  });
});
