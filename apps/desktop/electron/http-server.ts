/**
 * Localhost HTTP Server for UniPet Adapter Hooks
 *
 * Runs inside the Electron main process.
 * Receives state/speech/emotion events from agent hooks
 * and forwards them to the renderer via IPC.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { writeFileSync, mkdirSync, unlinkSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { Notification } from 'electron';
import { isExternallyAllowedState, sanitizeBubbleText, DEFAULT_HTTP_PORT, SPEECH_MAX_LENGTH, type MoveTarget } from '@unipet/core';

const MAX_PORT_RETRIES = 100;
const MAX_BODY_SIZE = 4096;

const VALID_MOVE_TARGETS = new Set([
  'stay', 'center', 'edge-left', 'edge-right', 'edge-top', 'edge-bottom',
  'corner-tl', 'corner-tr', 'corner-bl', 'corner-br',
]);

function isValidMoveTarget(value: string): value is MoveTarget {
  return VALID_MOVE_TARGETS.has(value);
}

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

function getTokenDir(): string {
  const dir = join(homedir(), '.unipet');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readToken(): string | null {
  try {
    return readFileSync(join(getTokenDir(), 'auth-token'), 'utf-8').trim();
  } catch {
    return null;
  }
}

interface SSEClient {
  res: ServerResponse;
  write: (data: string) => void;
}

export class PetHttpServer {
  private server: Server | undefined;
  private sseClients: SSEClient[] = [];
  private _port = DEFAULT_HTTP_PORT;
  private _initialPort = DEFAULT_HTTP_PORT;
  private _retryCount = 0;
  private petWindow: Electron.BrowserWindow | undefined;
  private authToken = '';

  get port(): number {
    return this._port;
  }

  get token(): string {
    return this.authToken;
  }

  start(port: number = DEFAULT_HTTP_PORT, petWindow?: Electron.BrowserWindow): void {
    this._port = port;
    this._initialPort = port;
    this._retryCount = 0;
    this.petWindow = petWindow;

    // Generate or reuse auth token
    this.authToken = readToken() || generateToken();
    writeFileSync(join(getTokenDir(), 'auth-token'), this.authToken, { mode: 0o600 });

    this.listen();
  }

  private listen(): void {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(this._port, '127.0.0.1', () => {
      this.writeDiscoveryFile();
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        if (this._retryCount >= MAX_PORT_RETRIES) {
          console.error(
            `[unipet/http-server] Gave up after ${MAX_PORT_RETRIES} EADDRINUSE retries ` +
              `(scanned ${this._initialPort}..${this._initialPort + MAX_PORT_RETRIES - 1}).`,
          );
          return;
        }
        this._retryCount++;
        this._port++;
        // Close the previous listener bound to nothing; recreate via listen()
        this.server?.close();
        this.listen();
      } else {
        console.error('[unipet/http-server] Server error:', err);
      }
    });
  }

  stop(): void {
    for (const client of this.sseClients) {
      client.res.end();
    }
    this.sseClients = [];
    this.server?.close();
    this.removeDiscoveryFile();
  }

  broadcast(event: Record<string, unknown>): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    this.sseClients = this.sseClients.filter((client) => {
      try {
        client.write(data);
        return true;
      } catch {
        return false;
      }
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin || '';
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${this._port}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === 'POST /api/state') return this.requireAuth(req, res, () => this.handleState(req, res));
    if (route === 'POST /api/move') return this.requireAuth(req, res, () => this.handleMove(req, res));
    if (route === 'POST /api/speech') return this.requireAuth(req, res, () => this.handleSpeech(req, res));
    if (route === 'POST /api/emotion') return this.requireAuth(req, res, () => this.handleEmotion(req, res));
    if (route === 'POST /api/permission') return this.requireAuth(req, res, () => this.handlePermission(req, res));
    if (route === 'POST /api/notify') return this.requireAuth(req, res, () => this.handleNotify(req, res));
    if (route === 'GET /api/permission-result') return this.handlePermissionResult(req, res);
    if (route === 'GET /api/events') return this.handleSSE(req, res);
    if (route === 'GET /api/status') return this.handleStatus(res);

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private handleState(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const { state, sessionId } = body as { state?: string; sessionId?: string };
      if (!state) {
        this.writeJson(res, 400, { error: 'Missing state field' });
        return;
      }

      // Single policy source: only states agents are allowed to push externally
      if (!isExternallyAllowedState(state)) {
        this.writeJson(res, 400, { error: `Invalid or disallowed state: ${state}` });
        return;
      }

      const event = {
        type: 'state_change',
        source: 'hook',
        state,
        sessionId: sessionId || 'default',
        timestamp: Date.now(),
      };
      this.petWindow?.webContents.send('pet:event', event);
      this.broadcast(event);
      this.writeJson(res, 200, { success: true });
    });
  }

  private handleMove(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const { target } = body as { target?: string };
      if (!target || !isValidMoveTarget(target)) {
        this.writeJson(res, 400, { error: `Invalid or missing move target: ${target}` });
        return;
      }

      const event = {
        type: 'move',
        source: 'hook',
        move: target,
        timestamp: Date.now(),
      };
      this.petWindow?.webContents.send('pet:event', event);
      this.broadcast(event);
      this.writeJson(res, 200, { success: true });
    });
  }

  private handleSpeech(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const { message, state } = body as { message?: string; state?: string };
      if (typeof message !== 'string' || !message) {
        this.writeJson(res, 400, { error: 'Missing message field' });
        return;
      }

      // Defense in depth: route external speech through the same sanitizer
      // BubbleManager uses — strips secrets, URLs, paths, base64, long code.
      const sanitized = sanitizeBubbleText(message, SPEECH_MAX_LENGTH);
      if (!sanitized) {
        this.writeJson(res, 400, { error: 'Message empty after sanitization' });
        return;
      }

      const event = {
        type: 'speech',
        source: 'hook',
        message: sanitized,
        state,
        timestamp: Date.now(),
      };
      this.petWindow?.webContents.send('pet:event', event);
      this.broadcast(event);
      this.writeJson(res, 200, { success: true, message: sanitized });
    });
  }

  private handleEmotion(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const emotion = body as Record<string, unknown>;
      const { valence, arousal, dominance } = emotion;
      if (typeof valence !== 'number' || typeof arousal !== 'number' || typeof dominance !== 'number') {
        this.writeJson(res, 400, { error: 'Invalid emotion vector' });
        return;
      }
      // Range-check so the renderer never sees garbage values
      const inRange = (v: number, lo: number, hi: number) =>
        Number.isFinite(v) && v >= lo && v <= hi;
      if (!inRange(valence, -1, 1) || !inRange(arousal, 0, 1) || !inRange(dominance, 0, 1)) {
        this.writeJson(res, 400, { error: 'Emotion components out of range' });
        return;
      }

      const event = {
        type: 'emotion',
        source: 'hook',
        emotion: { valence, arousal, dominance },
        timestamp: Date.now(),
      };
      this.petWindow?.webContents.send('pet:event', event);
      this.broadcast(event);
      this.writeJson(res, 200, { success: true });
    });
  }

  private handlePermission(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const { permissionId, toolName, message } = body as {
        permissionId?: string;
        toolName?: string;
        message?: string;
      };
      if (!permissionId) {
        this.writeJson(res, 400, { error: 'Missing permissionId field' });
        return;
      }

      const event = {
        type: 'permission',
        source: 'hook',
        permissionId,
        permissionTool: toolName || 'unknown',
        message: message || `Allow "${toolName || 'tool'}"?`,
        timestamp: Date.now(),
      };
      this.petWindow?.webContents.send('pet:event', event);
      this.broadcast(event);
      this.writeJson(res, 200, { success: true });
    });
  }

  // ── Desktop Notification ────────────────────────────────
  private handleNotify(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const { title, message } = body as { title?: string; message?: string };
      if (!message) {
        this.writeJson(res, 400, { error: 'Missing message field' });
        return;
      }
      try {
        if (Notification.isSupported()) {
          const n = new Notification({
            title: title || 'UniPet',
            body: String(message).slice(0, 256),
            icon: undefined,
          });
          n.show();
        }
      } catch { /* notification not available */ }

      const event = { type: 'speech', source: 'hook', message: String(message).slice(0, 140), timestamp: Date.now() };
      this.petWindow?.webContents.send('pet:event', event);
      this.broadcast(event);
      this.writeJson(res, 200, { success: true });
    });
  }

  // ── Permission Result Long-Poll ─────────────────────────
  private pendingPermissions = new Map<string, { res: ServerResponse; timer: ReturnType<typeof setTimeout> }>();

  resolvePermission(permissionId: string, action: string): void {
    const pending = this.pendingPermissions.get(permissionId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingPermissions.delete(permissionId);
    if (!pending.res.writableEnded) {
      this.writeJson(pending.res, 200, { permissionId, action });
    }
  }

  private handlePermissionResult(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this._port}`);
    const permId = url.searchParams.get('id');
    if (!permId) {
      this.writeJson(res, 400, { error: 'Missing id query param' });
      return;
    }

    const timeout = setTimeout(() => {
      this.pendingPermissions.delete(permId);
      if (!res.writableEnded) {
        this.writeJson(res, 408, { error: 'Permission request timed out', permissionId: permId });
      }
    }, 120_000);

    this.pendingPermissions.set(permId, { res, timer: timeout });
    req.on('close', () => {
      clearTimeout(timeout);
      this.pendingPermissions.delete(permId);
    });
  }

  private requireAuth(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    // Localhost requests from hook scripts on the same machine skip auth
    const remoteIp = req.socket.remoteAddress || '';
    if (remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1') {
      next();
      return;
    }
    // Remote requests require Bearer token from ~/.unipet/auth-token
    const auth = req.headers['authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token === this.authToken) {
      next();
      return;
    }
    this.writeJson(res, 401, { error: 'Unauthorized. Use Bearer <token> from ~/.unipet/auth-token' });
  }

  private writeJson(res: ServerResponse, status: number, payload: unknown): void {
    if (res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(':ok\n\n');

    const client: SSEClient = {
      res,
      write: (data: string) => res.write(data),
    };
    this.sseClients.push(client);

    req.on('close', () => {
      this.sseClients = this.sseClients.filter((c) => c !== client);
    });
  }

  private handleStatus(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      running: true,
      port: this._port,
      sseClients: this.sseClients.length,
    }));
  }

  private readBody(
    req: IncomingMessage,
    res: ServerResponse,
    callback: (body: unknown) => void,
  ): void {
    let data = '';
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      data += chunk.toString();
      if (data.length > MAX_BODY_SIZE) {
        aborted = true;
        // Send a proper 413 so the client sees something useful instead of a
        // dangling socket. Previously the connection was just .destroy()'d,
        // which left clients with opaque EPIPE / network errors.
        this.writeJson(res, 413, { error: 'Payload too large', maxBytes: MAX_BODY_SIZE });
        req.removeAllListeners('data');
        req.removeAllListeners('end');
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try { callback(JSON.parse(data || '{}')); } catch { callback({}); }
    });
  }

  private writeDiscoveryFile(): void {
    try {
      const dir = join(homedir(), '.local', 'state', 'unipet');
      mkdirSync(dir, { recursive: true });
      const info = {
        httpPort: this._port,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        version: '0.1.3',
      };
      writeFileSync(join(dir, 'ipc.json'), JSON.stringify(info, null, 2));
    } catch { /* non-critical */ }
  }

  private removeDiscoveryFile(): void {
    try {
      unlinkSync(join(homedir(), '.local', 'state', 'unipet', 'ipc.json'));
    } catch { /* ignore */ }
  }
}
