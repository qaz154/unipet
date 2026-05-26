/**
 * Pet Mesh — WebSocket Relay Server
 *
 * A lightweight relay that connects multiple UniPet instances.
 * Each connection joins a room; messages are broadcast to all peers in the same room.
 *
 * Usage:
 *   node --import tsx packages/mcp-server/src/relay-server.ts
 *   or programmatically: startRelay({ port: 9999 })
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { MeshServerMessage } from '@unipet/core';

interface RelayPeer {
  id: string;
  name: string;
  state: string;
  room: string;
  ws: WebSocket;
  alive: boolean;
}

interface RelayRoom {
  peers: Map<string, RelayPeer>;
}

export interface RelayConfig {
  port: number;
  /** Idle timeout before disconnecting a silent peer (ms, default 60s) */
  idleTimeoutMs: number;
  /** Heartbeat interval (ms, default 15s) */
  heartbeatMs: number;
}

const DEFAULT_RELAY_CONFIG: RelayConfig = {
  port: 9999,
  idleTimeoutMs: 60_000,
  heartbeatMs: 15_000,
};

function parseUrlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return params;
  const searchParams = new URLSearchParams(url.slice(queryIndex + 1));
  searchParams.forEach((v, k) => { params[k] = v; });
  return params;
}

export function startRelay(config?: Partial<RelayConfig>): { port: number; close: () => Promise<void> } {
  const cfg = { ...DEFAULT_RELAY_CONFIG, ...config };
  const rooms = new Map<string, RelayRoom>();
  const peersById = new Map<string, RelayPeer>();

  function getOrCreateRoom(roomId: string): RelayRoom {
    let room = rooms.get(roomId);
    if (!room) {
      room = { peers: new Map() };
      rooms.set(roomId, room);
    }
    return room;
  }

  function broadcast(roomId: string, message: MeshServerMessage, excludeId?: string): void {
    const room = rooms.get(roomId);
    if (!room) return;
    const data = JSON.stringify(message);
    for (const [id, peer] of room.peers) {
      if (id === excludeId) continue;
      if (peer.ws.readyState === 1) {
        peer.ws.send(data);
      }
    }
  }

  function removePeer(peer: RelayPeer): void {
    const room = rooms.get(peer.room);
    if (room) {
      room.peers.delete(peer.id);
      if (room.peers.size === 0) rooms.delete(peer.room);
    }
    peersById.delete(peer.id);
    broadcast(peer.room, { type: 'peer_left', peerId: peer.id });
  }

  const wss = new WebSocketServer({ port: cfg.port });

  wss.on('connection', (ws: WebSocket, req) => {
    const params = parseUrlParams(req.url ?? '/');
    void (params['room'] || 'default');

    let peer: RelayPeer | null = null;

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'));

        if (msg.type === 'join') {
          const room = getOrCreateRoom(msg.room);
          peer = {
            id: msg.peerId,
            name: msg.peerName,
            state: msg.petState || 'idle',
            room: msg.room,
            ws,
            alive: true,
          };
          room.peers.set(peer.id, peer);
          peersById.set(peer.id, peer);

          // Send room info to the new peer
          const existingPeers: Array<{ peerId: string; peerName: string; petState: string }> = [];
          for (const [, p] of room.peers) {
            if (p.id !== peer!.id) {
              existingPeers.push({ peerId: p.id, peerName: p.name, petState: p.state });
            }
          }
          ws.send(JSON.stringify({ type: 'room_info', peers: existingPeers }));

          // Notify others
          broadcast(msg.room, {
            type: 'peer_joined',
            peerId: peer.id,
            peerName: peer.name,
            petState: peer.state as 'idle' | 'thinking' | 'working' | 'error',
          }, peer.id);
          return;
        }

        if (!peer) return;

        peer.alive = true;

        switch (msg.type) {
          case 'state':
            peer.state = msg.petState;
            broadcast(peer.room, {
              type: 'state',
              peerId: peer.id,
              petState: msg.petState,
              emotion: msg.emotion,
            }, peer.id);
            break;

          case 'say':
            broadcast(peer.room, {
              type: 'say',
              peerId: peer.id,
              message: msg.message,
            }, peer.id);
            break;

          case 'mesh_event':
            broadcast(peer.room, {
              type: 'mesh_event',
              peerId: peer.id,
              event: msg.event,
              data: msg.data,
            }, peer.id);
            break;

          case 'heartbeat':
            // Already marked alive above
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (peer) removePeer(peer);
    });

    ws.on('error', () => {
      if (peer) removePeer(peer);
    });
  });

  // Heartbeat: disconnect peers that haven't sent any message
  const heartbeatTimer = setInterval(() => {
    for (const peer of peersById.values()) {
      if (!peer.alive) {
        peer.ws.terminate();
        removePeer(peer);
        continue;
      }
      peer.alive = false;
    }
  }, cfg.heartbeatMs);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  return {
    port: cfg.port,
    close: () => new Promise<void>((resolve) => {
      clearInterval(heartbeatTimer);
      for (const [, peer] of peersById) {
        peer.ws.close();
      }
      peersById.clear();
      rooms.clear();
      wss.close(() => resolve());
    }),
  };
}

// ─── CLI entry point ──────────────────────────────────────
if (process.argv[1] && process.argv[1].includes('relay-server')) {
  const port = parseInt(process.argv[2] || '9999', 10);
  const relay = startRelay({ port });
  // eslint-disable-next-line no-console
  console.log(`[mesh-relay] Listening on port ${relay.port}`);
  process.on('SIGINT', () => { relay.close(); process.exit(0); });
}
