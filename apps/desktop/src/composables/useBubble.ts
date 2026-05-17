import { ref } from 'vue';

export type BubbleKind = 'speech' | 'permission';

export function useBubble(opts: { hideBubbles: () => boolean }) {
  const bubbleText = ref('');
  const bubbleVisible = ref('');
  const bubbleChars = ref('');
  const bubbleKind = ref<BubbleKind>('speech');
  const bubblePermissionId = ref('');
  const bubblePermissionTool = ref('');

  let typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    if (typewriterTimer) { clearTimeout(typewriterTimer); typewriterTimer = null; }
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  }

  function show(text: string) {
    if (opts.hideBubbles()) return;
    if (bubbleKind.value === 'permission' && bubblePermissionId.value) return;
    clearTimers();
    bubbleKind.value = 'speech';
    bubblePermissionId.value = '';
    bubbleVisible.value = text;
    bubbleChars.value = '';
    bubbleText.value = text;
    let i = 0;
    const speed = Math.max(20, 60 - text.length);
    const step = () => {
      if (i < text.length) { bubbleChars.value += text[i]; i++; typewriterTimer = setTimeout(step, speed); }
    };
    step();
    dismissTimer = setTimeout(() => {
      if (bubbleKind.value === 'speech') bubbleVisible.value = '';
    }, 2500 + text.length * 30);
  }

  function showPermission(permissionId: string, toolName: string, message: string) {
    clearTimers();
    bubbleKind.value = 'permission';
    bubblePermissionId.value = permissionId;
    bubblePermissionTool.value = toolName;
    bubbleVisible.value = message;
    bubbleChars.value = message;
  }

  function dismissPermission(action: string): { permissionId: string; action: string } | null {
    const permId = bubblePermissionId.value;
    if (!permId) return null;
    bubbleVisible.value = '';
    bubblePermissionId.value = '';
    bubbleKind.value = 'speech';
    return { permissionId: permId, action };
  }

  function destroy() {
    clearTimers();
  }

  return {
    bubbleText, bubbleVisible, bubbleChars, bubbleKind,
    bubblePermissionId, bubblePermissionTool,
    show, showPermission, dismissPermission, destroy,
  };
}
