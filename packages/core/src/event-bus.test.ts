import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';
import { createStateEvent, createSpeechEvent } from './events.js';

describe('EventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on(handler);

    const event = createStateEvent('test', 'working');
    bus.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('supports multiple subscribers', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on(h1);
    bus.on(h2);

    bus.emit(createStateEvent('test', 'idle'));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes correctly', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on(handler);

    unsub();
    bus.emit(createStateEvent('test', 'idle'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('filters events by predicate', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on(handler, (e) => e.type === 'speech');

    bus.emit(createStateEvent('test', 'idle'));
    expect(handler).not.toHaveBeenCalled();

    bus.emit(createSpeechEvent('test', 'hello'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('onType filters by event type', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onType('state_change', handler);

    bus.emit(createSpeechEvent('test', 'hello'));
    expect(handler).not.toHaveBeenCalled();

    bus.emit(createStateEvent('test', 'working'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('once auto-unsubscribes after first call', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once(handler);

    bus.emit(createStateEvent('test', 'idle'));
    bus.emit(createStateEvent('test', 'working'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('records event history', () => {
    const bus = new EventBus({ maxHistory: 10 });

    for (let i = 0; i < 15; i++) {
      bus.emit(createStateEvent('test', 'idle'));
    }

    const history = bus.getHistory();
    expect(history.length).toBeLessThanOrEqual(10);
  });

  it('filters history by source', () => {
    const bus = new EventBus();
    bus.emit(createStateEvent('agent-a', 'idle'));
    bus.emit(createStateEvent('agent-b', 'working'));
    bus.emit(createStateEvent('agent-a', 'error'));

    const aHistory = bus.getHistoryBySource('agent-a');
    expect(aHistory).toHaveLength(2);
    expect(aHistory.every((e) => e.source === 'agent-a')).toBe(true);
  });

  it('clear removes all subscriptions and history', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on(handler);
    bus.emit(createStateEvent('test', 'idle'));
    expect(bus.getHistory()).toHaveLength(1);

    bus.clear();

    // History was cleared
    expect(bus.getHistory()).toHaveLength(0);
    // New events still record history
    bus.emit(createStateEvent('test', 'working'));
    expect(handler).toHaveBeenCalledTimes(1); // only the first emit (before clear)
    expect(bus.subscriberCount).toBe(0);
  });

  it('reports subscriber count', () => {
    const bus = new EventBus();
    expect(bus.subscriberCount).toBe(0);

    const unsub1 = bus.on(vi.fn());
    expect(bus.subscriberCount).toBe(1);

    bus.on(vi.fn());
    expect(bus.subscriberCount).toBe(2);

    unsub1();
    expect(bus.subscriberCount).toBe(1);
  });
});
