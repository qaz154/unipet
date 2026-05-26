/**
 * Pet Mesh — P2P pet social networking protocol
 *
 * Connects multiple UniPet instances through a WebSocket relay server.
 * Peers share state, speech, and collaborative events in real-time.
 *
 * Protocol flow:
 *   client → relay: { type: 'join', room, peerId, peerName, petState }
 *   relay → client: { type: 'peer_joined', peerId, peerName, petState }
 *   client → relay: { type: 'state', petState, emotion? }
 *   relay → client: { type: 'state', peerId, petState, emotion? }
 *   client → relay: { type: 'say', message }
 *   relay → client: { type: 'say', peerId, message }
 *   client → relay: { type: 'mesh_event', event }
 *   relay → client: { type: 'mesh_event', peerId, event }
 *   both directions: { type: 'heartbeat' }
 *   relay → client: { type: 'peer_left', peerId }
 */

import type { PetState, EmotionVector } from './events.js';

// Re-export PetState and EmotionVector so consumers can import from mesh.ts
export type { PetState, EmotionVector };

// ─── Mesh Message Types ─────────────────────────────────────

export interface MeshJoin {
  type: 'join';
  room: string;
  peerId: string;
  peerName: string;
  petState: PetState;
}

export interface MeshState {
  type: 'state';
  petState: PetState;
  emotion?: EmotionVector;
}

export interface MeshSay {
  type: 'say';
  message: string;
}

export interface MeshCommandEvent {
  type: 'mesh_event';
  event: MeshEventType;
  data?: Record<string, unknown>;
}

export interface MeshHeartbeat {
  type: 'heartbeat';
}

// ─── Relay → Client messages ────────────────────────────────

export interface MeshPeerJoined {
  type: 'peer_joined';
  peerId: string;
  peerName: string;
  petState: PetState;
}

export interface MeshPeerState {
  type: 'state';
  peerId: string;
  petState: PetState;
  emotion?: EmotionVector;
}

export interface MeshPeerSay {
  type: 'say';
  peerId: string;
  message: string;
}

export interface MeshPeerEvent {
  type: 'mesh_event';
  peerId: string;
  event: MeshEventType;
  data?: Record<string, unknown>;
}

export interface MeshPeerLeft {
  type: 'peer_left';
  peerId: string;
}

export interface MeshRoomInfo {
  type: 'room_info';
  peers: Array<{ peerId: string; peerName: string; petState: PetState }>;
}

// ─── Union types ────────────────────────────────────────────

export type MeshClientMessage =
  | MeshJoin
  | MeshState
  | MeshSay
  | MeshCommandEvent
  | MeshHeartbeat;

export type MeshServerMessage =
  | MeshPeerJoined
  | MeshPeerState
  | MeshPeerSay
  | MeshPeerEvent
  | MeshPeerLeft
  | MeshRoomInfo;

export type MeshMessage = MeshClientMessage | MeshServerMessage;

// ─── Mesh event types ───────────────────────────────────────

/**
 * Predefined mesh event types for team-wide notifications.
 * These trigger special animations on receiving pets.
 */
export type MeshEventType =
  | 'ci_red'           // CI build failed
  | 'ci_green'         // CI build passed
  | 'milestone'        // Release or milestone reached
  | 'celebrate'        // General celebration
  | 'panic'            // Something went wrong
  | 'wave'             // Friendly greeting
  | 'collaborate';     // Working on the same PR/branch

// ─── Peer state ─────────────────────────────────────────────

export interface MeshPeer {
  peerId: string;
  peerName: string;
  petState: PetState;
  emotion?: EmotionVector;
  lastSeen: number;
  /** Relative screen position for ghost rendering (0-1 range) */
  x: number;
  y: number;
}

// ─── Mesh config ────────────────────────────────────────────

export interface MeshConfig {
  /** WebSocket relay URL */
  relayUrl: string;
  /** Room name (usually project/repo name) */
  room: string;
  /** Display name for this peer */
  peerName: string;
  /** Auto-reconnect on disconnect */
  autoReconnect: boolean;
  /** Heartbeat interval in ms (default 15s) */
  heartbeatMs: number;
}

export const DEFAULT_MESH_CONFIG: MeshConfig = {
  relayUrl: 'wss://mesh.unipet.dev',
  room: 'default',
  peerName: 'dev',
  autoReconnect: true,
  heartbeatMs: 15_000,
};
