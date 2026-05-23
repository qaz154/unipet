import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, type PetEvent } from '@unipet/core';
import { PerceptionAdapter, mapActivityToState } from './adapter.js';
import type { AdapterContext } from '../adapter.js';

function makeCtx(overrides: Record<string, unknown> = {}) {
  const bus = new EventBus();
  const events: PetEvent[] = [];
  bus.on((e) => events.push(e));
  const ctx: AdapterContext = {
    emit: (event) => bus.emit(event),
    getConfig: () => ({ enabled: true, httpPort: 23333, overrides }),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    bus,
  };
  return { ctx, events };
}

describe('mapActivityToState', () => {
  it('maps known activities to canonical pet states', () => {
    expect(mapActivityToState('coding')).toBe('working');
    expect(mapActivityToState('debugging')).toBe('thinking');
    expect(mapActivityToState('testing')).toBe('testing');
    expect(mapActivityToState('idle')).toBe('idle');
    expect(mapActivityToState('error')).toBe('error');
  });

  it('normalises whitespace and dashes before matching', () => {
    expect(mapActivityToState('Running Tests')).toBe('testing');
    expect(mapActivityToState('running-tests')).toBe('testing');
  });

  it('falls back to idle for unknown activities', () => {
    expect(mapActivityToState('staring-out-window')).toBe('idle');
    expect(mapActivityToState('')).toBe('idle');
  });
});

describe('PerceptionAdapter capabilities', () => {
  it('reports pushStates and identifies itself', () => {
    const adapter = new PerceptionAdapter();
    expect(adapter.id).toBe('perception');
    expect(adapter.capabilities.pushStates).toBe(true);
    expect(adapter.capabilities.mcpTools).toBe(false);
  });
});

describe('PerceptionAdapter detect', () => {
  it('returns false when endpoint or apiKey is missing', async () => {
    const adapter = new PerceptionAdapter();
    const { ctx } = makeCtx({ endpoint: 'https://api.example.com' });
    await adapter.start(ctx);

    expect(await adapter.detect()).toBe(false);

    await adapter.stop();
  });

  it('returns true once endpoint and apiKey are configured', async () => {
    const adapter = new PerceptionAdapter();
    const { ctx } = makeCtx({ endpoint: 'https://api.example.com', apiKey: 'k' });
    await adapter.start(ctx);

    expect(await adapter.detect()).toBe(true);

    await adapter.stop();
  });
});

describe('PerceptionAdapter health', () => {
  let adapter: PerceptionAdapter;

  beforeEach(() => {
    adapter = new PerceptionAdapter();
  });

  afterEach(async () => {
    await adapter.stop();
  });

  it('reports missing endpoint as unhealthy', async () => {
    const { ctx } = makeCtx({ listenPort: 0 });
    await adapter.start(ctx);

    const status = await adapter.health();
    expect(status.healthy).toBe(false);
    expect(status.message).toContain('endpoint');
  });

  it('reports missing apiKey as unhealthy even when endpoint is set', async () => {
    const { ctx } = makeCtx({ endpoint: 'https://api.example.com', listenPort: 0 });
    await adapter.start(ctx);

    const status = await adapter.health();
    expect(status.healthy).toBe(false);
    expect(status.message).toContain('API key');
  });

  it('reports OK when endpoint, apiKey, and listening server are all present', async () => {
    const { ctx } = makeCtx({
      endpoint: 'https://api.example.com',
      apiKey: 'k',
      listenPort: 0,
    });
    await adapter.start(ctx);

    const status = await adapter.health();
    expect(status.healthy).toBe(true);
    expect(status.message).toBe('OK');
  });
});
