import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MeshClient, type WebSocketLike } from './mesh-client.js';

function createMockWs(): WebSocketLike & { sent: string[]; listeners: Record<string, ((...args: unknown[]) => void) | null> } {
  const ws: WebSocketLike & { sent: string[]; listeners: Record<string, ((...args: unknown[]) => void) | null> } = {
    readyState: 0,
    sent: [],
    listeners: {},
    send(data: string) { ws.sent.push(data); },
    close() { ws.readyState = 3; ws.listeners.onclose?.(); },
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
  };
  return ws;
}

describe('MeshClient', () => {
  let ws: ReturnType<typeof createMockWs>;
  let client: MeshClient;

  beforeEach(() => {
    ws = createMockWs();
    client = new MeshClient({
      relayUrl: 'ws://localhost:9999',
      room: 'test-room',
      peerName: 'tester',
      wsFactory: () => ws,
    });
  });

  afterEach(() => {
    client.destroy();
  });

  it('sends join message on connect', () => {
    client.connect();
    // Simulate WebSocket open
    ws.readyState = 1;
    ws.listeners.onopen = ws.onopen;
    ws.onopen?.();

    expect(ws.sent).toHaveLength(1);
    const join = JSON.parse(ws.sent[0]!);
    expect(join.type).toBe('join');
    expect(join.room).toBe('test-room');
    expect(join.peerName).toBe('tester');
    expect(typeof join.peerId).toBe('string');
  });

  it('emits connected event on open', () => {
    const listener = vi.fn();
    client.on(listener);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    expect(listener).toHaveBeenCalledWith('connected', expect.objectContaining({
      peerId: expect.any(String),
      room: 'test-room',
    }));
  });

  it('broadcasts state changes', () => {
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    client.broadcastState('working');
    expect(ws.sent).toHaveLength(2); // join + state
    const state = JSON.parse(ws.sent[1]!);
    expect(state.type).toBe('state');
    expect(state.petState).toBe('working');
  });

  it('broadcasts speech', () => {
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    client.broadcastSay('Hello peers!');
    const msg = JSON.parse(ws.sent[1]!);
    expect(msg.type).toBe('say');
    expect(msg.message).toBe('Hello peers!');
  });

  it('broadcasts mesh events', () => {
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    client.broadcastEvent('ci_red', { branch: 'main' });
    const msg = JSON.parse(ws.sent[1]!);
    expect(msg.type).toBe('mesh_event');
    expect(msg.event).toBe('ci_red');
    expect(msg.data).toEqual({ branch: 'main' });
  });

  it('handles peer_joined messages', () => {
    const listener = vi.fn();
    client.on(listener);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    ws.onmessage?.({ data: JSON.stringify({ type: 'peer_joined', peerId: 'p1', peerName: 'Alice', petState: 'working' }) });

    expect(listener).toHaveBeenCalledWith('peer_joined', expect.objectContaining({
      peerId: 'p1',
      peerName: 'Alice',
      petState: 'working',
    }));
    expect(client.getPeers()).toHaveLength(1);
  });

  it('handles peer state updates', () => {
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    // First join the peer
    ws.onmessage?.({ data: JSON.stringify({ type: 'peer_joined', peerId: 'p1', peerName: 'Alice', petState: 'idle' }) });

    const listener = vi.fn();
    client.on(listener);

    // Then update state
    ws.onmessage?.({ data: JSON.stringify({ type: 'state', peerId: 'p1', petState: 'thinking' }) });

    expect(listener).toHaveBeenCalledWith('peer_state', expect.objectContaining({
      peerId: 'p1',
      petState: 'thinking',
    }));
    expect(client.getPeers()[0]?.petState).toBe('thinking');
  });

  it('handles peer_left messages', () => {
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    ws.onmessage?.({ data: JSON.stringify({ type: 'peer_joined', peerId: 'p1', peerName: 'Alice', petState: 'idle' }) });
    expect(client.getPeers()).toHaveLength(1);

    ws.onmessage?.({ data: JSON.stringify({ type: 'peer_left', peerId: 'p1' }) });
    expect(client.getPeers()).toHaveLength(0);
  });

  it('handles room_info with existing peers', () => {
    const listener = vi.fn();
    client.on(listener);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'room_info',
        peers: [
          { peerId: 'p1', peerName: 'Alice', petState: 'working' },
          { peerId: 'p2', peerName: 'Bob', petState: 'idle' },
        ],
      }),
    });

    expect(client.getPeers()).toHaveLength(2);
    expect(listener).toHaveBeenCalledWith('connected', expect.objectContaining({ peers: 2 }));
  });

  it('handles peer_say messages', () => {
    const listener = vi.fn();
    client.on(listener);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    ws.onmessage?.({ data: JSON.stringify({ type: 'say', peerId: 'p1', message: 'Hello!' }) });

    expect(listener).toHaveBeenCalledWith('peer_say', { peerId: 'p1', message: 'Hello!' });
  });

  it('handles mesh_event messages', () => {
    const listener = vi.fn();
    client.on(listener);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    ws.onmessage?.({ data: JSON.stringify({ type: 'mesh_event', peerId: 'p1', event: 'ci_red' }) });

    expect(listener).toHaveBeenCalledWith('mesh_event', { peerId: 'p1', event: 'ci_red', data: undefined });
  });

  it('reports connected status', () => {
    expect(client.isConnected()).toBe(false);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();
    expect(client.isConnected()).toBe(true);
  });

  it('does not send after destroy', () => {
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();
    client.destroy();

    client.broadcastState('working');
    // Only join message should have been sent (before destroy)
    expect(ws.sent).toHaveLength(1);
  });

  it('ignores messages from self', () => {
    const listener = vi.fn();
    client.on(listener);
    client.connect();
    ws.readyState = 1;
    ws.onopen?.();

    const peerId = client.getPeerId();
    ws.onmessage?.({ data: JSON.stringify({ type: 'peer_joined', peerId, peerName: 'me', petState: 'idle' }) });

    // Self should not appear in peers
    expect(client.getPeers()).toHaveLength(0);
  });
});
