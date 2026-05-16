import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPAdapter } from './adapter.js';
import { EventBus } from '@unipet/core';
import type { AdapterContext } from '../adapter.js';

describe('MCPAdapter', () => {
  let adapter: MCPAdapter;
  let emittedEvents: unknown[];

  beforeEach(() => {
    adapter = new MCPAdapter();
    emittedEvents = [];
    const bus = new EventBus();
    bus.on((e) => emittedEvents.push(e));
    const ctx: AdapterContext = {
      emit: (event) => bus.emit(event),
      getConfig: () => ({ enabled: true, httpPort: 23333 }),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      bus,
    };
    adapter.start(ctx);
  });

  it('has correct id and capabilities', () => {
    expect(adapter.id).toBe('mcp');
    expect(adapter.capabilities.mcpTools).toBe(true);
  });

  it('handles status request', () => {
    const status = adapter.handleStatus();
    expect(status.running).toBe(true);
    expect(status.leaseActive).toBe(false);
  });

  it('handles react with valid reaction', () => {
    const result = adapter.handleReact('working');
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
  });

  it('rejects invalid reaction', () => {
    const result = adapter.handleReact('invalid-state');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or disallowed reaction');
  });

  it('handles say with valid message', () => {
    const result = adapter.handleSay('Hello!');
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
    expect((emittedEvents[0] as { message?: string }).message).toBe('Hello!');
  });

  it('rejects empty message', () => {
    expect(adapter.handleSay('').success).toBe(false);
  });

  it('rejects message over 140 chars', () => {
    expect(adapter.handleSay('a'.repeat(141)).success).toBe(false);
  });

  it('rejects multiline message', () => {
    expect(adapter.handleSay('line1\nline2').success).toBe(false);
  });

  it('handles move with valid target', () => {
    const result = adapter.handleMove('corner-br');
    expect(result.success).toBe(true);
    expect(emittedEvents).toHaveLength(1);
  });

  it('rejects invalid move target', () => {
    const result = adapter.handleMove('nowhere');
    expect(result.success).toBe(false);
  });

  it('defines 4 tools', () => {
    const tools = adapter.getToolDefinitions();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      'unipet_status', 'unipet_react', 'unipet_say', 'unipet_move',
    ]);
  });

  it('lease lifecycle', () => {
    expect(adapter.handleStatus().leaseActive).toBe(false);
    adapter.acquireLease('my-pet');
    expect(adapter.handleStatus().leaseActive).toBe(true);
    expect(adapter.handleStatus().petId).toBe('my-pet');
    adapter.releaseLease();
    expect(adapter.handleStatus().leaseActive).toBe(false);
  });
});
