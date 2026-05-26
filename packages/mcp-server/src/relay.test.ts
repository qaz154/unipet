import { describe, expect, it, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startRelay } from './relay-server.js';

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.on('message', (data) => {
      try { resolve(JSON.parse(data.toString())); }
      catch { resolve(data.toString()); }
    });
    ws.on('error', reject);
  });
}

function connectToRelay(port: number, room = 'test'): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}?room=${room}`);
}

// Find a free port by trying sequential numbers
function getFreePort(): number {
  return Math.floor(Math.random() * 20000) + 30000;
}

describe('Mesh Relay Server', () => {
  let relay: ReturnType<typeof startRelay>;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    clients.length = 0;
    await relay?.close();
  });

  it('broadcasts peer_joined to other peers in the same room', async () => {
    relay = startRelay({ port: 0, heartbeatMs: 30_000, idleTimeoutMs: 60_000 });

    const ws1 = connectToRelay(relay.port, 'room-a');
    const ws2 = connectToRelay(relay.port, 'room-a');
    clients.push(ws1, ws2);

    await waitForOpen(ws1);
    await waitForOpen(ws2);

    // ws1 joins first
    ws1.send(JSON.stringify({ type: 'join', room: 'room-a', peerId: 'p1', peerName: 'Alice', petState: 'idle' }));

    // ws2 joins, should get room_info with Alice
    const p2Joined = waitForMessage(ws2);
    ws2.send(JSON.stringify({ type: 'join', room: 'room-a', peerId: 'p2', peerName: 'Bob', petState: 'idle' }));

    const roomInfo = await p2Joined as { type: string; peers: Array<{ peerId: string }> };
    expect(roomInfo.type).toBe('room_info');
    expect(roomInfo.peers.some((p) => p.peerId === 'p1')).toBe(true);

    // ws1 should get peer_joined for Bob
    const p1Notification = waitForMessage(ws1);
    const notification = await p1Notification as { type: string; peerId: string };
    expect(notification.type).toBe('peer_joined');
    expect(notification.peerId).toBe('p2');
  });

  it('relays state changes to all peers in the room', async () => {
    relay = startRelay({ port: 0, heartbeatMs: 30_000, idleTimeoutMs: 60_000 });

    const ws1 = connectToRelay(relay.port, 'room-b');
    const ws2 = connectToRelay(relay.port, 'room-b');
    clients.push(ws1, ws2);

    await waitForOpen(ws1);
    await waitForOpen(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'room-b', peerId: 'p1', peerName: 'Alice', petState: 'idle' }));
    await waitForMessage(ws1); // consume room_info

    ws2.send(JSON.stringify({ type: 'join', room: 'room-b', peerId: 'p2', peerName: 'Bob', petState: 'idle' }));
    await waitForMessage(ws2); // consume room_info
    await waitForMessage(ws1); // consume peer_joined for Bob

    // Alice broadcasts state
    const statePromise = waitForMessage(ws2);
    ws1.send(JSON.stringify({ type: 'state', petState: 'working' }));

    const stateMsg = await statePromise as { type: string; peerId: string; petState: string };
    expect(stateMsg.type).toBe('state');
    expect(stateMsg.peerId).toBe('p1');
    expect(stateMsg.petState).toBe('working');
  });

  it('isolates rooms — peers in different rooms do not see each other', async () => {
    relay = startRelay({ port: 0, heartbeatMs: 30_000, idleTimeoutMs: 60_000 });

    const ws1 = connectToRelay(relay.port, 'room-x');
    const ws2 = connectToRelay(relay.port, 'room-y');
    clients.push(ws1, ws2);

    await waitForOpen(ws1);
    await waitForOpen(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'room-x', peerId: 'p1', peerName: 'Alice', petState: 'idle' }));
    ws2.send(JSON.stringify({ type: 'join', room: 'room-y', peerId: 'p2', peerName: 'Bob', petState: 'idle' }));

    // Both should get empty room_info (no other peers in their room)
    const info1 = await waitForMessage(ws1) as { type: string; peers: unknown[] };
    const info2 = await waitForMessage(ws2) as { type: string; peers: unknown[] };
    expect(info1.type).toBe('room_info');
    expect(info1.peers).toHaveLength(0);
    expect(info2.type).toBe('room_info');
    expect(info2.peers).toHaveLength(0);
  });

  it('broadcasts peer_left when a client disconnects', async () => {
    relay = startRelay({ port: 0, heartbeatMs: 30_000, idleTimeoutMs: 60_000 });

    const ws1 = connectToRelay(relay.port, 'room-c');
    const ws2 = connectToRelay(relay.port, 'room-c');
    clients.push(ws1, ws2);

    await waitForOpen(ws1);
    await waitForOpen(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'room-c', peerId: 'p1', peerName: 'Alice', petState: 'idle' }));
    ws2.send(JSON.stringify({ type: 'join', room: 'room-c', peerId: 'p2', peerName: 'Bob', petState: 'idle' }));
    await waitForMessage(ws2);
    await waitForMessage(ws1);

    // Alice disconnects
    const leftPromise = waitForMessage(ws2);
    ws1.close();

    const leftMsg = await leftPromise as { type: string; peerId: string };
    expect(leftMsg.type).toBe('peer_left');
    expect(leftMsg.peerId).toBe('p1');
  });

  it('relays mesh events (ci_red, milestone, etc.)', async () => {
    relay = startRelay({ port: 0, heartbeatMs: 30_000, idleTimeoutMs: 60_000 });

    const ws1 = connectToRelay(relay.port, 'room-d');
    const ws2 = connectToRelay(relay.port, 'room-d');
    clients.push(ws1, ws2);

    await waitForOpen(ws1);
    await waitForOpen(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'room-d', peerId: 'p1', peerName: 'Alice', petState: 'idle' }));
    ws2.send(JSON.stringify({ type: 'join', room: 'room-d', peerId: 'p2', peerName: 'Bob', petState: 'idle' }));
    await waitForMessage(ws2);
    await waitForMessage(ws1);

    const eventPromise = waitForMessage(ws2);
    ws1.send(JSON.stringify({ type: 'mesh_event', event: 'ci_red', data: { branch: 'main' } }));

    const eventMsg = await eventPromise as { type: string; peerId: string; event: string; data: Record<string, unknown> };
    expect(eventMsg.type).toBe('mesh_event');
    expect(eventMsg.peerId).toBe('p1');
    expect(eventMsg.event).toBe('ci_red');
    expect(eventMsg.data.branch).toBe('main');
  });
});
