import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.js';
import { StateManager } from './state-manager.js';
import { createStateEvent } from './events.js';

describe('StateManager', () => {
  let bus: EventBus;
  let manager: StateManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new StateManager(bus, {
      oneshotDurationMs: 100,
      idleTimeoutMs: 200,
      sleepSequence: 'direct',
    });
  });

  it('starts in idle state', () => {
    expect(manager.state).toBe('idle');
  });

  it('updates state when session is updated', () => {
    manager.updateSession('s1', 'claude-code', 'working');
    expect(manager.state).toBe('working');
  });

  it('picks highest priority state across sessions', () => {
    manager.updateSession('s1', 'claude-code', 'working');
    manager.updateSession('s2', 'codex', 'error');
    expect(manager.state).toBe('error'); // error has higher priority
  });

  it('drops to idle when all sessions removed', () => {
    manager.updateSession('s1', 'claude-code', 'working');
    expect(manager.state).toBe('working');

    manager.removeSession('s1');
    expect(manager.state).toBe('idle');
  });

  it('ignores headless sessions for state resolution', () => {
    manager.updateSession('s1', 'claude-code', 'error', true); // headless
    expect(manager.state).toBe('idle');
  });

  it('suspends state transitions', () => {
    manager.updateSession('s1', 'claude-code', 'working');
    manager.suspend();

    manager.updateSession('s2', 'codex', 'error');
    expect(manager.state).toBe('working'); // not updated
  });

  it('resumes state transitions', () => {
    manager.updateSession('s1', 'claude-code', 'working');
    manager.suspend();
    manager.updateSession('s2', 'codex', 'error');

    manager.resume();
    expect(manager.state).toBe('error');
  });

  it('notifies listeners on state change', () => {
    const listener = vi.fn();
    manager.onChange(listener);

    manager.updateSession('s1', 'claude-code', 'working');

    expect(listener).toHaveBeenCalledWith('working', 'idle', 'resolution');
  });

  it('auto-returns from oneshot states', async () => {
    manager.updateSession('s1', 'claude-code', 'working');

    // Simulate attention (oneshot)
    manager.updateSession('s1', 'claude-code', 'attention');
    expect(manager.state).toBe('attention');

    // Wait for oneshot timeout
    await new Promise((r) => setTimeout(r, 150));
    expect(manager.state).toBe('working');
  });

  it('transitions to sleeping on idle timeout', async () => {
    manager.updateSession('s1', 'claude-code', 'working');
    manager.removeSession('s1');

    // Wait for idle timeout + direct sleep
    await new Promise((r) => setTimeout(r, 300));
    expect(manager.state).toBe('sleeping');
  });

  it('wakes from sleep', async () => {
    manager.updateSession('s1', 'claude-code', 'working');
    manager.removeSession('s1');
    await new Promise((r) => setTimeout(r, 300));
    expect(manager.state).toBe('sleeping');

    manager.wake();
    expect(manager.state).toBe('waking');

    await new Promise((r) => setTimeout(r, 1100));
    expect(manager.state).toBe('idle');
  });

  it('processes events from the bus', () => {
    bus.emit(createStateEvent('claude-code', 'working', { sessionId: 's1' }));
    expect(manager.state).toBe('working');
  });

  it('resets to idle', () => {
    manager.updateSession('s1', 'claude-code', 'error');
    manager.reset();
    expect(manager.state).toBe('idle');
    expect(manager.activeSessions).toHaveLength(0);
  });
});
