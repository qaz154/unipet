/**
 * Localhost HTTP Server for UniPet Adapter Hooks
 *
 * Runs inside the Electron main process.
 * Receives state/speech/emotion events from agent hooks
 * and forwards them to the renderer via IPC.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { writeFileSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { createRequire } from 'node:module';
import { Notification } from 'electron';
import { isExternallyAllowedState, sanitizeBubbleText, DEFAULT_HTTP_PORT, SPEECH_MAX_LENGTH, type MoveTarget, MeshClient, type MeshConfig, type WebSocketFactory } from '@unipet/core';

const MAX_PORT_RETRIES = 100;
const MAX_BODY_SIZE = 4096;

const require = createRequire(import.meta.url);
const APP_VERSION: string = require('../package.json').version;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const VALID_MOVE_TARGETS = new Set([
  'stay', 'center', 'edge-left', 'edge-right', 'edge-top', 'edge-bottom',
  'corner-tl', 'corner-tr', 'corner-bl', 'corner-br',
]);
const MAX_MESH_ROOM_LENGTH = 64;
const MAX_MESH_PEER_NAME_LENGTH = 64;

function isValidMoveTarget(value: string): value is MoveTarget {
  return VALID_MOVE_TARGETS.has(value);
}

function isValidMeshRelayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isValidMeshLabel(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && /^[\w .:@-]+$/.test(value);
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
  private meshClient: MeshClient | null = null;

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
    if (!this.isAllowedHost(req)) {
      this.writeJson(res, 403, { error: 'Forbidden host' });
      return;
    }

    if (!this.applyCors(req, res)) {
      this.writeJson(res, 403, { error: 'Forbidden origin' });
      return;
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
    if (route === 'GET /api/permission-result') return this.requireAuth(req, res, () => this.handlePermissionResult(req, res));
    if (route === 'GET /api/events') return this.requireAuth(req, res, () => this.handleSSE(req, res));
    if (route === 'GET /api/status') return this.handleStatus(res);

    // ── Mesh routes ────────────────────────────────────────
    if (route === 'POST /api/mesh/connect') return this.requireAuth(req, res, () => this.handleMeshConnect(req, res));
    if (route === 'POST /api/mesh/disconnect') return this.requireAuth(req, res, () => this.handleMeshDisconnect(res));
    if (route === 'POST /api/mesh/broadcast') return this.requireAuth(req, res, () => this.handleMeshBroadcast(req, res));
    if (route === 'GET /api/mesh/status') return this.requireAuth(req, res, () => this.handleMeshStatus(res));
    if (route === 'GET /api/mesh/peers') return this.requireAuth(req, res, () => this.handleMeshPeers(res));

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
      if (typeof message !== 'string' || !message) {
        this.writeJson(res, 400, { error: 'Missing message field' });
        return;
      }

      const sanitizedMessage = sanitizeBubbleText(message, SPEECH_MAX_LENGTH);
      if (!sanitizedMessage) {
        this.writeJson(res, 400, { error: 'Message empty after sanitization' });
        return;
      }

      try {
        if (Notification.isSupported()) {
          const n = new Notification({
            title: typeof title === 'string' && title ? sanitizeBubbleText(title, 80) || 'UniPet' : 'UniPet',
            body: sanitizedMessage,
            icon: undefined,
          });
          n.show();
        }
      } catch { /* notification not available */ }

      const event = { type: 'speech', source: 'hook', message: sanitizedMessage, timestamp: Date.now() };
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

  private isAllowedHost(req: IncomingMessage): boolean {
    const hostHeader = req.headers.host;
    if (typeof hostHeader !== 'string') return false;
    const host = hostHeader.split(':')[0]?.toLowerCase();
    return host !== undefined && LOOPBACK_HOSTS.has(host);
  }

  private applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    const originHeader = req.headers.origin;
    if (originHeader === undefined) return true;
    if (typeof originHeader !== 'string') return false;

    try {
      const origin = new URL(originHeader);
      const host = origin.hostname.toLowerCase();
      if (!LOOPBACK_HOSTS.has(host)) return false;
      res.setHeader('Access-Control-Allow-Origin', origin.origin);
      res.setHeader('Vary', 'Origin');
      return true;
    } catch {
      return false;
    }
  }

  private hasValidAuth(req: IncomingMessage): boolean {
    if (process.env['UNIPET_DEV_NO_AUTH'] === '1') return true;
    const auth = req.headers['authorization'] || '';
    const token = Array.isArray(auth) ? auth[0] : auth;
    return token.replace(/^Bearer\s+/i, '').trim() === this.authToken;
  }

  private requireAuth(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const remoteIp = req.socket.remoteAddress || '';
    if (!LOOPBACK_ADDRESSES.has(remoteIp) || !this.hasValidAuth(req)) {
      this.writeJson(res, 401, { error: 'Unauthorized. Use Bearer <token> from ~/.unipet/auth-token' });
      return;
    }
    next();
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

  // ── Mesh Handlers ─────────────────────────────────────────

  private handleMeshConnect(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const b = body as Record<string, unknown>;
      const relayUrl = typeof b['relayUrl'] === 'string' ? b['relayUrl'] : 'wss://mesh.unipet.dev';
      const room = typeof b['room'] === 'string' ? b['room'] : 'default';
      const peerName = typeof b['peerName'] === 'string' ? b['peerName'] : 'dev';

      if (!isValidMeshRelayUrl(relayUrl)) {
        this.writeJson(res, 400, { success: false, error: 'Invalid mesh relayUrl' });
        return;
      }
      if (!isValidMeshLabel(room, MAX_MESH_ROOM_LENGTH)) {
        this.writeJson(res, 400, { success: false, error: 'Invalid mesh room' });
        return;
      }
      if (!isValidMeshLabel(peerName, MAX_MESH_PEER_NAME_LENGTH)) {
        this.writeJson(res, 400, { success: false, error: 'Invalid mesh peerName' });
        return;
      }

      // Disconnect existing client
      if (this.meshClient) {
        this.meshClient.destroy();
        this.meshClient = null;
      }

      // WebSocket factory for Node.js
      const wsFactory: WebSocketFactory = (url: string) => {
        // Dynamic import to avoid bundling ws in renderer builds
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { default: WS } = require('ws') as { default: new (url: string) => import('ws').WebSocket };
        return new WS(url) as unknown as import('@unipet/core').WebSocketLike;
      };

      const config: Partial<MeshConfig> & { wsFactory: typeof wsFactory } = {
        relayUrl,
        room,
        peerName,
        wsFactory,
      };

      this.meshClient = new MeshClient(config);

      // Forward mesh events to renderer
      this.meshClient.on((event, data) => {
        this.petWindow?.webContents.send('mesh:event', { event, data });
      });

      this.meshClient.connect();

      this.writeJson(res, 200, {
        success: true,
        room,
        peerId: this.meshClient.getPeerId(),
        relayUrl,
      });
    });
  }

  private handleMeshDisconnect(res: ServerResponse): void {
    if (this.meshClient) {
      this.meshClient.destroy();
      this.meshClient = null;
    }
    this.writeJson(res, 200, { success: true });
  }

  private handleMeshBroadcast(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req, res, (body) => {
      const b = body as Record<string, unknown>;
      const event = typeof b['event'] === 'string' ? b['event'] : '';
      const message = typeof b['message'] === 'string' ? b['message'] : undefined;

      if (!this.meshClient || !this.meshClient.isConnected()) {
        this.writeJson(res, 400, { success: false, error: 'Mesh not connected' });
        return;
      }

      this.meshClient.broadcastEvent(event as Parameters<MeshClient['broadcastEvent']>[0], message ? { message } : undefined);
      this.writeJson(res, 200, { success: true });
    });
  }

  private handleMeshStatus(res: ServerResponse): void {
    const connected = this.meshClient?.isConnected() ?? false;
    const peers = this.meshClient?.getPeers().length ?? 0;
    this.writeJson(res, 200, { connected, peers });
  }

  private handleMeshPeers(res: ServerResponse): void {
    const peers = this.meshClient?.getPeers() ?? [];
    this.writeJson(res, 200, { peers });
  }

  // ── Body Reading ──────────────────────────────────────────

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
        version: APP_VERSION,
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
