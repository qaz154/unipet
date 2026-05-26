/**
 * Pet Mesh — cross-device pet social network.
 *
 * Enables pets on different developer desktops to discover and interact
 * with each other. Uses a simple WebSocket relay server or direct
 * peer-to-peer connections.
 *
 * Features:
 * - Peer discovery (who else has a pet nearby?)
 * - Status broadcasting (my pet is in "working" state)
 * - Collective events (CI red → all pets panic)
 * - Proximity visualization (pets walk toward each other)
 * - Celebration sync (milestone → nearby pets celebrate)
 *
 * Architecture:
 * - Each pet runs a local MeshClient
 * - MeshClient connects to a relay server (or uses mDNS for LAN)
 * - Messages are small JSON payloads (state + emotion + metadata)
 * - No persistent storage — ephemeral social layer
 */

import type { PetState, EmotionVector } from '@unipet/core';

export interface MeshPeer {
  /** Unique peer ID (derived from hostname + user) */
  id: string;
  /** Display name (e.g., "Alice's Cat") */
  name: string;
  /** Current pet state */
  state: PetState;
  /** Current emotion vector */
  emotion: EmotionVector;
  /** Pet theme ID */
  themeId: string;
  /** Last seen timestamp */
  lastSeen: number;
  /** User-defined status message */
  statusMessage?: string;
}

export interface MeshMessage {
  type: 'state-update' | 'celebration' | 'alert' | 'ping' | 'pong' | 'discover';
  senderId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface MeshConfig {
  /** Relay server WebSocket URL (default: wss://mesh.unipet.dev) */
  relayUrl: string;
  /** This peer's display name */
  peerName: string;
  /** Enable mesh networking */
  enabled: boolean;
  /** Heartbeat interval in ms (default: 10000) */
  heartbeatMs: number;
  /** Peer timeout in ms (default: 30000) */
  peerTimeoutMs: number;
}

const DEFAULT_CONFIG: MeshConfig = {
  relayUrl: 'wss://mesh.unipet.dev',
  peerName: 'Anonymous Pet',
  enabled: false,
  heartbeatMs: 10_000,
  peerTimeoutMs: 30_000,
};

export type PeerListener = (peers: MeshPeer[]) => void;
export type MessageListener = (message: MeshMessage) => void;

export class PetMesh {
  private config: MeshConfig;
  private ws: WebSocket | null = null;
  private peers = new Map<string, MeshPeer>();
  private peerListeners: PeerListener[] = [];
  private messageListeners: MessageListener[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private currentState: PetState = 'idle';
  private currentEmotion: EmotionVector = { valence: 0, arousal: 0, dominance: 0 };
  private myId: string;

  constructor(config: Partial<MeshConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.myId = this.generatePeerId();
  }

  /** Check if WebSocket is available */
  static isSupported(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  /** Connect to the mesh network */
  connect(): void {
    if (!this.config.enabled || !PetMesh.isSupported()) return;

    try {
      this.ws = new WebSocket(this.config.relayUrl);

      this.ws.onopen = () => {
        this.sendMessage({
          type: 'discover',
          senderId: this.myId,
          payload: { name: this.config.peerName },
          timestamp: Date.now(),
        });
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as MeshMessage;
          this.handleMessage(message);
        } catch { /* ignore malformed messages */ }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          if (this.config.enabled) this.connect();
        }, 5000);
      };

      this.ws.onerror = () => {
        // Silently handle errors — will reconnect on close
      };
    } catch {
      console.warn('[PetMesh] Failed to connect to relay');
    }
  }

  /** Disconnect from the mesh */
  disconnect(): void {
    this.config.enabled = false;
    this.stopHeartbeat();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.peers.clear();
    this.emitPeers();
  }

  /** Update this pet's state and broadcast to peers */
  updateState(state: PetState, emotion: EmotionVector): void {
    this.currentState = state;
    this.currentEmotion = emotion;
    this.broadcast({
      type: 'state-update',
      senderId: this.myId,
      payload: { state, emotion, name: this.config.peerName },
      timestamp: Date.now(),
    });
  }

  /** Broadcast a celebration event to all peers */
  celebrate(reason: string): void {
    this.broadcast({
      type: 'celebration',
      senderId: this.myId,
      payload: { reason, name: this.config.peerName },
      timestamp: Date.now(),
    });
  }

  /** Send an alert to all peers (e.g., CI failure) */
  alert(message: string): void {
    this.broadcast({
      type: 'alert',
      senderId: this.myId,
      payload: { message, name: this.config.peerName },
      timestamp: Date.now(),
    });
  }

  /** Get all known peers */
  getPeers(): MeshPeer[] {
    return [...this.peers.values()];
  }

  /** Register listener for peer list changes */
  onPeers(listener: PeerListener): () => void {
    this.peerListeners.push(listener);
    return () => { this.peerListeners = this.peerListeners.filter((l) => l !== listener); };
  }

  /** Register listener for incoming messages */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.push(listener);
    return () => { this.messageListeners = this.messageListeners.filter((l) => l !== listener); };
  }

  /** Update config */
  updateConfig(config: Partial<MeshConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Clean up */
  destroy(): void {
    this.disconnect();
    this.peerListeners = [];
    this.messageListeners = [];
  }

  // ─── Private ────────────────────────────────────────────

  private handleMessage(message: MeshMessage): void {
    if (message.senderId === this.myId) return;

    switch (message.type) {
      case 'state-update':
      case 'discover': {
        const peer: MeshPeer = {
          id: message.senderId,
          name: (message.payload['name'] as string) ?? 'Unknown',
          state: (message.payload['state'] as PetState) ?? 'idle',
          emotion: (message.payload['emotion'] as EmotionVector) ?? { valence: 0, arousal: 0, dominance: 0 },
          themeId: (message.payload['themeId'] as string) ?? 'default',
          lastSeen: Date.now(),
        };
        this.peers.set(peer.id, peer);
        this.emitPeers();
        break;
      }
      case 'celebration':
      case 'alert':
      case 'ping':
        break;
    }

    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private broadcast(message: MeshMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendMessage(message: MeshMessage): void {
    this.broadcast(message);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.broadcast({
        type: 'state-update',
        senderId: this.myId,
        payload: { state: this.currentState, emotion: this.currentEmotion, name: this.config.peerName },
        timestamp: Date.now(),
      });
      this.cleanupStalePeers();
    }, this.config.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanupStalePeers(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > this.config.peerTimeoutMs) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPeers();
  }

  private emitPeers(): void {
    const peers = this.getPeers();
    for (const listener of this.peerListeners) {
      listener(peers);
    }
  }

  private generatePeerId(): string {
    const hostname = typeof globalThis !== 'undefined' && 'location' in globalThis
      ? (globalThis as { location: { hostname: string } }).location.hostname
      : 'local';
    return `${hostname}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
