import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPAdapter } from './adapter.js';
import { EventBus } from '@unipet/core';
import type { AdapterContext } from '../adapter.js';

describe('HTTPAdapter', () => {
  let adapter: HTTPAdapter;
  let emittedEvents: unknown[];

  beforeEach(() => {
    adapter = new HTTPAdapter();
    emittedEvents = [];
    const bus = new EventBus();
    bus.on((e) => emittedEvents.push(e));
    const ctx: AdapterContext = {
      emit: (event) => bus.emit(event),
      getConfig: () => ({ enabled: true, httpPort: 23333, overrides: { port: 23333 } }),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      bus,
    };
    adapter.start(ctx);
  });

  it('has correct id and capabilities', () => {
    expect(adapter.id).toBe('http');
    expect(adapter.capabilities.pushStates).toBe(true);
    expect(adapter.capabilities.mcpTools).toBe(false);
  });

  it('processes valid state request', () => {
    const result = adapter.processStateRequest({ state: 'working', sessionId: 's1' });
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
  });

  it('rejects missing state', () => {
    const result = adapter.processStateRequest({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing state');
  });

  it('rejects invalid state', () => {
    const result = adapter.processStateRequest({ state: 'not-a-state' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or disallowed state: not-a-state');
  });

  it('processes valid speech request', () => {
    const result = adapter.processSpeechRequest({ message: 'Hello!' });
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
  });

  it('rejects missing message', () => {
    const result = adapter.processSpeechRequest({});
    expect(result.success).toBe(false);
  });

  it('processes valid emotion request', () => {
    const result = adapter.processEmotionRequest({
      emotion: { valence: 0.5, arousal: 0.3, dominance: 0.7 },
    });
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
  });

  it('rejects invalid emotion vector', () => {
    const result = adapter.processEmotionRequest({
      emotion: { valence: 5, arousal: 0, dominance: 0 },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid emotion');
  });

  it('processes valid move request', () => {
    const result = adapter.processMoveRequest({ target: 'center' });
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
  });

  it('rejects invalid move target', () => {
    const result = adapter.processMoveRequest({ target: 'nowhere' });
    expect(result.success).toBe(false);
  });

  it('returns status', () => {
    const status = adapter.getStatus();
    expect(status.running).toBe(true);
    expect(status.port).toBe(23333);
  });

  it('manages SSE clients', () => {
    const write = vi.fn();
    const close = vi.fn();
    adapter.addSSEClient(write, close);
    expect(adapter.getStatus().sseClients).toBe(1);

    adapter.removeSSEClient(write);
    expect(adapter.getStatus().sseClients).toBe(0);
  });
});
