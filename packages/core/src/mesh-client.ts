/**
 * MeshClient — WebSocket-based pet mesh client
 *
 * Connects to a relay server and exchanges pet state with other peers.
 * Uses a WebSocket factory for testability — the caller provides the
 * WebSocket implementation (e.g. native WebSocket in Electron, or ws in Node).
 *
 * Events are emitted via a simple callback interface instead of EventEmitter
 * to stay framework-agnostic and avoid Node-specific APIs.
 */

import type {
  PetState,
  EmotionVector,
  MeshConfig,
  MeshPeer,
  MeshClientMessage,
  MeshServerMessage,
  MeshEventType,
} from './mesh.js';
import { DEFAULT_MESH_CONFIG } from './mesh.js';

export type MeshEventType_Listener = (
  event: 'connected' | 'disconnected' | 'peer_joined' | 'peer_left' | 'peer_state' | 'peer_say' | 'mesh_event',
  data: unknown,
) => void;

/** Factory that creates a WebSocket-like object */
export type WebSocketFactory = (url: string) => WebSocketLike;

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class MeshClient {
  private config: MeshConfig;
  private ws: WebSocketLike | null = null;
  private wsFactory: WebSocketFactory;
  private listener: MeshEventType_Listener | null = null;
  private peers = new Map<string, MeshPeer>();
  private peerId = '';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(config: Partial<MeshConfig> & { wsFactory: WebSocketFactory }) {
    this.config = { ...DEFAULT_MESH_CONFIG, ...config };
    this.wsFactory = config.wsFactory;
    this.peerId = crypto.randomUUID?.() ?? `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Register event listener */
  on(listener: MeshEventType_Listener): void {
    this.listener = listener;
  }

  /** Connect to the relay */
  connect(): void {
    if (this.destroyed) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    const url = `${this.config.relayUrl}?room=${encodeURIComponent(this.config.room)}`;
    this.ws = this.wsFactory(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.sendJoin();
      this.startHeartbeat();
      this.listener?.('connected', { peerId: this.peerId, room: this.config.room });
    };

    this.ws.onmessage = (event: { data: string }) => {
      try {
        const msg = JSON.parse(event.data) as MeshServerMessage;
        this.handleServerMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.listener?.('disconnected', { reason: 'connection closed' });
      if (this.config.autoReconnect && !this.destroyed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /** Disconnect and stop reconnection */
  destroy(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.peers.clear();
  }

  /** Send current pet state to all peers */
  broadcastState(petState: PetState, emotion?: EmotionVector): void {
    const msg: MeshClientMessage = { type: 'state', petState, emotion };
    this.send(msg);
  }

  /** Send a speech bubble to all peers */
  broadcastSay(message: string): void {
    this.send({ type: 'say', message });
  }

  /** Send a mesh event (CI red, milestone, etc.) to all peers */
  broadcastEvent(event: MeshEventType, data?: Record<string, unknown>): void {
    this.send({ type: 'mesh_event', event, data });
  }

  /** Get all current peers */
  getPeers(): MeshPeer[] {
    return [...this.peers.values()];
  }

  /** Get the local peer ID */
  getPeerId(): string {
    return this.peerId;
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.ws?.readyState === 1;
  }

  // ─── Private ─────────────────────────────────────────────

  private send(msg: MeshClientMessage): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  private sendJoin(): void {
    this.send({
      type: 'join',
      room: this.config.room,
      peerId: this.peerId,
      peerName: this.config.peerName,
      petState: 'idle',
    });
  }

  private handleServerMessage(msg: MeshServerMessage): void {
    switch (msg.type) {
      case 'peer_joined': {
        if (msg.peerId === this.peerId) break;
        const peer: MeshPeer = {
          peerId: msg.peerId,
          peerName: msg.peerName,
          petState: msg.petState,
          lastSeen: Date.now(),
          x: Math.random() * 0.6 + 0.2,
          y: Math.random() * 0.4 + 0.3,
        };
        this.peers.set(msg.peerId, peer);
        this.listener?.('peer_joined', peer);
        break;
      }
      case 'state': {
        const peer = this.peers.get(msg.peerId);
        if (peer) {
          peer.petState = msg.petState;
          peer.emotion = msg.emotion;
          peer.lastSeen = Date.now();
        } else {
          // State for unknown peer — create it
          const newPeer: MeshPeer = {
            peerId: msg.peerId,
            peerName: 'unknown',
            petState: msg.petState,
            emotion: msg.emotion,
            lastSeen: Date.now(),
            x: Math.random() * 0.6 + 0.2,
            y: Math.random() * 0.4 + 0.3,
          };
          this.peers.set(msg.peerId, newPeer);
        }
        this.listener?.('peer_state', { peerId: msg.peerId, petState: msg.petState, emotion: msg.emotion });
        break;
      }
      case 'say': {
        this.listener?.('peer_say', { peerId: msg.peerId, message: msg.message });
        break;
      }
      case 'mesh_event': {
        this.listener?.('mesh_event', { peerId: msg.peerId, event: msg.event, data: msg.data });
        break;
      }
      case 'peer_left': {
        this.peers.delete(msg.peerId);
        this.listener?.('peer_left', { peerId: msg.peerId });
        break;
      }
      case 'room_info': {
        for (const p of msg.peers) {
          if (p.peerId === this.peerId) continue;
          this.peers.set(p.peerId, {
            peerId: p.peerId,
            peerName: p.peerName,
            petState: p.petState,
            lastSeen: Date.now(),
            x: Math.random() * 0.6 + 0.2,
            y: Math.random() * 0.4 + 0.3,
          });
        }
        this.listener?.('connected', { peerId: this.peerId, room: this.config.room, peers: msg.peers.length });
        break;
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, this.config.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
