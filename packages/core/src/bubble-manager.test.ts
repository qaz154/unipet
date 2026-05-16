import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.js';
import { BubbleManager, sanitizeBubbleText } from './bubble-manager.js';

describe('BubbleManager', () => {
  let bus: EventBus;
  let manager: BubbleManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new BubbleManager(bus, {
      maxSpeechLength: 140,
      notificationDurationMs: 100,
      speechCooldownMs: 50,
    });
  });

  it('creates a speech bubble', () => {
    const bubble = manager.addSpeech('test', 'Hello world!');
    expect(bubble).not.toBeNull();
    expect(bubble!.text).toBe('Hello world!');
    expect(bubble!.kind).toBe('speech');
  });

  it('rejects empty messages', () => {
    expect(manager.addSpeech('test', '')).toBeNull();
    expect(manager.addSpeech('test', '   ')).toBeNull();
  });

  it('truncates long messages', () => {
    const longMsg = 'This is a perfectly normal sentence that just happens to be very long because we need to test the truncation logic in the bubble manager module';
    const bubble = manager.addSpeech('test', longMsg);
    expect(bubble!.text.length).toBeLessThanOrEqual(140);
    expect(bubble!.text).toContain('…');
  });

  it('sanitizes URLs', () => {
    const bubble = manager.addSpeech('test', 'Check https://example.com for info');
    expect(bubble!.text).toContain('[url]');
    expect(bubble!.text).not.toContain('https://');
  });

  it('sanitizes file paths', () => {
    const bubble = manager.addSpeech('test', 'File at /home/user/secret.txt');
    expect(bubble!.text).toContain('[path]');
  });

  it('redacts all occurrences within one message (multi-match)', () => {
    const out = sanitizeBubbleText('Visit https://a.com and https://b.com');
    expect(out).toBe('Visit [url] and [url]');
  });

  it('keeps the secret keyword visible but redacts the value', () => {
    const out = sanitizeBubbleText('api_key=abcdef token=xyz');
    expect(out).toContain('api_key');
    expect(out).toContain('[secret]');
    expect(out).not.toContain('abcdef');
    expect(out).not.toContain('xyz');
  });

  it('redacts Windows file paths', () => {
    const out = sanitizeBubbleText('Wrote C:\\Users\\bob\\secrets.txt');
    expect(out).toContain('[path]');
    expect(out).not.toContain('bob');
  });

  it('enforces cooldown per source', () => {
    const b1 = manager.addSpeech('agent-a', 'First');
    expect(b1).not.toBeNull();

    const b2 = manager.addSpeech('agent-a', 'Second');
    expect(b2).toBeNull(); // cooldown active
  });

  it('allows different sources during cooldown', () => {
    manager.addSpeech('agent-a', 'First');
    const b2 = manager.addSpeech('agent-b', 'Second');
    expect(b2).not.toBeNull();
  });

  it('creates notification bubbles', () => {
    const bubble = manager.addNotification('Build complete', 'test');
    expect(bubble.kind).toBe('notification');
    expect(bubble.expiresAt).not.toBeNull();
  });

  it('dismisses bubbles', () => {
    const bubble = manager.addSpeech('test', 'Hello');
    expect(manager.activeBubbles).toHaveLength(1);

    manager.dismiss(bubble!.id);
    expect(manager.activeBubbles).toHaveLength(0);
  });

  it('dismisses all bubbles', () => {
    manager.addNotification('A', 'test');
    manager.addNotification('B', 'test');
    expect(manager.activeBubbles.length).toBeGreaterThan(0);

    manager.dismissAll();
    expect(manager.activeBubbles).toHaveLength(0);
  });

  it('enforces max bubble limit', () => {
    const mgr = new BubbleManager(bus, { maxBubbles: 2, speechCooldownMs: 0 });
    mgr.addNotification('A', 'test');
    mgr.addNotification('B', 'test');
    mgr.addNotification('C', 'test');

    expect(mgr.activeBubbles.length).toBeLessThanOrEqual(2);
  });

  it('creates bubbles from speech events on the bus', () => {
    bus.emit({
      type: 'speech',
      source: 'test',
      message: 'Hello from event!',
      timestamp: Date.now(),
    });

    expect(manager.activeBubbles).toHaveLength(1);
    expect(manager.activeBubbles[0].text).toBe('Hello from event!');
  });

  it('notifies bubble listeners', () => {
    const listener = vi.fn();
    manager.onBubble(listener);

    manager.addSpeech('test', 'Hello');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].text).toBe('Hello');
  });
});
