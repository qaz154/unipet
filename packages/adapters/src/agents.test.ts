import { describe, it, expect } from 'vitest';
import {
  BUILTIN_AGENTS,
  createBuiltinAdapters,
  getAgentDefinition,
  listAgentIds,
  HookBasedAdapter,
} from './agents.js';

describe('Agent Registry', () => {
  it('defines 11 agents', () => {
    expect(BUILTIN_AGENTS).toHaveLength(11);
  });

  it('lists all agent ids', () => {
    const ids = listAgentIds();
    expect(ids).toContain('claude-code');
    expect(ids).toContain('codex');
    expect(ids).toContain('cursor');
    expect(ids).toContain('gemini');
    expect(ids).toContain('copilot');
    expect(ids).toContain('codebuddy');
    expect(ids).toContain('kiro');
    expect(ids).toContain('kimi');
    expect(ids).toContain('opencode');
    expect(ids).toContain('openclaw');
    expect(ids).toContain('hermes');
    expect(ids).toHaveLength(11);
  });

  it('getAgentDefinition returns correct agent', () => {
    const cc = getAgentDefinition('claude-code');
    expect(cc).toBeDefined();
    expect(cc!.name).toBe('Claude Code');
    expect(cc!.capabilities.permissionBubbles).toBe(true);
  });

  it('getAgentDefinition returns undefined for unknown id', () => {
    expect(getAgentDefinition('unknown')).toBeUndefined();
  });

  it('creates 11 adapter instances', () => {
    const adapters = createBuiltinAdapters();
    expect(adapters).toHaveLength(11);
    for (const adapter of adapters) {
      expect(adapter).toBeInstanceOf(HookBasedAdapter);
    }
  });

  it('each adapter has unique id', () => {
    const adapters = createBuiltinAdapters();
    const ids = adapters.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each adapter has at least one event mapping', () => {
    for (const agent of BUILTIN_AGENTS) {
      expect(Object.keys(agent.eventToState).length).toBeGreaterThan(0);
    }
  });

  it('claude-code adapter has advanced capabilities', () => {
    const cc = getAgentDefinition('claude-code')!;
    expect(cc.capabilities.pushStates).toBe(true);
    expect(cc.capabilities.permissionBubbles).toBe(true);
    expect(cc.capabilities.subagentDetection).toBe(true);
    expect(cc.capabilities.sessionEnd).toBe(true);
  });

  it('hook-based adapter processHookEvent emits correct state', () => {
    const adapter = new HookBasedAdapter(BUILTIN_AGENTS[0]); // claude-code
    const events: unknown[] = [];
    // Mock ctx
    (adapter as any).ctx = {
      emit: (e: unknown) => events.push(e),
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    };
    adapter.processHookEvent('UserPromptSubmit', {});
    expect(events).toHaveLength(1);
    expect((events[0] as any).state).toBe('thinking');
  });
});
