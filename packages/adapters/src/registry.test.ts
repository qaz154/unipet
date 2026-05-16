import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdapterRegistry } from './registry.js';
import { EventBus } from '@unipet/core';
import type { AgentAdapter, AdapterContext } from './adapter.js';

function createMockAdapter(id: string): AgentAdapter {
  return {
    id,
    name: `Mock ${id}`,
    capabilities: {
      pushStates: true,
      mcpTools: false,
      permissionBubbles: false,
      subagentDetection: false,
      sessionEnd: false,
    },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    detect: vi.fn(async () => true),
    install: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
    health: vi.fn(async () => ({ healthy: true, message: 'OK' })),
  };
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;
  let bus: EventBus;

  beforeEach(() => {
    registry = new AdapterRegistry();
    bus = new EventBus();
  });

  it('registers and retrieves adapters', () => {
    const adapter = createMockAdapter('test');
    registry.register(adapter);
    expect(registry.get('test')).toBe(adapter);
  });

  it('throws on duplicate registration', () => {
    registry.register(createMockAdapter('test'));
    expect(() => registry.register(createMockAdapter('test'))).toThrow('already registered');
  });

  it('lists all registered adapters', () => {
    registry.register(createMockAdapter('a'));
    registry.register(createMockAdapter('b'));
    expect(registry.list()).toHaveLength(2);
    expect(registry.listIds()).toEqual(['a', 'b']);
  });

  it('starts a specific adapter', async () => {
    const adapter = createMockAdapter('test');
    registry.register(adapter);
    await registry.startAdapter('test', bus, { enabled: true, httpPort: 23333 });
    expect(adapter.start).toHaveBeenCalled();
    expect(registry.isActive('test')).toBe(true);
  });

  it('starts only enabled adapters', async () => {
    const a = createMockAdapter('a');
    const b = createMockAdapter('b');
    registry.register(a);
    registry.register(b);

    const result = await registry.startAll(bus, (id) => ({
      enabled: id === 'a',
      httpPort: 23333,
    }));

    expect(result.started).toEqual(['a']);
    expect(a.start).toHaveBeenCalled();
    expect(b.start).not.toHaveBeenCalled();
  });

  it('stops all active adapters', async () => {
    const a = createMockAdapter('a');
    const b = createMockAdapter('b');
    registry.register(a);
    registry.register(b);

    await registry.startAll(bus, () => ({ enabled: true, httpPort: 23333 }));
    await registry.stopAll();

    expect(a.stop).toHaveBeenCalled();
    expect(b.stop).toHaveBeenCalled();
    expect(registry.isActive('a')).toBe(false);
  });

  it('detects available agents', async () => {
    const a = createMockAdapter('a');
    a.detect = vi.fn(async () => true);
    const b = createMockAdapter('b');
    b.detect = vi.fn(async () => false);

    registry.register(a);
    registry.register(b);

    const results = await registry.detectAll();
    expect(results).toEqual({ a: true, b: false });
  });

  it('reports health of active adapters', async () => {
    const adapter = createMockAdapter('test');
    registry.register(adapter);
    await registry.startAdapter('test', bus, { enabled: true, httpPort: 23333 });

    const health = await registry.healthCheckAll();
    expect(health['test']).toEqual({ healthy: true, message: 'OK' });
  });
});
