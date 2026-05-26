import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useBubble } from '../composables/useBubble.js';

function makeBubble(hideBubbles = false) {
  return useBubble({ hideBubbles: () => hideBubbles });
}

describe('useBubble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows speech bubble and typewriter effect', () => {
    const bubble = makeBubble();
    bubble.show('Hello');

    expect(bubble.bubbleKind.value).toBe('speech');
    expect(bubble.bubbleVisible.value).toBe('Hello');
    // Typewriter starts empty and fills over time
    expect(bubble.bubbleChars.value.length).toBeLessThanOrEqual(1);
  });

  it('skips show when hideBubbles returns true', () => {
    const bubble = makeBubble(true);
    bubble.show('Hidden');

    expect(bubble.bubbleVisible.value).toBe('');
    expect(bubble.bubbleKind.value).toBe('speech');
  });

  it('shows permission bubble and returns correct dismiss result', () => {
    const bubble = makeBubble();
    bubble.showPermission('perm-1', 'Bash', 'Allow rm -rf?');

    expect(bubble.bubbleKind.value).toBe('permission');
    expect(bubble.bubblePermissionId.value).toBe('perm-1');
    expect(bubble.bubblePermissionTool.value).toBe('Bash');
    expect(bubble.bubbleVisible.value).toBe('Allow rm -rf?');

    const result = bubble.dismissPermission('allow');
    expect(result).toEqual({ permissionId: 'perm-1', action: 'allow' });
    expect(bubble.bubbleVisible.value).toBe('');
    expect(bubble.bubblePermissionId.value).toBe('');
  });

  it('dismissPermission returns null when no permission is active', () => {
    const bubble = makeBubble();
    expect(bubble.dismissPermission('deny')).toBeNull();
  });

  it('permission bubble blocks speech bubble', () => {
    const bubble = makeBubble();
    bubble.showPermission('p1', 'Tool', 'Question?');
    bubble.show('New message');

    // Permission should not be overridden by speech
    expect(bubble.bubbleKind.value).toBe('permission');
    expect(bubble.bubblePermissionId.value).toBe('p1');
  });

  it('destroy clears timers without error', () => {
    const bubble = makeBubble();
    bubble.show('Hello');
    expect(() => bubble.destroy()).not.toThrow();
  });
});
